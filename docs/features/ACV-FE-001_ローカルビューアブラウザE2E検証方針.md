---
title: "ローカルビューア ブラウザE2E検証方針"
document_type: "feature_plan"
version: "1.1"
status: "implemented_pending_ci"
created_at: "2026-09-08"
updated_at: "2026-09-08"
author: "xzyozi"
purpose: "ローカルビューアのProviderタブ、ファイル一覧、本文プレビューをGitHub Actionsで自動検証し、手動スモーク確認を最小化する。"
related_documents:
  - "../setup/local_viewer_ci_validation.md"
  - "../design/ACV-DD-001_閲覧フロー詳細設計書.md"
  - "../design/ACV-DS-001_画面内データ構造仕様書.md"
  - "../archive/ACV-PM-001_初期実装タスクフロー.md"
---
# ローカルビューア ブラウザE2E検証方針
| 項目     | 内容                   |
| :------- | :--------------------- |
| 文書番号 | ACV-FE-001             |
| 状態     | 実装済み（CI検証待ち） |
| 実装区分 | CI専用PR               |
## 1. 目的
既存の`Validate local viewer` workflowにBrowser E2Eジョブを追加し、実ブラウザでのProviderタブ、許可済みファイル一覧、プレーンテキスト本文プレビューを自動検証する。構文検査とBrowser E2Eは一つのworkflowにまとめるが、失敗箇所を明確にするためジョブは分離する。
## 2. テスト環境
CIは実ユーザーのホームを読まず、ジョブ内の一時HOMEに4 Providerの最小フィクスチャを作成する。`HOME`を一時HOMEへ設定して`server.py`をバックグラウンド起動し、loopbackの`http://127.0.0.1:8765/`だけをブラウザで操作する。
| フィクスチャ                  | 確認目的                                      |
| :---------------------------- | :-------------------------------------------- |
| KiroのSteering Markdown       | 一覧と本文プレビュー                          |
| Claudeの`CLAUDE.md`とRules    | ホーム直下ファイルとProvider root内ファイル   |
| Geminiの`GEMINI.md`とCommands | ホーム直下ファイルとTOML表示                  |
| Codexの`config.toml`          | Codexタブと許可対象の限定                     |
| 2MiB超の許可対象ファイル      | サイズ超過時に本文を表示しないこと            |
| HTML文字列を含むMarkdown      | `<pre>.textContent`によりHTMLを実行しないこと |
## 3. Browser E2Eの受入条件
- Kiro、Claude、Gemini、Codexのタブが固定順で表示される。
- 各タブでフィクスチャの許可済みファイルだけが一覧に表示される。
- 一覧のファイル選択後、対応する本文がプレーンテキストで表示される。
- HTML文字列はDOM要素として解釈されず、文字列のまま表示される。
- 2MiB超のファイルは本文を返さず、サイズ超過メッセージを表示する。
- Providerの未検出または本文読取失敗で、他Providerの一覧を失わない。
## 4. 実装方針
- `validate-local-viewer.yml`に、既存の構文検査とは独立した`browser-e2e`ジョブを追加する。
- ブラウザ操作にはPlaywrightを採用し、テストパッケージとブラウザバイナリのバージョンを固定する。
- テストは`tests/browser/`へ配置し、テストデータは一時HOMEまたはテスト用フィクスチャに限定する。
- サーバー起動完了を確認してからテストを開始し、成功・失敗を問わずジョブ終了時にプロセスを停止する。
- 失敗時はスクリーンショット、trace、サーバーログをCI成果物として保存する。ただし設定本文・実ユーザーHOME・認証情報を成果物に含めない。
## 5. 非対象と制約
実ユーザー環境、Windows固有の権限・再解析ポイント、旧ブラウザタブやキャッシュ、任意パス選択、MarkdownのHTMLレンダリングは対象外である。CIは機能回帰を検出するものであり、初回または大きな変更後の実Windows環境での手動確認を完全には置き換えない。
## 6. 実装・検証状況
Playwrightの固定版、合成フィクスチャ、PR限定の`browser-e2e`ジョブ、失敗時artifactの保持期間を実装した。Browser E2Eは対象ファイルを変更するPRでだけ実行し、結果はPRのChecksで確認する。手動workflow実行やFeatureブランチへのpushごとのBrowser E2Eは行わない。
## 7. 改訂履歴
| 版数    | 改訂日     | 変更者 | 変更内容                                                                                      |
| :------ | :--------- | :----- | :-------------------------------------------------------------------------------------------- |
| Rev.1.0 | 2026-09-08 | xzyozi | 初期ローカルビューアの完了後、Browser E2E自動化方針をFeatureとして作成。                      |
| Rev.1.1 | 2026-09-08 | xzyozi | Playwright固定版、合成フィクスチャ、Browser E2Eジョブを実装。GitHub Actionsでの初回検証待ち。 |
| Rev.1.2 | 2026-09-08 | xzyozi | Browser E2EをPR限定とし、手動workflow実行を廃止。                                             |