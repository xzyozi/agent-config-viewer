# ローカルビューアCI検証運用
## 目的
`.github/workflows/validate-local-viewer.yml` により、構文・空HOME CLI・Browser E2EをGitHub Actionsで検証する。Browser E2Eは実ユーザーの設定を使わず、合成した一時HOMEだけを対象とする。
## 実行契機
`main`または`develop`へのpush・PRで、`server.py`、`cli.py`、`index.html`、`src/**/*.js`、`tests/browser/**`、`package.json`、`playwright.config.mjs`、workflow自身のいずれかが変わると実行する。`workflow_dispatch`にも対応する。Docsだけの変更はMermaid検証workflowを使用する。
## ジョブと検証内容
| ジョブ                  | 固定環境                                 | 確認内容                                                                                             |
| :---------------------- | :--------------------------------------- | :--------------------------------------------------------------------------------------------------- |
| `validate-local-viewer` | Python 3.12.8、Node.js 22.14.0           | Python構文、空HOMEのCLI JSON、`src/**/*.js`の構文                                                    |
| `browser-e2e`           | Python 3.12.8、Node.js 22.14.0、Chromium | 合成HOMEのProviderタブ、許可済み一覧、プレーンテキスト本文、HTML非実行、2MiB超拒否、Provider部分失敗 |
## Browser E2E環境
`tests/browser/create-fixtures.py`が一時HOMEにKiro、Claude、Gemini、Codexの非機密フィクスチャを作成する。`HOME`を設定して`server.py`をloopbackで起動し、Playwrightが`http://127.0.0.1:8765/`を操作する。テストは`tests/browser/local-viewer.spec.mjs`、設定は`playwright.config.mjs`を正本とする。
## 依存・再現性
`package.json`は`@playwright/test`を`1.54.1`へ固定する。CIでは`npm install --ignore-scripts`後にChromiumだけを取得する。ローカル開発者にNode.js・Playwright・ブラウザ導入は要求しない。
## 失敗時の取扱い
失敗時だけ、合成フィクスチャ由来の`test-results`、`playwright-report`、サーバーログをGitHub Actions artifactとして7日間保持する。実ユーザーHOME、認証情報、実設定本文をartifactへ含めない。サーバープロセスは成功・失敗を問わず停止する。
## 非対象
実ユーザー環境、Windows固有の権限・再解析ポイント、旧ブラウザタブやキャッシュ、任意パス選択、MarkdownのHTMLレンダリングは対象外である。初回または大きな変更後の実Windows環境での手動確認は引き続き推奨する。
