# ローカルビューアCI検証運用

## 目的

`.github/workflows/validate-local-viewer.yml`により、ユーザーroot限定の複数Providerカタログ、Python構文、空root、ES Module構文、Browser E2Eを検証する。Browser E2Eは実ユーザーの設定を使わず、一時ユーザーrootだけを対象にする。

## ジョブと検証内容

| ジョブ                  | 実行契機 | 固定環境                                 | 確認内容                                                                                   |
| :---------------------- | :------- | :--------------------------------------- | :----------------------------------------------------------------------------------------- |
| `validate-local-viewer` | push、PR | Python 3.12.8、Node.js 22.14.0           | Python構文、空ユーザーrootの4 Provider CLI JSON、`src/**/*.js`の構文                       |
| `browser-e2e`           | PRのみ   | Python 3.12.8、Node.js 22.14.0、Chromium | 4 Provider、初期折りたたみ、遅延本文、拡張子別View、除外・保護・バイナリ、Skill bundle回帰 |

## Browser E2E環境

`tests/browser/create-fixtures.py`が一時ユーザーrootにKiro、Claude、Gemini、Codexフィクスチャを作成する。`AGENT_CONFIG_VIEWER_HOME_ROOT`を設定して`server.py`をloopbackで起動し、Playwrightが操作する。

## 依存・再現性

`package.json`は`@playwright/test`を`1.54.1`へ固定する。ローカル環境にNode.js/npmがない場合は、Python/APIスモークとCIのNode検証を利用する。

## 非対象

プロジェクトroot、実ユーザー環境、Windows固有の権限・再解析ポイント、自動ファイル監視、編集、差分、高度な検索、完全なMarkdown互換性は対象外である。
