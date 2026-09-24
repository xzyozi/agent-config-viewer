#!/usr/bin/env bash
# agent-config-viewer 起動スクリプト (macOS / Linux)
# リポジトリのルートで server.py を起動し、127.0.0.1:8765 で待受します。

set -euo pipefail

# スクリプトのあるディレクトリへ移動
cd "$(dirname "$0")"

if command -v python3 >/dev/null 2>&1; then
    exec python3 server.py
elif command -v python >/dev/null 2>&1; then
    exec python server.py
else
    echo "Python が見つかりません。Python をインストールしてください。" >&2
    exit 1
fi
