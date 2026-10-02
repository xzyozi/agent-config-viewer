# agent-config-viewer

プロジェクトとユーザー環境にあるAIエージェント設定を、ローカルだけで確認する閲覧アプリケーションです。Providerとrootを切り替え、ディレクトリツリーからファイルを選択できます。MarkdownはStackEditを参考にしたプレビューで表示します。

## 対象

次の固定rootだけを走査します。ブラウザから任意のパスを指定することはできません。

- Kiro: プロジェクト`.kiro`、ユーザー`~/.kiro`
- Claude: プロジェクト`.claude`、ユーザー`~/.claude`、`CLAUDE.md`
- Gemini: プロジェクト`.gemini`、ユーザー`~/.gemini`、`GEMINI.md`
- Codex: プロジェクト`.codex`、ユーザー`~/.codex`、`AGENTS.md`

各root配下の通常ファイルを再帰的に表示します。`.bak`、`.backup`、`.old`、`.orig`、`.swp`、`.swo`、`~`末尾、`.#[...]`形式のバックアップファイルは除外します。ログ、セッション、キャッシュ、一時ディレクトリも閲覧対象から除外します。

- バイナリファイルはファイル名、パス、種別、サイズだけを表示し、本文を読みません。
- 秘密情報を含む可能性が高いファイル（`.env`、秘密鍵、token/password/secret/credentialを含む名前、既知の接続設定）は本文を表示せず、保護済みメタ情報だけを表示します。
- UTF-8のテキストファイルは、既存の2MiB上限内で本文を閲覧できます。
- Markdownは見出し、段落、リスト、コードブロック、表、リンクなどを安全にレンダリングします。
- JSONは整形したJSONビュー、TOML/YAML/JavaScript/Python/CSS/HTML/Shellは安全なソースコードビュー、その他のテキストはプレーンテキストビューで表示します。
- ディレクトリは初期状態では展開せず、必要なroot・ディレクトリを選択して展開します。
- 同じroot内の相対Markdownリンクは、解決できるファイルへの閲覧遷移として扱います。外部HTTPリンクは安全属性付きで開き、未許可のスキームはリンク化しません。

通常の構成閲覧は読み取り専用です。既存のIssue #12で実装されたKiro Skill bundleの同一Provider内コピー機能は、選択したSkillから別途実行できます。

## ローカルでの起動

Pythonが利用できるWindows環境で、リポジトリのルートから次を**手動で**実行します。

```powershell
py server.py
```

Chromium系ブラウザで <http://127.0.0.1:8765/> を開いてください。サーバーは`127.0.0.1`だけで待受し、外部通信を行いません。

## CLI

フロントエンドを使わず、対応Providerの対象ファイル一覧を確認できます。

```powershell
# 全Providerの対象ファイルを一覧表示
py cli.py list

# Kiroだけを一覧表示
py cli.py list --provider kiro

# 他ツール連携用のJSON出力
py cli.py list --json
```

CLIはファイル本文を読まず、固定rootからの相対パスとProviderごとの検出結果だけを表示します。

## テスト用root

CIなどの隔離環境では、起動時の環境変数で走査rootを差し替えられます。通常利用では設定不要です。

```powershell
$env:AGENT_CONFIG_VIEWER_PROJECT_ROOT = "C:\fixtures\project"
$env:AGENT_CONFIG_VIEWER_HOME_ROOT = "C:\fixtures\user"
py server.py
```

## 安全境界

- サーバーは固定されたProvider rootだけを走査し、実パスをブラウザへ渡しません。
- カタログ作成時に不透明なFile IDを発行し、本文取得時にパス・リンク・通常ファイル・サイズ・バイナリ・UTF-8を再検証します。
- シンボリックリンクとWindowsの再解析ポイントを走査・本文取得・Skill操作の対象外にします。
- MarkdownのHTMLやスクリプトはDOM APIのテキストノードとして扱い、実行しません。
- 初期の表示制限は最小限に留めていますが、root走査、カタログ生成、本文取得、表示を分離しているため、将来の表示制限や性能対策を追加できます。

## 検証

```powershell
py -3 -m py_compile server.py cli.py backend/kiro_catalog.py tests/browser/create-fixtures.py
npm run test:browser
```

ブラウザE2Eは`.github/workflows/validate-local-viewer.yml`で、一時的なプロジェクトrootとユーザーrootを使って実行します。
