from __future__ import annotations

import os
import secrets
import stat
from pathlib import Path, PurePosixPath

BACKUP_SUFFIXES = frozenset({".bak", ".backup", ".old", ".orig", ".swp", ".swo"})
EXCLUDED_DIRECTORY_NAMES = frozenset({".git", "__pycache__", "error_mv", "logs", "session-index", "sessions", "tmp"})
SENSITIVE_FILE_NAMES = frozenset({"db_config.ini", "futagawa2.ini", "tantai_db.ini"})
SENSITIVE_TOKENS = ("credential", "password", "private", "secret", "token")
BINARY_SUFFIXES = frozenset(
    {
        ".7z",
        ".avi",
        ".bin",
        ".dll",
        ".gif",
        ".gz",
        ".ico",
        ".jpeg",
        ".jpg",
        ".mov",
        ".mp3",
        ".mp4",
        ".pdf",
        ".png",
        ".pyc",
        ".sqlite",
        ".tar",
        ".webp",
        ".woff",
        ".woff2",
        ".zip",
    }
)
KIND_BY_SUFFIX = {
    ".cjs": "javascript",
    ".css": "css",
    ".html": "html",
    ".js": "javascript",
    ".json": "json",
    ".md": "markdown",
    ".mjs": "javascript",
    ".py": "python",
    ".sh": "shell",
    ".toml": "toml",
    ".txt": "text",
    ".yaml": "yaml",
    ".yml": "yaml",
}
SAMPLE_BYTES = 512
DirectoryRecord = tuple[Path, Path, str, str, str]


def scan_provider(
    specification: dict[str, object],
    home_root: Path,
    next_id: list[int],
    file_index: dict[str, tuple[Path, Path]],
    directory_index: dict[str, DirectoryRecord],
    max_readable_bytes: int,
) -> dict[str, object]:
    tree = directory_node(str(specification["label"]), str(specification["id"]), loaded=True)
    file_entries: list[dict[str, object]] = []
    found_source = False
    errors: list[str] = []
    for source in specification["sources"]:
        scope = str(source["scope"])
        source_root = home_root / str(source["root"])
        display_root = str(source["displayRoot"])
        try:
            if source.get("files"):
                source_node = directory_node(display_root, display_root, loaded=True)
                source_found = scan_fixed_files(
                    source,
                    source_root,
                    home_root,
                    display_root,
                    scope,
                    str(specification["id"]),
                    source_node,
                    file_entries,
                    next_id,
                    file_index,
                    max_readable_bytes,
                )
            else:
                source_found, source_node = scan_directory_root(
                    source_root,
                    display_root,
                    scope,
                    str(specification["id"]),
                    file_entries,
                    next_id,
                    file_index,
                    directory_index,
                    max_readable_bytes,
                    home_root,
                )
            if source_found:
                tree["children"].append(source_node)
                found_source = True
        except PermissionError:
            errors.append("permission_denied")
        except OSError:
            errors.append("list_failed")
    sort_tree(tree)
    file_entries.sort(key=lambda entry: str(entry["relativePath"]).casefold())
    status = "ok" if found_source else errors[0] if errors else "not_found"
    return {
        "providerId": specification["id"],
        "label": specification["label"],
        "status": status,
        "fileEntries": file_entries,
        "tree": tree if found_source else None,
        "errorKind": None if status == "ok" else status,
    }


def scan_directory_root(
    root: Path,
    display_root: str,
    scope: str,
    provider_id: str,
    file_entries: list[dict[str, object]],
    next_id: list[int],
    file_index: dict[str, tuple[Path, Path]],
    directory_index: dict[str, DirectoryRecord],
    max_readable_bytes: int,
    allowed_parent: Path,
) -> tuple[bool, dict[str, object]]:
    if not root.is_dir() or path_is_link(root):
        return False, directory_node(display_root, display_root, loaded=False)
    resolved_root = root.resolve(strict=True)
    if not is_within(resolved_root, allowed_parent):
        return False, directory_node(display_root, display_root, loaded=False)
    directory_id = register_directory(resolved_root, resolved_root, scope, provider_id, display_root, directory_index)
    return True, directory_node(display_root, display_root, directory_id=directory_id, loaded=False)


def scan_fixed_files(
    source: dict[str, object],
    source_root: Path,
    allowed_parent: Path,
    display_root: str,
    scope: str,
    provider_id: str,
    source_node: dict[str, object],
    file_entries: list[dict[str, object]],
    next_id: list[int],
    file_index: dict[str, tuple[Path, Path]],
    max_readable_bytes: int,
) -> bool:
    found = False
    if not source_root.is_dir() or path_is_link(source_root):
        return False
    resolved_root = source_root.resolve(strict=True)
    if not is_within(resolved_root, allowed_parent):
        return False
    for filename in source["files"]:
        file_path = resolved_root / str(filename)
        if not file_path.is_file() or path_is_link(file_path) or is_backup_name(file_path.name):
            continue
        entry = make_file_entry(
            file_path,
            resolved_root,
            display_root,
            scope,
            provider_id,
            str(source.get("category", "Other")),
            next_id,
            file_index,
            max_readable_bytes,
        )
        file_entries.append(entry)
        source_node["children"].append(file_node(entry))
        found = True
    sort_tree(source_node)
    return found


def list_directory(
    directory_id: str,
    directory_index: dict[str, DirectoryRecord],
    file_index: dict[str, tuple[Path, Path]],
    next_id: list[int],
    max_readable_bytes: int,
) -> dict[str, object]:
    record = directory_index.get(directory_id)
    if record is None:
        raise KeyError(directory_id)
    directory, allowed_root, scope, provider_id, display_root = record
    if path_is_link(directory):
        raise OSError("directory link rejected")
    resolved_directory = directory.resolve(strict=True)
    if not resolved_directory.is_dir() or not is_within(resolved_directory, allowed_root):
        raise OSError("directory outside allowed root")
    children: list[dict[str, object]] = []
    file_entries: list[dict[str, object]] = []
    with os.scandir(resolved_directory) as items:
        for item in sorted(items, key=lambda entry: entry.name.casefold()):
            if is_link(item) or is_backup_name(item.name):
                continue
            item_path = Path(item.path)
            relative_path = item_path.relative_to(allowed_root).as_posix()
            if item.is_dir(follow_symlinks=False):
                if is_excluded_directory(item.name):
                    continue
                child_id = register_directory(item_path.resolve(strict=True), allowed_root, scope, provider_id, display_root, directory_index)
                children.append(directory_node(item.name, join_display_path(display_root, relative_path), directory_id=child_id, loaded=False))
                continue
            if not item.is_file(follow_symlinks=False):
                continue
            entry = make_file_entry(
                item_path,
                allowed_root,
                display_root,
                scope,
                provider_id,
                category_for_path(provider_id, relative_path),
                next_id,
                file_index,
                max_readable_bytes,
            )
            file_entries.append(entry)
            children.append(file_node(entry))
    children.sort(key=lambda child: (child["type"] != "directory", child["name"].casefold()))
    return {"directoryId": directory_id, "children": children, "fileEntries": file_entries}


def resolve_file_link(
    source_file_id: str,
    target: str,
    file_index: dict[str, tuple[Path, Path]],
    file_metadata: dict[str, dict[str, object]],
    next_id: list[int],
    max_readable_bytes: int,
) -> dict[str, object]:
    source_record = file_index.get(source_file_id)
    source_metadata = file_metadata.get(source_file_id)
    if source_record is None or source_metadata is None or not is_relative_link(target):
        raise KeyError(source_file_id)
    source_path, allowed_root = source_record
    target_path = target.split("#", 1)[0].split("?", 1)[0]
    if not target_path:
        raise KeyError(target)
    candidate_path = source_path.parent / PurePosixPath(target_path)
    if path_is_link(candidate_path):
        raise KeyError(target)
    resolved_path = candidate_path.resolve(strict=True)
    if path_is_link(resolved_path) or not resolved_path.is_file() or not is_within(resolved_path, allowed_root):
        raise KeyError(target)
    if is_backup_name(resolved_path.name) or is_sensitive_name(resolved_path.name):
        raise KeyError(target)
    relative_path = resolved_path.relative_to(allowed_root).as_posix()
    return make_file_entry(
        resolved_path,
        allowed_root,
        str(source_metadata["displayRoot"]),
        str(source_metadata["scope"]),
        str(source_metadata["providerId"]),
        category_for_path(str(source_metadata["providerId"]), relative_path),
        next_id,
        file_index,
        max_readable_bytes,
    )


def is_relative_link(target: str) -> bool:
    if not target or target.startswith(("/", "\\", "~")) or "\\" in target:
        return False
    first_part = target.split("/", 1)[0]
    return ":" not in first_part


def register_directory(
    directory: Path,
    allowed_root: Path,
    scope: str,
    provider_id: str,
    display_root: str,
    directory_index: dict[str, DirectoryRecord],
) -> str:
    directory_id = secrets.token_urlsafe(24)
    directory_index[directory_id] = (directory, allowed_root, scope, provider_id, display_root)
    return directory_id


def make_file_entry(
    file_path: Path,
    root: Path,
    display_root: str,
    scope: str,
    provider_id: str,
    category: str,
    next_id: list[int],
    file_index: dict[str, tuple[Path, Path]],
    max_readable_bytes: int,
) -> dict[str, object]:
    next_id[0] += 1
    file_id = secrets.token_urlsafe(24)
    relative = file_path.relative_to(root).as_posix()
    relative_path = join_display_path(display_root, relative)
    try:
        size = file_path.stat().st_size
    except OSError:
        size, readable, kind, reason = 0, False, "text", "permission_denied"
    else:
        if is_sensitive_name(file_path.name):
            readable, kind, reason = False, "sensitive", "sensitive"
        else:
            kind = classify_file(file_path)
            readable = kind != "binary" and size <= max_readable_bytes
            reason = "binary" if kind == "binary" else "too_large" if size > max_readable_bytes else None
    entry = {
        "id": file_id,
        "providerId": provider_id,
        "scope": scope,
        "displayRoot": display_root,
        "categoryName": category,
        "relativePath": relative_path,
        "displayName": file_path.name,
        "kind": kind,
        "sizeBytes": size,
        "readable": readable,
        "unreadableReason": reason,
    }
    if readable:
        file_index[file_id] = (file_path, root)
    return entry


def directory_node(name: str, relative_path: str, directory_id: str | None = None, loaded: bool = False) -> dict[str, object]:
    return {
        "type": "directory",
        "name": name,
        "relativePath": relative_path,
        "children": [],
        "directoryId": directory_id,
        "loaded": loaded,
        "open": False,
    }


def file_node(entry: dict[str, object]) -> dict[str, object]:
    return {
        "type": "file",
        "name": entry["displayName"],
        "relativePath": entry["relativePath"],
        "fileId": entry["id"],
        "scope": entry["scope"],
        "displayRoot": entry["displayRoot"],
        "kind": entry["kind"],
        "sizeBytes": entry["sizeBytes"],
        "readable": entry["readable"],
        "unreadableReason": entry["unreadableReason"],
    }


def sort_tree(node: dict[str, object]) -> None:
    children = node["children"]
    children.sort(key=lambda child: (child["type"] != "directory", child["name"].casefold()))
    for child in children:
        if child["type"] == "directory":
            sort_tree(child)


def category_for_path(provider_id: str, relative_path: str) -> str:
    first_part = PurePosixPath(relative_path).parts[0].casefold()
    categories = {
        "kiro": {"agents": "Agents", "hooks": "Hooks", "knowledge": "Knowledge", "lessons": "Lessons", "skills": "Skills", "steering": "Steering", "tasks": "Tasks"},
        "claude": {"agents": "Agents", "commands": "Commands", "rules": "Rules", "skills": "Skills"},
        "gemini": {"commands": "Commands", "skills": "Skills"},
        "codex": {"skills": "Skills"},
    }
    return categories.get(provider_id, {}).get(first_part, "Other")


def join_display_path(prefix: str, relative_path: str) -> str:
    if prefix in {"", "."}:
        return relative_path
    return f"{prefix.rstrip('/')}/{relative_path}"


def is_excluded_directory(name: str) -> bool:
    return name.casefold() in EXCLUDED_DIRECTORY_NAMES


def is_backup_name(name: str) -> bool:
    lowered = name.casefold()
    return lowered.endswith("~") or lowered.startswith(".#") or any(lowered.endswith(suffix) for suffix in BACKUP_SUFFIXES)


def is_sensitive_name(name: str) -> bool:
    lowered = name.casefold()
    return (
        lowered in SENSITIVE_FILE_NAMES
        or lowered.startswith(".env")
        or any(token in lowered for token in SENSITIVE_TOKENS)
        or Path(name).suffix.casefold() in {".key", ".pem", ".p12", ".pfx"}
    )


def classify_file(file_path: Path) -> str:
    suffix = file_path.suffix.casefold()
    if suffix in BINARY_SUFFIXES:
        return "binary"
    known_kind = KIND_BY_SUFFIX.get(suffix)
    if known_kind:
        return known_kind
    try:
        with file_path.open("rb") as source_file:
            sample = source_file.read(SAMPLE_BYTES)
    except OSError:
        return "text"
    return "binary" if is_binary_content(file_path.name, sample) else "text"


def is_binary_content(name: str, content: bytes) -> bool:
    return Path(name).suffix.casefold() in BINARY_SUFFIXES or b"\x00" in content or not decodes_as_utf8(content)


def decodes_as_utf8(content: bytes) -> bool:
    try:
        content.decode("utf-8")
    except UnicodeDecodeError:
        return False
    return True


def is_link(entry: os.DirEntry[str]) -> bool:
    attributes = getattr(entry.stat(follow_symlinks=False), "st_file_attributes", 0)
    reparse_point = getattr(stat, "FILE_ATTRIBUTE_REPARSE_POINT", 0)
    return entry.is_symlink() or bool(attributes & reparse_point)


def path_is_link(path: Path) -> bool:
    attributes = getattr(path.lstat(), "st_file_attributes", 0)
    reparse_point = getattr(stat, "FILE_ATTRIBUTE_REPARSE_POINT", 0)
    return path.is_symlink() or bool(attributes & reparse_point)


def is_within(path: Path, parent: Path) -> bool:
    try:
        path.relative_to(parent)
        return True
    except ValueError:
        return False
