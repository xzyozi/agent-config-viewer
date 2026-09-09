from __future__ import annotations

import sys
from pathlib import Path

MAX_READABLE_BYTES = 2 * 1024 * 1024


def write(home: Path, relative_path: str, content: str) -> None:
    target = home / relative_path
    target.parent.mkdir(parents=True, exist_ok=True)
    target.write_text(content, encoding="utf-8")


def main() -> None:
    home = Path(sys.argv[1])
    write(home, ".kiro/steering/safe.md", '# Kiro safe\n<script id="unsafe">window.e2eExecuted = true</script>\n')
    write(home, ".kiro/steering/ignored.txt", "not an allowed file\n")
    oversized = home / ".kiro/steering/oversized.md"
    oversized.parent.mkdir(parents=True, exist_ok=True)
    oversized.write_bytes(b"x" * (MAX_READABLE_BYTES + 1))
    write(home, "CLAUDE.md", "# Claude global instruction\n")
    write(home, ".claude/rules/example.md", "# Claude rule\n")
    write(home, "GEMINI.md", "# Gemini global instruction\n")
    write(home, ".gemini/commands/example.toml", 'name = "example"\n')
    write(home, ".codex/config.toml", 'model = "test"\n')


if __name__ == "__main__":
    main()
