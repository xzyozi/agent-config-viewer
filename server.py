from __future__ import annotations

import json
import mimetypes
import os
import re
import threading
from http import HTTPStatus
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path, PurePosixPath
from urllib.parse import parse_qs, unquote, urlsplit

from backend.kiro_catalog import is_binary_content, list_directory as list_config_directory, path_is_link, resolve_file_link as resolve_config_file_link, scan_provider as scan_config_provider
from backend.skill_migration import SkillMigrationError, copy_skill_bundle, move_skill_bundle, plan_skill_migration

APP_ROOT = Path(__file__).resolve().parent
HOME_ROOT = Path(os.environ.get("AGENT_CONFIG_VIEWER_HOME_ROOT", Path.home())).resolve()
MAX_READABLE_BYTES = 2 * 1024 * 1024
MAX_COPY_REQUEST_BYTES = 4096
FILE_INDEX: dict[str, tuple[Path, Path]] = {}
FILE_METADATA: dict[str, dict[str, object]] = {}
DIRECTORY_INDEX: dict[str, tuple[Path, Path, str, str, str]] = {}
FILE_INDEX_LOCK = threading.RLock()
FILE_ID_PATTERN = re.compile(r"[A-Za-z0-9_-]{16,}")
COPY_REQUEST_KEYS = frozenset({"snapshotDigest", "destinationName", "confirmed"})
MOVE_REQUEST_KEYS = frozenset({"snapshotDigest", "destinationName", "confirmedSourceName"})
PROVIDERS = (
    {
        "id": "kiro",
        "label": "Kiro",
        "sources": (
            {"scope": "user", "root": ".kiro", "displayRoot": "~/.kiro"},
        ),
    },
    {
        "id": "claude",
        "label": "Claude",
        "sources": (
            {"scope": "user", "root": ".claude", "displayRoot": "~/.claude"},
            {"scope": "user", "root": "", "displayRoot": "~", "files": ("CLAUDE.md",), "category": "Global Instructions"},
        ),
    },
    {
        "id": "gemini",
        "label": "Gemini",
        "sources": (
            {"scope": "user", "root": ".gemini", "displayRoot": "~/.gemini"},
            {"scope": "user", "root": "", "displayRoot": "~", "files": ("GEMINI.md",), "category": "Global Instructions"},
        ),
    },
    {
        "id": "codex",
        "label": "Codex",
        "sources": (
            {"scope": "user", "root": ".codex", "displayRoot": "~/.codex"},
            {"scope": "user", "root": "", "displayRoot": "~", "files": ("AGENTS.md",), "category": "Global Instructions"},
        ),
    },
)


class FileContentError(Exception):
    def __init__(self, code: str) -> None:
        self.code = code


class CopyRequestError(Exception):
    pass


def is_within(path: Path, parent: Path) -> bool:
    try:
        path.relative_to(parent)
        return True
    except ValueError:
        return False


def catalog_payload() -> dict[str, object]:
    next_id = [0]
    file_index: dict[str, tuple[Path, Path]] = {}
    directory_index: dict[str, tuple[Path, Path, str, str, str]] = {}
    provider_results = [scan_config_provider(specification, HOME_ROOT, next_id, file_index, directory_index, MAX_READABLE_BYTES) for specification in PROVIDERS]
    with FILE_INDEX_LOCK:
        FILE_INDEX.clear()
        FILE_INDEX.update(file_index)
        FILE_METADATA.clear()
        FILE_METADATA.update({entry["id"]: entry for result in provider_results for entry in result["fileEntries"]})
        DIRECTORY_INDEX.clear()
        DIRECTORY_INDEX.update(directory_index)
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
        if path_is_link(file_path):
            raise FileContentError("read_failed")
        resolved_path = file_path.resolve(strict=True)
        if path_is_link(resolved_path) or not resolved_path.is_file() or not is_within(resolved_path, allowed_root):
            raise FileContentError("read_failed")
        if resolved_path.stat().st_size > MAX_READABLE_BYTES:
            raise FileContentError("too_large")
        with resolved_path.open("rb") as source_file:
            content_bytes = source_file.read(MAX_READABLE_BYTES + 1)
        if len(content_bytes) > MAX_READABLE_BYTES:
            raise FileContentError("too_large")
        if is_binary_content(file_path.name, content_bytes):
            raise FileContentError("binary")
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


def directory_id_for_action(request_path: str, action: str) -> str | None:
    parts = request_path.split("/")
    if len(parts) == 5 and parts[1:3] == ["api", "directories"] and parts[4] == action:
        return parts[3]
    return None


def json_object_without_duplicates(pairs: list[tuple[str, object]]) -> dict[str, object]:
    result: dict[str, object] = {}
    for key, value in pairs:
        if key in result:
            raise CopyRequestError()
        result[key] = value
    return result


def error_status(error: SkillMigrationError) -> HTTPStatus:
    return {
        "read_failed": HTTPStatus.NOT_FOUND,
        "stale_plan": HTTPStatus.CONFLICT,
        "destination_conflict": HTTPStatus.CONFLICT,
        "copy_failed": HTTPStatus.INTERNAL_SERVER_ERROR,
        "move_failed": HTTPStatus.INTERNAL_SERVER_ERROR,
    }.get(error.code, HTTPStatus.INTERNAL_SERVER_ERROR)


class LocalOnlyHandler(BaseHTTPRequestHandler):
    def do_GET(self) -> None:
        request = urlsplit(self.path)
        if request.fragment:
            self.send_error(HTTPStatus.BAD_REQUEST)
            return
        resolve_file_id = file_id_for_action(request.path, "resolve")
        if request.query and resolve_file_id is None:
            self.send_error(HTTPStatus.BAD_REQUEST)
            return
        if resolve_file_id is not None:
            self.send_resolved_file_link(resolve_file_id, request.query)
            return
        if file_id_for_action(request.path, "migration-copy") is not None:
            self.send_json({"code": "copy_failed"}, HTTPStatus.METHOD_NOT_ALLOWED)
            return
        if file_id_for_action(request.path, "migration-move") is not None:
            self.send_json({"code": "move_failed"}, HTTPStatus.METHOD_NOT_ALLOWED)
            return
        if request.path == "/api/catalog":
            self.send_json(catalog_payload())
            return
        directory_id = directory_id_for_action(request.path, "children")
        if directory_id is not None:
            self.send_directory_children(directory_id)
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
            self.send_static(APP_ROOT / "index.html")
            return
        self.send_source_file(unquote(request.path))

    def do_POST(self) -> None:
        request = urlsplit(self.path)
        if request.query or request.fragment:
            self.send_json({"code": "copy_failed"}, HTTPStatus.BAD_REQUEST)
            return
        move_file_id = file_id_for_action(request.path, "migration-move")
        if move_file_id is not None:
            self.send_migration_move(move_file_id)
            return
        file_id = file_id_for_action(request.path, "migration-copy")
        if file_id is None:
            self.send_json({"code": "copy_failed"}, HTTPStatus.NOT_FOUND)
            return
        self.send_migration_copy(file_id)

    def send_resolved_file_link(self, file_id: str, query: str) -> None:
        values = parse_qs(query, keep_blank_values=True)
        targets = values.get("target", [])
        if not FILE_ID_PATTERN.fullmatch(file_id) or len(targets) != 1 or len(targets[0]) > 4096:
            self.send_json({"code": "read_failed"}, HTTPStatus.NOT_FOUND)
            return
        try:
            with FILE_INDEX_LOCK:
                entry = resolve_config_file_link(file_id, targets[0], FILE_INDEX, FILE_METADATA, [len(FILE_INDEX)], MAX_READABLE_BYTES)
                FILE_METADATA[entry["id"]] = entry
            self.send_json({"fileEntry": entry})
        except (KeyError, OSError):
            self.send_json({"code": "read_failed"}, HTTPStatus.NOT_FOUND)

    def send_directory_children(self, directory_id: str) -> None:
        if not FILE_ID_PATTERN.fullmatch(directory_id):
            self.send_json({"code": "read_failed"}, HTTPStatus.NOT_FOUND)
            return
        try:
            with FILE_INDEX_LOCK:
                payload = list_config_directory(directory_id, DIRECTORY_INDEX, FILE_INDEX, [len(FILE_INDEX)], MAX_READABLE_BYTES)
                FILE_METADATA.update({entry["id"]: entry for entry in payload["fileEntries"]})
            self.send_json(payload)
        except (KeyError, OSError):
            self.send_json({"code": "read_failed"}, HTTPStatus.NOT_FOUND)

    def send_content(self, file_id: str) -> None:
        try:
            self.send_json(file_content_payload(file_id))
        except FileContentError as error:
            status = HTTPStatus.REQUEST_ENTITY_TOO_LARGE if error.code == "too_large" else HTTPStatus.UNSUPPORTED_MEDIA_TYPE if error.code == "binary" else HTTPStatus.NOT_FOUND
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
            self.send_json(plan_skill_migration(file_id, file_path, allowed_root, allowed_root.parent))
        except SkillMigrationError as error:
            self.send_json({"code": error.code}, HTTPStatus.NOT_FOUND)

    def send_migration_copy(self, file_id: str) -> None:
        try:
            request_payload = self.copy_request_payload()
            if not FILE_ID_PATTERN.fullmatch(file_id):
                raise SkillMigrationError("read_failed")
            with FILE_INDEX_LOCK:
                record = FILE_INDEX.get(file_id)
            if not record:
                raise SkillMigrationError("read_failed")
            file_path, allowed_root = record
            result = copy_skill_bundle(
                file_path,
                allowed_root,
                allowed_root.parent,
                request_payload["snapshotDigest"],
                request_payload["destinationName"],
            )
            self.send_json(result, HTTPStatus.CREATED)
        except CopyRequestError:
            self.send_json({"code": "copy_failed"}, HTTPStatus.BAD_REQUEST)
        except SkillMigrationError as error:
            self.send_json({"code": error.code}, error_status(error))

    def send_migration_move(self, file_id: str) -> None:
        try:
            request_payload = self.move_request_payload()
            if not FILE_ID_PATTERN.fullmatch(file_id):
                raise SkillMigrationError("read_failed")
            with FILE_INDEX_LOCK:
                record = FILE_INDEX.get(file_id)
            if not record:
                raise SkillMigrationError("read_failed")
            file_path, allowed_root = record
            result = move_skill_bundle(
                file_path,
                allowed_root,
                allowed_root.parent,
                request_payload["snapshotDigest"],
                request_payload["destinationName"],
                request_payload["confirmedSourceName"],
            )
            self.send_json(result)
        except CopyRequestError:
            self.send_json({"code": "move_failed"}, HTTPStatus.BAD_REQUEST)
        except SkillMigrationError as error:
            self.send_json({"code": error.code}, error_status(error))

    def read_json_body(self) -> object:
        if self.headers.get("Content-Type") != "application/json":
            raise CopyRequestError()
        content_length = self.headers.get("Content-Length")
        if content_length is None or not content_length.isascii() or not content_length.isdecimal():
            raise CopyRequestError()
        length = int(content_length)
        if length <= 0 or length > MAX_COPY_REQUEST_BYTES:
            raise CopyRequestError()
        try:
            return json.loads(self.rfile.read(length).decode("utf-8"), object_pairs_hook=json_object_without_duplicates)
        except (UnicodeDecodeError, json.JSONDecodeError, CopyRequestError):
            raise CopyRequestError() from None

    def move_request_payload(self) -> dict[str, str]:
        payload = self.read_json_body()
        if not isinstance(payload, dict) or set(payload) != MOVE_REQUEST_KEYS or not all(isinstance(payload[key], str) for key in MOVE_REQUEST_KEYS):
            raise CopyRequestError()
        return {key: payload[key] for key in MOVE_REQUEST_KEYS}

    def copy_request_payload(self) -> dict[str, str]:
        payload = self.read_json_body()
        if (
            not isinstance(payload, dict)
            or set(payload) != COPY_REQUEST_KEYS
            or not isinstance(payload["snapshotDigest"], str)
            or not isinstance(payload["destinationName"], str)
            or payload["confirmed"] is not True
        ):
            raise CopyRequestError()
        return {"snapshotDigest": payload["snapshotDigest"], "destinationName": payload["destinationName"]}

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
        candidate = (APP_ROOT / Path(*relative.parts)).resolve()
        if not is_within(candidate, APP_ROOT / "src") or candidate.suffix not in {".js", ".css"}:
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
    print("Read scope: user configuration roots for Kiro, Claude, Gemini, and Codex.")
    server.serve_forever()


if __name__ == "__main__":
    main()
