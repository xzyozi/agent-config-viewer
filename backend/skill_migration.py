from __future__ import annotations

import hashlib
import os
import re
import stat
from pathlib import Path, PurePosixPath

MAX_BUNDLE_FILES = 256
MAX_BUNDLE_BYTES = 8 * 1024 * 1024
TEXT_SUFFIXES = {".cjs", ".js", ".md", ".mjs", ".py", ".sh", ".txt"}
MARKDOWN_LINK = re.compile(r"!?\[[^\]\r\n]*\]\(([^\s)]+)(?:\s+[^)]*)?\)")
KIRO_FILE_REFERENCE = re.compile(r"#\[\[file:([^\]\r\n]+)\]\]")
EXPLICIT_BUNDLE_REFERENCE = re.compile(r"(?<![A-Za-z0-9_.\-/])((?:references|scripts|assets)/[A-Za-z0-9._/@+() \-]+)")


class SkillMigrationError(Exception):
    """Exposes only the fixed error code allowed by the local HTTP interface."""

    def __init__(self, code: str = "read_failed") -> None:
        self.code = code


def plan_skill_migration(file_id: str, file_path: Path, allowed_root: Path, home_root: Path) -> dict[str, object]:
    """Build a read-only migration plan for one direct child of .kiro/skills."""
    bundle_root, skills_root = validate_skill_root(file_path, allowed_root, home_root)
    files = list_bundle_files(bundle_root)
    raw_files = read_bundle_files(files, bundle_root)
    file_paths = set(raw_files)
    references: list[dict[str, object]] = []
    warnings: list[dict[str, str]] = []
    digest = hashlib.sha256()

    for relative_path, content in raw_files.items():
        digest.update(relative_path.encode("utf-8"))
        digest.update(b"\0")
        digest.update(content)
        digest.update(b"\0")
        if not is_text_candidate(relative_path):
            warnings.append({"path": relative_path, "reason": "excluded_kind"})
            continue
        try:
            text = content.decode("utf-8")
        except UnicodeDecodeError:
            if relative_path == "SKILL.md":
                raise SkillMigrationError() from None
            warnings.append({"path": relative_path, "reason": "not_utf8"})
            continue
        references.extend(find_references(relative_path, text, file_paths))

    summary = {
        "detected": len(references),
        "updatable": sum(reference["status"] == "updatable" for reference in references),
        "notUpdated": sum(reference["status"] != "updatable" for reference in references),
        "unresolved": sum(reference["status"] in {"missing", "outside_bundle", "ambiguous"} for reference in references),
    }
    return {
        "fileId": file_id,
        "bundlePath": f"{allowed_root.name}/{bundle_root.relative_to(allowed_root).as_posix()}",
        "snapshotDigest": digest.hexdigest(),
        "summary": summary,
        "references": references,
        "warnings": warnings,
    }


def validate_skill_root(file_path: Path, allowed_root: Path, home_root: Path) -> tuple[Path, Path]:
    expected_root = home_root / ".kiro"
    try:
        if is_path_link(expected_root) or is_path_link(file_path) or is_path_link(file_path.parent):
            raise SkillMigrationError()
        resolved_root = expected_root.resolve(strict=True)
        if allowed_root != resolved_root:
            raise SkillMigrationError()
        skills_candidate = resolved_root / "skills"
        if is_path_link(skills_candidate):
            raise SkillMigrationError()
        skills_root = skills_candidate.resolve(strict=True)
        resolved_file = file_path.resolve(strict=True)
    except SkillMigrationError:
        raise
    except OSError:
        raise SkillMigrationError() from None
    if (
        resolved_root.name != ".kiro"
        or file_path.name != "SKILL.md"
        or not skills_root.is_dir()
        or resolved_file.parent.parent != skills_root
        or not is_within(resolved_file, skills_root)
    ):
        raise SkillMigrationError()
    bundle_root = resolved_file.parent
    if is_path_link(bundle_root):
        raise SkillMigrationError()
    return bundle_root, skills_root


def list_bundle_files(bundle_root: Path) -> list[Path]:
    files: list[Path] = []

    def walk(directory: Path) -> None:
        try:
            with os.scandir(directory) as entries:
                for entry in sorted(entries, key=lambda item: item.name.casefold()):
                    if entry_is_link(entry):
                        raise SkillMigrationError()
                    entry_path = Path(entry.path)
                    if entry.is_dir(follow_symlinks=False):
                        walk(entry_path)
                    elif entry.is_file(follow_symlinks=False):
                        files.append(entry_path)
                    else:
                        raise SkillMigrationError()
        except SkillMigrationError:
            raise
        except OSError:
            raise SkillMigrationError() from None

    walk(bundle_root)
    if not files or len(files) > MAX_BUNDLE_FILES:
        raise SkillMigrationError()
    return files


def read_bundle_files(files: list[Path], bundle_root: Path) -> dict[str, bytes]:
    total_bytes = 0
    result: dict[str, bytes] = {}
    for file_path in files:
        try:
            if is_path_link(file_path):
                raise SkillMigrationError()
            resolved = file_path.resolve(strict=True)
            if not resolved.is_file() or not is_within(resolved, bundle_root):
                raise SkillMigrationError()
            content = resolved.read_bytes()
        except SkillMigrationError:
            raise
        except OSError:
            raise SkillMigrationError() from None
        total_bytes += len(content)
        if total_bytes > MAX_BUNDLE_BYTES:
            raise SkillMigrationError()
        relative_path = resolved.relative_to(bundle_root).as_posix()
        result[relative_path] = content
    return result


def is_text_candidate(relative_path: str) -> bool:
    path = PurePosixPath(relative_path)
    return path.name.casefold() in {"readme", "readme.md", "skill.md"} or path.suffix.casefold() in TEXT_SUFFIXES


def find_references(source_path: str, text: str, file_paths: set[str]) -> list[dict[str, object]]:
    references: list[dict[str, object]] = []
    for line_number, line in enumerate(text.splitlines(), start=1):
        consumed: list[tuple[int, int]] = []
        for kind, pattern in (("markdown", MARKDOWN_LINK), ("kiro_file", KIRO_FILE_REFERENCE)):
            for match in pattern.finditer(line):
                start, end = match.span(1)
                consumed.append((start, end))
                references.append(reference_record(source_path, line_number, kind, match.group(1), file_paths))
        for match in EXPLICIT_BUNDLE_REFERENCE.finditer(line):
            start, end = match.span(1)
            if any(start < used_end and end > used_start for used_start, used_end in consumed):
                continue
            references.append(reference_record(source_path, line_number, "explicit", match.group(1), file_paths))
    return references


def reference_record(source_path: str, line_number: int, kind: str, target: str, file_paths: set[str]) -> dict[str, object]:
    cleaned_target = target.strip().strip("`'\"<>")
    status, resolved_path, reason = classify_target(source_path, cleaned_target, file_paths)
    return {
        "sourcePath": source_path,
        "line": line_number,
        "kind": kind,
        "target": cleaned_target,
        "status": status,
        "resolvedPath": resolved_path,
        "reason": reason,
    }


def classify_target(source_path: str, target: str, file_paths: set[str]) -> tuple[str, str | None, str | None]:
    if not target or target.startswith("#") or "://" in target or target.startswith(("mailto:", "data:")):
        return "external", None, "external_reference"
    if target.startswith(("/", "~")) or re.match(r"^[A-Za-z]:[\\/]", target) or "\\" in target:
        return "external", None, "environment_dependent_path"
    path_without_fragment = target.split("#", 1)[0]
    if "?" in path_without_fragment:
        return "external", None, "query_reference"
    target_path = PurePosixPath(path_without_fragment)
    if any(part == ".." for part in target_path.parts):
        return "outside_bundle", None, "parent_traversal"
    resolved = normalize_relative_path(PurePosixPath(source_path).parent, target_path)
    if resolved is None:
        return "outside_bundle", None, "invalid_relative_path"
    resolved_path = resolved.as_posix()
    if resolved_path in file_paths:
        return "updatable", resolved_path, None
    return "missing", None, "target_not_found"


def normalize_relative_path(parent: PurePosixPath, target: PurePosixPath) -> PurePosixPath | None:
    parts: list[str] = []
    for part in (*parent.parts, *target.parts):
        if part in {"", "."}:
            continue
        if part == "..":
            if not parts:
                return None
            parts.pop()
            continue
        parts.append(part)
    return PurePosixPath(*parts) if parts else None


def is_within(path: Path, parent: Path) -> bool:
    try:
        path.relative_to(parent)
        return True
    except ValueError:
        return False


def entry_is_link(entry: os.DirEntry[str]) -> bool:
    attributes = getattr(entry.stat(follow_symlinks=False), "st_file_attributes", 0)
    reparse_point = getattr(stat, "FILE_ATTRIBUTE_REPARSE_POINT", 0)
    return entry.is_symlink() or bool(attributes & reparse_point)


def is_path_link(path: Path) -> bool:
    try:
        attributes = getattr(path.lstat(), "st_file_attributes", 0)
    except OSError:
        raise SkillMigrationError() from None
    reparse_point = getattr(stat, "FILE_ATTRIBUTE_REPARSE_POINT", 0)
    return path.is_symlink() or bool(attributes & reparse_point)
