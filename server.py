from __future__ import annotations

import json
import mimetypes
import os
import re
import secrets
import stat
import threading
from http import HTTPStatus
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path, PurePosixPath
from urllib.parse import unquote, urlsplit

from backend.skill_migration import SkillMigrationError, plan_skill_migration

PROJECT_ROOT = Path(__file__).resolve().parent
HOME_ROOT = Path.home().resolve()
MAX_READABLE_BYTES = 2 * 1024 * 1024
FILE_INDEX: dict[str, tuple[Path, Path]] = {}
FILE_INDEX_LOCK = threading.RLock()
FILE_ID_PATTERN = re.compile(r"[A-Za-z0-9_-]{16,}")
PROVIDERS = (
    {"id": "kiro", "label": "Kiro", "root": ".kiro", "categories": (("Steering", "provider", "steering", ("**/*.md",)), ("Skills", "provider", "skills", ("**/SKILL.md",)), ("Knowledge", "provider", "knowledge", ("**/*.md",)))},
    {"id": "claude", "label": "Claude", "root": ".claude", "categories": (("Global Instructions", "home", ".", ("CLAUDE.md",)), ("Settings", "provider", ".", ("settings.json",)), ("Rules", "provider", "rules", ("**/*.md",)), ("Skills", "provider", "skills", ("**/SKILL.md",)), ("Commands", "provider", "commands", ("**/*.md",)), ("Agents", "provider", "agents", ("**/*.md",)))},
    {"id": "gemini", "label": "Gemini", "root": ".gemini", "categories": (("Global Instructions", "home", ".", ("GEMINI.md",)), ("Settings", "provider", ".", ("settings.json",)), ("Commands", "provider", "commands", ("**/*.toml",)), ("Skills", "provider", "skills", ("**/SKILL.md",)))},
    {"id": "codex", "label": "Codex", "root": ".codex", "categories": (("Settings", "provider", ".", ("config.toml", "*.config.toml")),)},
)


def is_within(path: Path, parent: Path) -> bool:
    try:
        path.relative_to(parent)
        return True
    except ValueError:
        return False


def is_link(entry: os.DirEntry[str]) -> bool:
    attributes = getattr(entry.stat(follow_symlinks=False), "st_file_attributes", 0)
    reparse_point = getattr(stat, "FILE_ATTRIBUTE_REPARSE_POINT", 0)
    return entry.is_symlink() or bool(attributes & reparse_point)


def matches(name: str, patterns: tuple[str, ...]) -> bool:
    lowered = name.casefold()
    return any(
        (pattern.startswith("**/*.") and lowered.endswith(pattern[4:].casefold()))
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
                yield Path(entry.path)


def scan_provider(specification: dict[str, object], next_id: list[int], file_index: dict[str, tuple[Path, Path]]) -> dict[str, object]:
    root = HOME_ROOT / str(specification["root"])
    try:
        root_available = root.is_dir() and not root.is_symlink()
        resolved_root = root.resolve(strict=True) if root_available else None
        if resolved_root and not is_within(resolved_root, HOME_ROOT):
            return provider_result(specification, "list_failed")
        entries = []
        for category_name, scope, category_path, patterns in specification["categories"]:
            if scope == "home":
                entries.extend(scan_home_files(patterns, specification, category_name, next_id, file_index))
                continue
            if not resolved_root:
                continue
            category_root = resolved_root if category_path == "." else resolved_root.joinpath(*category_path.split("/"))
            if not category_root.is_dir() or category_root.is_symlink():
                continue
            for file_path in walk_files(category_root):
                if matches(file_path.name, patterns):
                    entries.append(file_entry(file_path, resolved_root, str(specification["root"]), specification, category_name, next_id, file_index))
        status = "ok" if resolved_root or entries else "not_found"
        return {"providerId": specification["id"], "status": status, "fileEntries": entries, "errorKind": None if status == "ok" else status}
    except PermissionError:
        return provider_result(specification, "permission_denied")
    except OSError:
        return provider_result(specification, "list_failed")


def scan_home_files(patterns: tuple[str, ...], specification: dict[str, object], category_name: str, next_id: list[int], file_index: dict[str, tuple[Path, Path]]) -> list[dict[str, object]]:
    entries = []
    for name in patterns:
        if "*" in name:
            continue
        file_path = HOME_ROOT / name
        if file_path.is_file() and not file_path.is_symlink():
            entries.append(file_entry(file_path, HOME_ROOT, "", specification, category_name, next_id, file_index))
    return entries


def provider_result(specification: dict[str, object], status: str) -> dict[str, object]:
    return {"providerId": specification["id"], "status": status, "fileEntries": [], "errorKind": status}


def file_entry(file_path: Path, base: Path, relative_prefix: str, specification: dict[str, object], category_name: str, next_id: list[int], file_index: dict[str, tuple[Path, Path]]) -> dict[str, object]:
    next_id[0] += 1
    file_id = secrets.token_urlsafe(24)
    try:
        size = file_path.stat().st_size
        readable = size <= MAX_READABLE_BYTES
        reason = None if readable else "too_large"
    except OSError:
        size, readable, reason = 0, False, "permission_denied"
    if readable:
        file_index[file_id] = (file_path, base)
    relative = file_path.relative_to(base).as_posix()
    relative_path = f"{relative_prefix}/{relative}" if relative_prefix else relative
    return {"id": file_id, "providerId": specification["id"], "categoryName": category_name, "relativePath": relative_path, "displayName": file_path.name, "kind": file_kind(file_path.name), "sizeBytes": size, "readable": readable, "unreadableReason": reason}


class FileContentError(Exception):
    def __init__(self, code: str) -> None:
        self.code = code


def catalog_payload() -> dict[str, object]:
    next_id = [0]
    file_index: dict[str, tuple[Path, Path]] = {}
    provider_results = [scan_provider(specification, next_id, file_index) for specification in PROVIDERS]
    with FILE_INDEX_LOCK:
        FILE_INDEX.clear()
        FILE_INDEX.update(file_index)
    return {"providerResults": provider_results}


def file_content_payload(file_id: str) -> dict[str, str]:
    if not FILE_ID_PATTERN.fullmatch(file_id):
        raise FileContentError("read_failed")
    with FILE_INDEX_LOCK:
        record = FILE_INDEX.get(file_id)
    if not record:
        raise FileContentError("read_failed")
    file_path, allowed_root = record
    try:
        if file_path.is_symlink():
            raise FileContentError("read_failed")
        resolved_path = file_path.resolve(strict=True)
        if not resolved_path.is_file() or not is_within(resolved_path, allowed_root):
            raise FileContentError("read_failed")
        if resolved_path.stat().st_size > MAX_READABLE_BYTES:
            raise FileContentError("too_large")
        with resolved_path.open("rb") as source_file:
            content_bytes = source_file.read(MAX_READABLE_BYTES + 1)
        if len(content_bytes) > MAX_READABLE_BYTES:
            raise FileContentError("too_large")
        return {"fileId": file_id, "content": content_bytes.decode("utf-8")}
    except FileContentError:
        raise
    except (OSError, UnicodeDecodeError):
        raise FileContentError("read_failed") from None


def file_id_for_action(request_path: str, action: str) -> str | None:
    parts = request_path.split("/")
    if len(parts) == 5 and parts[1:3] == ["api", "files"] and parts[4] == action:
        return parts[3]
    return None


class LocalOnlyHandler(BaseHTTPRequestHandler):
    def do_GET(self) -> None:
        request = urlsplit(self.path)
        if request.query or request.fragment:
            self.send_error(HTTPStatus.BAD_REQUEST)
            return
        if request.path == "/api/catalog":
            self.send_json(catalog_payload())
            return
        migration_plan_file_id = file_id_for_action(request.path, "migration-plan")
        if migration_plan_file_id is not None:
            self.send_migration_plan(migration_plan_file_id)
            return
        content_file_id = file_id_for_action(request.path, "content")
        if content_file_id is not None:
            self.send_content(content_file_id)
            return
        if request.path == "/":
            self.send_static(PROJECT_ROOT / "index.html")
            return
        self.send_source_file(unquote(request.path))

    def send_content(self, file_id: str) -> None:
        try:
            self.send_json(file_content_payload(file_id))
        except FileContentError as error:
            status = HTTPStatus.REQUEST_ENTITY_TOO_LARGE if error.code == "too_large" else HTTPStatus.NOT_FOUND
            self.send_json({"code": error.code}, status)

    def send_migration_plan(self, file_id: str) -> None:
        try:
            if not FILE_ID_PATTERN.fullmatch(file_id):
                raise SkillMigrationError()
            with FILE_INDEX_LOCK:
                record = FILE_INDEX.get(file_id)
            if not record:
                raise SkillMigrationError()
            file_path, allowed_root = record
            self.send_json(plan_skill_migration(file_id, file_path, allowed_root, HOME_ROOT))
        except SkillMigrationError as error:
            self.send_json({"code": error.code}, HTTPStatus.NOT_FOUND)

    def send_json(self, payload: dict[str, object], status: HTTPStatus = HTTPStatus.OK) -> None:
        body = json.dumps(payload, ensure_ascii=False).encode("utf-8")
        self.send_response(status)
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
