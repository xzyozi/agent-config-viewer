"""Skill bundle 移動（非上書きrename）のバックエンド検証。

標準ライブラリのみで動作する。実行: python -m unittest discover -s tests/backend
"""
from __future__ import annotations

import sys
import tempfile
import unittest
from pathlib import Path
from unittest import mock

sys.path.insert(0, str(Path(__file__).resolve().parents[2]))

from backend import skill_migration  # noqa: E402
from backend.skill_migration import SkillMigrationError, move_skill_bundle, plan_skill_migration  # noqa: E402


class SkillMoveTest(unittest.TestCase):
    def setUp(self) -> None:
        self._tmp = tempfile.TemporaryDirectory()
        self.addCleanup(self._tmp.cleanup)
        self.home = Path(self._tmp.name).resolve()
        self.kiro = self.home / ".kiro"
        self.skills = self.kiro / "skills"
        self.write(".kiro/skills/example/SKILL.md", "# Example\n\n[Guide](references/guide.md)\n")
        self.write(".kiro/skills/example/references/guide.md", "# Guide\n")
        (self.skills / "example" / "empty").mkdir()
        self.write(".kiro/steering/note.md", "line1\nsee skills/example/SKILL.md\n")
        self.write(".kiro/steering/other.md", "skills/example-other/SKILL.md is a different skill\n")
        self.skill_file = self.skills / "example" / "SKILL.md"
        self.digest = self.plan()["snapshotDigest"]

    def write(self, relative: str, text: str) -> None:
        path = self.home / relative
        path.parent.mkdir(parents=True, exist_ok=True)
        path.write_bytes(text.encode("utf-8"))

    def plan(self) -> dict:
        return plan_skill_migration("file-id", self.skill_file, self.kiro, self.home)

    def move(self, destination: str = "renamed", digest: str | None = None, confirmed: str = "example") -> dict:
        return move_skill_bundle(self.skill_file, self.kiro, self.home, digest or self.digest, destination, confirmed)

    def assert_source_intact(self) -> None:
        self.assertTrue(self.skill_file.is_file())
        self.assertTrue((self.skills / "example" / "empty").is_dir())
        self.assertEqual(self.plan()["snapshotDigest"], self.digest)

    def test_plan_reports_external_references_without_editing_them(self) -> None:
        before = (self.kiro / "steering" / "note.md").read_bytes()
        references = self.plan()["externalReferences"]
        self.assertEqual(references, [{"sourcePath": "steering/note.md", "line": 2}])
        self.assertEqual((self.kiro / "steering" / "note.md").read_bytes(), before)

    def test_move_renames_the_bundle_and_preserves_contents(self) -> None:
        result = self.move()
        self.assertEqual(result, {"bundlePath": ".kiro/skills/renamed", "snapshotDigest": self.digest, "status": "moved"})
        self.assertFalse((self.skills / "example").exists())
        moved = self.skills / "renamed"
        self.assertEqual((moved / "references" / "guide.md").read_bytes(), b"# Guide\n")
        self.assertTrue((moved / "empty").is_dir())
        self.assertEqual(plan_skill_migration("file-id", moved / "SKILL.md", self.kiro, self.home)["snapshotDigest"], self.digest)

    def test_existing_destination_is_never_replaced(self) -> None:
        self.write(".kiro/skills/taken/SKILL.md", "# Taken\n")
        with self.assertRaises(SkillMigrationError) as raised:
            self.move("taken")
        self.assertEqual(raised.exception.code, "destination_conflict")
        self.assertEqual((self.skills / "taken" / "SKILL.md").read_bytes(), b"# Taken\n")
        self.assert_source_intact()

    def test_stale_plan_is_rejected(self) -> None:
        with self.assertRaises(SkillMigrationError) as raised:
            self.move(digest="0" * 64)
        self.assertEqual(raised.exception.code, "stale_plan")
        self.assert_source_intact()

    def test_source_name_confirmation_must_match(self) -> None:
        for confirmed in ("", "Example", "renamed", "example "):
            with self.subTest(confirmed=confirmed), self.assertRaises(SkillMigrationError) as raised:
                self.move(confirmed=confirmed)
            self.assertEqual(raised.exception.code, "move_failed")
        self.assert_source_intact()

    def test_unsafe_destination_names_are_rejected(self) -> None:
        for name in ("", "..", "../escape", "a/b", "a\\b", "con", "trailing.", ".skill-copy-x", "x" * 129):
            with self.subTest(name=name), self.assertRaises(SkillMigrationError) as raised:
                self.move(name)
            self.assertEqual(raised.exception.code, "move_failed")
        self.assert_source_intact()

    def test_failed_verification_rolls_the_bundle_back(self) -> None:
        real_snapshot = skill_migration.read_bundle_snapshot
        calls = []

        def tampered(bundle_root: Path):
            calls.append(bundle_root)
            directories, files, digest = real_snapshot(bundle_root)
            if len(calls) == 2:
                return directories, files, "f" * 64
            return directories, files, digest

        with mock.patch.object(skill_migration, "read_bundle_snapshot", tampered), self.assertRaises(SkillMigrationError) as raised:
            self.move()
        self.assertEqual(raised.exception.code, "move_failed")
        self.assertFalse((self.skills / "renamed").exists())
        self.assert_source_intact()


if __name__ == "__main__":
    unittest.main()
