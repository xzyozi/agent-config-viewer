# ローカルビューアCI検証運用

## 目的

`.github/workflows/validate-local-viewer.yml`により、KiroカタログのPython構文・空プロジェクトroot・ES Module構文・Browser E2Eを検証する。Browser E2Eは実ユーザーの設定を使わず、一時プロジェクトrootのKiroフィクスチャだけを対象にする。

## 実行契機

`main`または`develop`へのpushでは、Python構文・空プロジェクトroot CLI・ES Module構文を検証する。対象ファイルを変更する`main`または`develop`向けPRでは、これらに加えてBrowser E2Eを実行する。手動workflow実行は設けない。

## ジョブと検証内容

| ジョブ                  | 実行契機 | 固定環境                                 | 確認内容                                                                           |
| :---------------------- | :------- | :--------------------------------------- | :--------------------------------------------------------------------------------- |
| `validate-local-viewer` | push、PR | Python 3.12.8、Node.js 22.14.0           | Python構文、空rootのKiro CLI JSON、`src/**/*.js`の構文                             |
| `browser-e2e`           | PRのみ   | Python 3.12.8、Node.js 22.14.0、Chromium | Kiroツリー、Markdown、バックアップ除外、バイナリ情報、サイズ超過、Skill bundle回帰 |

## Browser E2E環境

`tests/browser/create-fixtures.py`が一時rootにKiroの非機密フィクスチャを作成する。`AGENT_CONFIG_VIEWER_PROJECT_ROOT`を設定して`server.py`をloopbackで起動し、Playwrightが`http://127.0.0.1:8765/`を操作する。テストは`tests/browser/local-viewer.spec.mjs`、設定は`playwright.config.mjs`を正本とする。

## 依存・再現性

`package.json`は`@playwright/test`を`1.54.1`へ固定する。CIでは`npm install --ignore-scripts`後にChromiumだけを取得する。ローカル開発者にNode.js・Playwright・ブラウザ導入は要求しないが、E2Eをローカル実行する場合は同じ固定依存を利用する。

## 失敗時の取扱い

失敗時だけ、合成フィクスチャ由来の`test-results`、`playwright-report`、サーバーログをGitHub Actions artifactとして7日間保持する。実ユーザーの`.kiro`、認証情報、実設定本文をartifactへ含めない。サーバープロセスは成功・失敗を問わず停止する。

## 非対象

実ユーザー環境、Windows固有の権限・再解析ポイント、自動ファイル監視、任意パス選択、完全なMarkdown互換性、編集・差分・検索は対象外である。初回または大きな変更後のWindows実環境での手動確認は引き続き推奨する。
