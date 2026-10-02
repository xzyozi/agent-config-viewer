from __future__ import annotations

import sys
from pathlib import Path

MAX_READABLE_BYTES = 2 * 1024 * 1024


def write(root: Path, relative_path: str, content: str) -> None:
    target = root / relative_path
    target.parent.mkdir(parents=True, exist_ok=True)
    target.write_text(content, encoding="utf-8")


def write_bytes(root: Path, relative_path: str, content: bytes) -> None:
    target = root / relative_path
    target.parent.mkdir(parents=True, exist_ok=True)
    target.write_bytes(content)


def main() -> None:
    user_root = Path(sys.argv[1])
    write(user_root, ".kiro/steering/safe.md", """# User Kiro safe

<script id="unsafe">window.e2eExecuted = true</script>

## Features

- **Markdown** preview
- `safe` text

| Name | Value |
| --- | --- |
| Scope | User Kiro |

[Skill](../skills/example/SKILL.md)
[External](https://example.invalid)
[Unsafe](javascript:alert(1))
""")
    write(user_root, ".kiro/steering/notes.txt", "plain text in the user Kiro tree\n")
    write(user_root, ".kiro/settings.json", '{"name":"viewer","enabled":true}')
    write(user_root, ".kiro/scripts/check.py", "print('user check')\n")
    write(user_root, ".kiro/steering/safe.md.bak", "backup must appear nowhere\n")
    write_bytes(user_root, ".kiro/steering/icon.bin", b"\x00\x01binary")
    oversized = user_root / ".kiro/steering/oversized.md"
    oversized.parent.mkdir(parents=True, exist_ok=True)
    oversized.write_bytes(b"x" * (MAX_READABLE_BYTES + 1))

    write(user_root, ".kiro/steering/global.md", "# User Kiro steering\n")
    write(user_root, ".kiro/knowledge/guide.md", "# User Kiro knowledge\n")
    write(user_root, ".kiro/skills/example/SKILL.md", """# Example skill
[Guide](references/guide.md)
#[[file:scripts/check.py]]
`assets/icon.txt`
[External](https://example.invalid)
[Missing](references/missing.md)
[Outside](../other.md)
""")
    write(user_root, ".kiro/skills/example/references/guide.md", "# Guide\n")
    write(user_root, ".kiro/skills/example/scripts/check.py", "print('check')\n")
    write(user_root, ".kiro/skills/example/assets/icon.txt", "icon\n")
    write(user_root, ".kiro/skills/existing/SKILL.md", "# Existing skill\n")
    write(user_root, ".kiro/logs/runtime.log", "runtime data is not a viewer target\n")
    write(user_root, ".kiro/db_config.ini", "password=not-for-display\n")
    write(user_root, ".claude/CLAUDE.md", "# User Claude instruction\n")
    write(user_root, ".claude/commands/user.md", "# User Claude command\n")
    write(user_root, ".claude/rules/example.md", "# User Claude rule\n")
    write(user_root, "GEMINI.md", "# User Gemini instruction\n")
    write(user_root, ".gemini/commands/example.toml", 'name = "user-example"\n')
    write(user_root, ".gemini/skills/user/SKILL.md", "# User Gemini skill\n")
    write(user_root, ".codex/config.toml", 'model = "user-test"\n')


if __name__ == "__main__":
    main()
