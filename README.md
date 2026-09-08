# agent-config-viewer

起動したユーザーのホームディレクトリにあるAIエージェント設定を、ローカルだけで一覧表示するアプリケーションです。外部送信、編集、保存は行いません。

## 対象

Providerごとにページ内タブを表示し、次の許可済みパスだけを走査します。

- Kiro: `.kiro/steering/**/*.md`、`.kiro/skills/**/SKILL.md`、`.kiro/knowledge/**/*.md`
- Claude: ホーム直下の `CLAUDE.md`、`.claude/settings.json`、`rules/**/*.md`、`skills/**/SKILL.md`、`commands/**/*.md`、`agents/**/*.md`
- Gemini: ホーム直下の `GEMINI.md`、`.gemini/settings.json`、`commands/**/*.toml`、`skills/**/SKILL.md`
- Codex: `.codex/config.toml`、`.codex/*.config.toml`

Codexの認証情報、履歴、ログなどは一覧対象に含めません。

## ローカルでの起動

Pythonが利用できるWindows環境で、リポジトリのルートから次を**手動で**実行します。

```powershell
py server.py
```

Chromium系ブラウザで <http://127.0.0.1:8765/> を開いてください。サーバーは `127.0.0.1` だけで待受し、任意パスの読取・外部公開・外部通信を行いません。

## CLI

フロントエンドを使わず、同じ許可済み範囲を確認できます。

```powershell
# 全Providerの対象ファイルを一覧表示
py cli.py list

# Geminiだけを一覧表示
py cli.py list --provider gemini

# 他ツール連携用のJSON出力
py cli.py list --json
```

CLIはファイル本文を読まず、許可済みの相対パスとProviderごとの検出結果だけを表示します。

ファイル本文の読取・Markdown表示は後続タスクの対象です。
