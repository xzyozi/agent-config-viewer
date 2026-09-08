# agent-config-viewer

ローカルフォルダをユーザーが選択し、その配下のAIエージェント設定を閲覧する静的Webアプリケーションです。初期版は外部送信、編集、保存を行いません。

## T-SRC-001で提供する機能

- Chromium系ブラウザの File System Access API を使ったフォルダ選択
- 選択ルート配下の `.kiro` 検出
- `.kiro/steering/**/*.md`、`.kiro/skills/**/SKILL.md`、`.kiro/knowledge/**/*.md` の一覧表示

ファイル本文の読取・Markdown表示、Claude/Gemini対応、Firefoxなどへのフォールバックは後続タスクの対象です。

## ローカルでの起動

Pythonが利用できるWindows環境では、リポジトリのルートで次を**手動で**実行します。

```powershell
py -m http.server 8765 --bind 127.0.0.1
```

次に Chromium系ブラウザで <http://localhost:8765/> を開いてください。これは開発用のローカル静的サーバーであり、設定ファイルを外部へ送信しません。

このリポジトリではNode.js依存、ビルド手順、CI変更は不要です。`file://` 直開きはブラウザの制約によりサポートしません。
