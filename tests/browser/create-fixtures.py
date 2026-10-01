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
    root = Path(sys.argv[1])
    write(root, ".kiro/steering/safe.md", """# Kiro safe

<script id="unsafe">window.e2eExecuted = true</script>

## Features

- **Markdown** preview
- `safe` text

| Name | Value |
| --- | --- |
| Scope | Kiro |

[Guide](../skills/example/SKILL.md)
[External](https://example.invalid)
[Unsafe](javascript:alert(1))
""")
    write(root, ".kiro/steering/notes.txt", "plain text in the Kiro tree\n")
    write(root, ".kiro/steering/safe.md.bak", "backup must not appear\n")
    write_bytes(root, ".kiro/steering/icon.bin", b"\x00\x01binary")
    write(root, ".kiro/skills/example/SKILL.md", """# Example skill
[Guide](references/guide.md)
#[[file:scripts/check.py]]
`assets/icon.txt`
[External](https://example.invalid)
[Missing](references/missing.md)
[Outside](../other.md)
""")
    write(root, ".kiro/skills/example/references/guide.md", "# Guide\n")
    write(root, ".kiro/skills/example/scripts/check.py", "print('check')\n")
    write(root, ".kiro/skills/example/assets/icon.txt", "icon\n")
    write(root, ".kiro/skills/existing/SKILL.md", "# Existing skill\n")
    oversized = root / ".kiro/steering/oversized.md"
    oversized.parent.mkdir(parents=True, exist_ok=True)
    oversized.write_bytes(b"x" * (MAX_READABLE_BYTES + 1))


if __name__ == "__main__":
    main()
