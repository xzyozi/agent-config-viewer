"""パス安全境界（リンク拒否・traversal・不正ID）のバックエンド検証。

標準ライブラリのみで動作する。実行: python -m unittest discover -s tests/backend
シンボリックリンクを作成できない環境（権限なしのWindows等）では該当テストをスキップする。
"""
from __future__ import annotations

import os
import sys
import tempfile
import unittest
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[2]))

import server  # noqa: E402
from backend.kiro_catalog import list_directory, resolve_file_link, scan_provider  # noqa: E402

KIRO = {"id": "kiro", "label": "Kiro", "sources": ({"scope": "user", "root": ".kiro", "displayRoot": "~/.kiro"},)}
MAX_BYTES = 2 * 1024 * 1024


def make_symlink(link: Path, target: Path) -> None:
    try:
        os.symlink(target, link, target_is_directory=target.is_dir())
    except (OSError, NotImplementedError):
        raise unittest.SkipTest("シンボリックリンクを作成できない環境")


class PathSafetyTest(unittest.TestCase):
    def setUp(self) -> None:
        self._tmp = tempfile.TemporaryDirectory()
        self.addCleanup(self._tmp.cleanup)
        self.home = Path(self._tmp.name).resolve() / "home"
        self.outside = Path(self._tmp.name).resolve() / "outside"
        self.home.mkdir()
        self.outside.mkdir()
        (self.outside / "secret.md").write_text("# secret\n", encoding="utf-8")
        self.file_index: dict = {}
        self.directory_index: dict = {}
        self.file_metadata: dict = {}
        self.next_id = [0]

    def scan(self) -> dict:
        result = scan_provider(KIRO, self.home, self.next_id, self.file_index, self.directory_index, MAX_BYTES)
        self.file_metadata.update({entry["id"]: entry for entry in result["fileEntries"]})
        return result

    def list_children(self, directory_id: str) -> dict:
        listing = list_directory(directory_id, self.directory_index, self.file_index, self.next_id, MAX_BYTES)
        self.file_metadata.update({entry["id"]: entry for entry in listing["fileEntries"]})
        return listing

    def write(self, relative: str, text: str = "# ok\n") -> Path:
        path = self.home / relative
        path.parent.mkdir(parents=True, exist_ok=True)
        path.write_bytes(text.encode("utf-8"))
        return path

    def root_directory_id(self) -> str:
        result = self.scan()
        self.assertEqual(result["status"], "ok")
        return result["tree"]["children"][0]["directoryId"]

    def test_symlinked_config_root_is_not_exposed(self) -> None:
        make_symlink(self.home / ".kiro", self.outside)
        result = self.scan()
        self.assertEqual(result["status"], "not_found")
        self.assertIsNone(result["tree"])
        self.assertEqual(result["fileEntries"], [])

    def test_symlinked_children_are_excluded_from_listing(self) -> None:
        self.write(".kiro/real.md")
        make_symlink(self.home / ".kiro" / "link.md", self.outside / "secret.md")
        make_symlink(self.home / ".kiro" / "linkdir", self.outside)
        names = [child["name"] for child in self.list_children(self.root_directory_id())["children"]]
        self.assertEqual(names, ["real.md"])

    def test_file_swapped_for_symlink_after_indexing_is_rejected(self) -> None:
        target = self.write(".kiro/note.md")
        listing = self.list_children(self.root_directory_id())
        file_id = listing["fileEntries"][0]["id"]
        server.FILE_INDEX.clear()
        server.FILE_INDEX.update(self.file_index)
        self.addCleanup(server.FILE_INDEX.clear)
        self.assertEqual(server.file_content_payload(file_id)["content"], "# ok\n")
        target.unlink()
        make_symlink(target, self.outside / "secret.md")
        with self.assertRaises(server.FileContentError) as raised:
            server.file_content_payload(file_id)
        self.assertEqual(raised.exception.code, "read_failed")

    def test_relative_link_cannot_escape_the_config_root(self) -> None:
        self.write(".kiro/doc.md")
        (self.home / "outside.md").write_text("# outside\n", encoding="utf-8")
        listing = self.list_children(self.root_directory_id())
        source_id = listing["fileEntries"][0]["id"]
        for target in ("../outside.md", "../../outside/secret.md", "/etc/passwd", "~/x.md", "..\\outside.md", "C:/Windows/win.ini", ""):
            with self.subTest(target=target), self.assertRaises(KeyError):
                resolve_file_link(source_id, target, self.file_index, self.file_metadata, self.next_id, MAX_BYTES)

    def test_relative_link_to_symlink_is_rejected(self) -> None:
        self.write(".kiro/doc.md")
        make_symlink(self.home / ".kiro" / "alias.md", self.outside / "secret.md")
        listing = self.list_children(self.root_directory_id())
        source_id = next(entry["id"] for entry in listing["fileEntries"] if entry["relativePath"].endswith("doc.md"))
        with self.assertRaises(KeyError):
            resolve_file_link(source_id, "alias.md", self.file_index, self.file_metadata, self.next_id, MAX_BYTES)

    def test_unknown_and_malformed_file_ids_are_rejected(self) -> None:
        server.FILE_INDEX.clear()
        for file_id in ("", "short", "../../etc/passwd", "a" * 16 + "/", "x" * 32):
            with self.subTest(file_id=file_id), self.assertRaises(server.FileContentError) as raised:
                server.file_content_payload(file_id)
            self.assertEqual(raised.exception.code, "read_failed")


if __name__ == "__main__":
    unittest.main()
