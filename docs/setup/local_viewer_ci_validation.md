# ローカルビューアCI検証運用
## 目的
`.github/workflows/validate-local-viewer.yml` により、ローカルビューアの依存なしで実行できる基本回帰検証をGitHub Actions上で行う。実ユーザーのホーム、設定本文、長時間サーバー、ブラウザE2EはCIで扱わない。
## 実行契機
`main`または`develop`へのpush・PRで、`server.py`、`cli.py`、`index.html`、`src/**/*.js`、workflow自身のいずれかが変わると実行する。`workflow_dispatch`による手動実行も可能である。`docs/`だけの変更では実行せず、Mermaid検証workflowを利用する。
## 検証内容
| 手順              | 固定環境        | 確認内容                                                                                                               |
| :---------------- | :-------------- | :--------------------------------------------------------------------------------------------------------------------- |
| Python構文検査    | Python 3.12.8   | `python -m py_compile server.py cli.py`が成功すること                                                                  |
| 空HOME CLI        | Python 3.12.8   | 空ディレクトリを`HOME`に指定した`python cli.py list --json`が成功し、4 Providerがすべて`not_found`かつ空一覧であること |
| ES Module構文検査 | Node.js 22.14.0 | `src/**/*.js`へ`node --check`を実行し構文エラーがないこと                                                              |
## セキュリティ・再現性
CIは空の一時HOMEだけを使用し、実ユーザーの設定、本文、認証情報、履歴、ログを読まない。追加パッケージを導入せず、PythonとNode.jsのセットアップアクションはworkflowで明示した固定バージョンを使う。ローカル開発者にNode.js導入は要求しない。
## 非対象
本文APIのHTTPスモーク、実ブラウザでのタブ操作、実ユーザーHOMEの走査、外部ネットワーク、Markdownレンダリング、依存関係監査は対象外である。本文APIのCI追加はテスト範囲と実行方式を合意した後、CI専用PRで行う。
## ローカル確認
Windows環境では、必要に応じてリポジトリルートで`py -m py_compile server.py cli.py`および`py cli.py list --json`を実行する。ES Module構文はローカルNode.jsを前提とせず、CI結果で確認する。
