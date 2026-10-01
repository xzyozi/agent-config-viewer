from __future__ import annotations

import os
import secrets
import stat
from pathlib import Path, PurePosixPath

BACKUP_SUFFIXES = frozenset({".bak", ".backup", ".old", ".orig", ".swp", ".swo"})
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
SAMPLE_BYTES = 8192


def scan_kiro_root(root: Path, next_id: list[int], file_index: dict[str, tuple[Path, Path]], max_readable_bytes: int) -> dict[str, object]:
    empty_result = {"providerId": "kiro", "status": "not_found", "fileEntries": [], "tree": None, "errorKind": "not_found"}
    try:
        if not root.is_dir() or path_is_link(root):
            return empty_result
        resolved_root = root.resolve(strict=True)
        tree = directory_node(root.name, root.name)
        file_entries: list[dict[str, object]] = []
        walk_directory(root, resolved_root, tree, file_entries, next_id, file_index, max_readable_bytes)
        sort_tree(tree)
        file_entries.sort(key=lambda entry: str(entry["relativePath"]).casefold())
        return {
            "providerId": "kiro",
            "status": "ok",
            "fileEntries": file_entries,
            "tree": tree,
            "errorKind": None,
        }
    except PermissionError:
        return {"providerId": "kiro", "status": "permission_denied", "fileEntries": [], "tree": None, "errorKind": "permission_denied"}
    except OSError:
        return {"providerId": "kiro", "status": "list_failed", "fileEntries": [], "tree": None, "errorKind": "list_failed"}


def walk_directory(
    directory: Path,
    root: Path,
    parent_node: dict[str, object],
    file_entries: list[dict[str, object]],
    next_id: list[int],
    file_index: dict[str, tuple[Path, Path]],
    max_readable_bytes: int,
) -> None:
    with os.scandir(directory) as items:
        for item in sorted(items, key=lambda entry: entry.name.casefold()):
            if is_link(item):
                continue
            item_path = Path(item.path)
            relative_path = item_path.relative_to(root).as_posix()
            display_path = f"{root.name}/{relative_path}"
            if item.is_dir(follow_symlinks=False):
                node = directory_node(item.name, display_path)
                parent_node["children"].append(node)
                walk_directory(item_path, root, node, file_entries, next_id, file_index, max_readable_bytes)
                continue
            if not item.is_file(follow_symlinks=False) or is_backup_name(item.name):
                continue
            entry = make_file_entry(item_path, root, next_id, file_index, max_readable_bytes)
            file_entries.append(entry)
            parent_node["children"].append(file_node(entry))


def make_file_entry(
    file_path: Path,
    root: Path,
    next_id: list[int],
    file_index: dict[str, tuple[Path, Path]],
    max_readable_bytes: int,
) -> dict[str, object]:
    next_id[0] += 1
    file_id = secrets.token_urlsafe(24)
    relative = file_path.relative_to(root).as_posix()
    relative_path = f"{root.name}/{relative}"
    kind = classify_file(file_path)
    try:
        size = file_path.stat().st_size
    except OSError:
        size, readable, reason = 0, False, "permission_denied"
    else:
        readable = kind != "binary" and size <= max_readable_bytes
        reason = "binary" if kind == "binary" else "too_large" if size > max_readable_bytes else None
    entry = {
        "id": file_id,
        "providerId": "kiro",
        "categoryName": category_name(relative),
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


def directory_node(name: str, relative_path: str) -> dict[str, object]:
    return {"type": "directory", "name": name, "relativePath": relative_path, "children": []}


def file_node(entry: dict[str, object]) -> dict[str, object]:
    return {
        "type": "file",
        "name": entry["displayName"],
        "relativePath": entry["relativePath"],
        "fileId": entry["id"],
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


def category_name(relative_path: str) -> str:
    first_part = PurePosixPath(relative_path).parts[0].casefold()
    return {"knowledge": "Knowledge", "skills": "Skills", "steering": "Steering"}.get(first_part, "Other")


def is_backup_name(name: str) -> bool:
    lowered = name.casefold()
    return lowered.endswith("~") or lowered.startswith(".#") or any(lowered.endswith(suffix) for suffix in BACKUP_SUFFIXES)


def classify_file(file_path: Path) -> str:
    suffix = file_path.suffix.casefold()
    if suffix in BINARY_SUFFIXES:
        return "binary"
    try:
        with file_path.open("rb") as source_file:
            sample = source_file.read(SAMPLE_BYTES)
    except OSError:
        return KIND_BY_SUFFIX.get(suffix, "text")
    return "binary" if is_binary_content(file_path.name, sample) else KIND_BY_SUFFIX.get(suffix, "text")


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
