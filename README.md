# agent-config-viewer

ユーザー環境にあるAIエージェント設定を、ローカルだけで確認する閲覧アプリケーションです。Providerとユーザーrootを切り替え、初期状態では折りたたまれたディレクトリツリーからファイルを選択できます。MarkdownはStackEditを参考にしたプレビューで表示します。

## 対象

次のユーザー側固定rootだけを走査します。プロジェクトrootは走査しません。ブラウザから任意のパスを指定することはできません。

- Kiro: `~/.kiro`
- Claude: `~/.claude`、`~/CLAUDE.md`
- Gemini: `~/.gemini`、`~/GEMINI.md`
- Codex: `~/.codex`、`~/AGENTS.md`

各root配下の通常ファイルを再帰的に表示します。`.bak`、`.backup`、`.old`、`.orig`、`.swp`、`.swo`、`~`末尾、`.#[...]`形式のバックアップファイルは除外します。ログ、セッション、キャッシュ、一時ディレクトリも閲覧対象から除外します。

- 初期カタログ生成では本文を読み込まず、拡張子とファイルサイズを中心に判定します。
- バイナリファイルはファイル名、パス、種別、サイズだけを表示し、本文を読みません。
- 秘密情報を含む可能性が高いファイル（`.env`、秘密鍵、token/password/secret/credentialを含む名前、既知の接続設定）は本文を表示せず、保護済みメタ情報だけを表示します。
- UTF-8のテキストファイルは、選択時に2MiB上限内で本文を閲覧できます。
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

フロントエンドを使わず、対応Providerのユーザー設定一覧を確認できます。

```powershell
# 全Providerの対象ファイルを一覧表示
py cli.py list

# Kiroだけを一覧表示
py cli.py list --provider kiro

# 他ツール連携用のJSON出力
py cli.py list --json
```

CLIはファイル本文を読まず、固定されたユーザーrootからの相対パスとProviderごとの検出結果だけを表示します。

## テスト用root

CIなどの隔離環境では、起動時の環境変数でユーザーrootを差し替えられます。通常利用では設定不要です。

```powershell
$env:AGENT_CONFIG_VIEWER_HOME_ROOT = "C:\fixtures\user"
py server.py
```

## 安全境界

- サーバーは固定されたユーザーProvider rootだけを走査し、実パスをブラウザへ渡しません。
- カタログ作成時に不透明なFile IDを発行し、本文取得時にパス・リンク・通常ファイル・サイズ・バイナリ・UTF-8を再検証します。
- シンボリックリンクとWindowsの再解析ポイントを走査・本文取得・Skill操作の対象外にします。
- MarkdownのHTMLやスクリプトはDOM APIのテキストノードとして扱い、実行しません。
- 本文はファイル選択時に遅延読込し、初期走査のI/Oを抑えます。

## 検証

```powershell
py -3 -m py_compile server.py cli.py backend/kiro_catalog.py tests/browser/create-fixtures.py
npm run test:browser
```

ブラウザE2Eは`.github/workflows/validate-local-viewer.yml`で、一時的なユーザーrootだけを使って実行します。
