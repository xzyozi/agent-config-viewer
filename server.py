from __future__ import annotations

import json
import mimetypes
import os
import stat
from http import HTTPStatus
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path, PurePosixPath
from urllib.parse import unquote, urlsplit

PROJECT_ROOT = Path(__file__).resolve().parent
HOME_ROOT = Path.home().resolve()
MAX_READABLE_BYTES = 2 * 1024 * 1024
PROVIDERS = (
    {"id": "kiro", "label": "Kiro", "root": ".kiro", "categories": (("Steering", "steering", ("**/*.md",)), ("Skills", "skills", ("**/SKILL.md",)), ("Knowledge", "knowledge", ("**/*.md",)))},
    {"id": "claude", "label": "Claude", "root": ".claude", "categories": (("Settings", ".", ("settings.json",)), ("Rules", "rules", ("**/*.md",)), ("Skills", "skills", ("**/SKILL.md",)), ("Commands", "commands", ("**/*.md",)), ("Agents", "agents", ("**/*.md",)))},
    {"id": "gemini", "label": "Gemini", "root": ".gemini", "categories": (("Settings", ".", ("settings.json",)), ("Commands", "commands", ("**/*.toml",)), ("Skills", "skills", ("**/SKILL.md",)))},
    {"id": "codex", "label": "Codex", "root": ".codex", "categories": (("Settings", ".", ("config.toml", "*.config.toml")),)},
)


def is_within(path: Path, parent: Path) -> bool:
    try:
        path.relative_to(parent)
        return True
    except ValueError:
        return False


def is_link(entry: os.DirEntry[str]) -> bool:
    attributes = getattr(entry.stat(follow_symlinks=False), "st_file_attributes", 0)
    return entry.is_symlink() or bool(attributes & stat.FILE_ATTRIBUTE_REPARSE_POINT)


def matches(name: str, patterns: tuple[str, ...]) -> bool:
    lowered = name.casefold()
    return any(
        (pattern == "**/*.md" and lowered.endswith(".md"))
        or (pattern == "**/SKILL.md" and lowered == "skill.md")
        or (pattern.startswith("*.") and lowered.endswith(pattern[1:].casefold()))
        or lowered == pattern.casefold()
        for pattern in patterns
    )


def file_kind(name: str) -> str:
    lowered = name.casefold()
    if lowered.endswith(".md"):
        return "markdown"
    if lowered.endswith(".json"):
        return "json"
    if lowered.endswith(".toml"):
        return "toml"
    return "text"


def walk_files(directory: Path):
    with os.scandir(directory) as items:
        for entry in sorted(items, key=lambda item: item.name.casefold()):
            if is_link(entry):
                continue
            if entry.is_dir(follow_symlinks=False):
                yield from walk_files(Path(entry.path))
            elif entry.is_file(follow_symlinks=False):
                yield entry


def scan_provider(specification: dict[str, object], next_id: list[int]) -> dict[str, object]:
    root = HOME_ROOT / str(specification["root"])
    try:
        if not root.is_dir() or root.is_symlink():
            return provider_result(specification, "not_found")
        resolved_root = root.resolve(strict=True)
        if not is_within(resolved_root, HOME_ROOT):
            return provider_result(specification, "list_failed")
        entries = []
        for category_name, category_path, patterns in specification["categories"]:
            category_root = resolved_root if category_path == "." else resolved_root.joinpath(*category_path.split("/"))
            if not category_root.is_dir() or category_root.is_symlink():
                continue
            for entry in walk_files(category_root):
                if not matches(entry.name, patterns):
                    continue
                entries.append(file_entry(entry, resolved_root, specification, category_name, category_path, next_id))
        return {"providerId": specification["id"], "status": "ok", "fileEntries": entries, "errorKind": None}
    except PermissionError:
        return provider_result(specification, "permission_denied")
    except OSError:
        return provider_result(specification, "list_failed")


def provider_result(specification: dict[str, object], status: str) -> dict[str, object]:
    return {"providerId": specification["id"], "status": status, "fileEntries": [], "errorKind": status}


def file_entry(entry: os.DirEntry[str], root: Path, specification: dict[str, object], category_name: str, category_path: str, next_id: list[int]) -> dict[str, object]:
    next_id[0] += 1
    try:
        size = entry.stat(follow_symlinks=False).st_size
        readable = size <= MAX_READABLE_BYTES
        reason = None if readable else "too_large"
    except OSError:
        size, readable, reason = 0, False, "permission_denied"
    relative = Path(entry.path).resolve(strict=False).relative_to(root).as_posix()
    return {"id": f"file-{next_id[0]}", "providerId": specification["id"], "categoryName": category_name, "relativePath": f"{specification['root']}/{relative}", "displayName": entry.name, "kind": file_kind(entry.name), "sizeBytes": size, "readable": readable, "unreadableReason": reason}


def catalog_payload() -> dict[str, object]:
    next_id = [0]
    return {"providerResults": [scan_provider(specification, next_id) for specification in PROVIDERS]}


class LocalOnlyHandler(BaseHTTPRequestHandler):
    def do_GET(self) -> None:
        request = urlsplit(self.path)
        if request.query or request.fragment:
            self.send_error(HTTPStatus.BAD_REQUEST)
            return
        if request.path == "/api/catalog":
            self.send_json(catalog_payload())
            return
        if request.path == "/":
            self.send_static(PROJECT_ROOT / "index.html")
            return
        self.send_source_file(unquote(request.path))

    def send_json(self, payload: dict[str, object]) -> None:
        body = json.dumps(payload, ensure_ascii=False).encode("utf-8")
        self.send_response(HTTPStatus.OK)
        self.send_header("Content-Type", "application/json; charset=utf-8")
        self.send_header("Content-Length", str(len(body)))
        self.send_header("Cache-Control", "no-store")
        self.end_headers()
        self.wfile.write(body)

    def send_source_file(self, request_path: str) -> None:
        relative = PurePosixPath(request_path.lstrip("/"))
        if not relative.parts or relative.parts[0] != "src" or any(part in {"", ".", ".."} for part in relative.parts):
            self.send_error(HTTPStatus.NOT_FOUND)
            return
        candidate = (PROJECT_ROOT / Path(*relative.parts)).resolve()
        if not is_within(candidate, PROJECT_ROOT / "src") or candidate.suffix not in {".js", ".css"}:
            self.send_error(HTTPStatus.NOT_FOUND)
            return
        self.send_static(candidate)

    def send_static(self, file_path: Path) -> None:
        if not file_path.is_file():
            self.send_error(HTTPStatus.NOT_FOUND)
            return
        body = file_path.read_bytes()
        content_type = mimetypes.guess_type(str(file_path))[0] or "application/octet-stream"
        self.send_response(HTTPStatus.OK)
        self.send_header("Content-Type", f"{content_type}; charset=utf-8")
        self.send_header("Content-Length", str(len(body)))
        self.send_header("Cache-Control", "no-store")
        self.end_headers()
        self.wfile.write(body)

    def log_message(self, format: str, *args: object) -> None:
        return


def main() -> None:
    server = ThreadingHTTPServer(("127.0.0.1", 8765), LocalOnlyHandler)
    print("Agent Config Viewer: http://127.0.0.1:8765/")
    print("Read scope: current user's .kiro, .claude, .gemini, and .codex directories only.")
    server.serve_forever()


if __name__ == "__main__":
    main()
