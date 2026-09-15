---
title: "agent-config-viewer ローカルサーバー安全境界レビュー"
document_type: "implementation_review"
version: "1.1"
created_at: "2026-09-08"
updated_at: "2026-09-15"
author: "xzyozi"
purpose: "ローカルサーバー方式、許可範囲、本文取得とSkill bundleコピーAPIの安全境界を実装と照合して記録する。"
related_documents:
  - "../design/ACV-BD-001_基本設計書.md"
  - "../design/ACV-DD-001_閲覧フロー詳細設計書.md"
  - "../design/ACV-DD-002_Skill_bundleパス移行詳細設計書.md"
  - "../design/ACV-DS-001_画面内データ構造仕様書.md"
---
# ローカルサーバー安全境界レビュー
## 1. 対象・結論
対象は`server.py`、`backend/skill_migration.py`、`LocalConfigSource`、`Catalog`、`AppShell`、`BrowserView`である。閲覧機能に加え、Kiroの直接子Skill bundleを同一`.kiro/skills`内へコピーするPhase 3を確認した。固定許可範囲、不透明ID、実行直前の再検証、ステージング、非上書き確定、固定エラー、プレーンテキスト表示が一貫しており、定義済みの制限内でコピーを提供してよいと判断する。移動、Provider横断、任意パス、既存宛先への上書き、参照更新は対象外である。
## 2. 確認結果
| 観点                   | 結果 | 根拠                                                                                                                 |
| :--------------------- | :--- | :------------------------------------------------------------------------------------------------------------------- |
| 待受範囲               | 適合 | `ThreadingHTTPServer`は`127.0.0.1:8765`だけにbindする                                                                |
| 読取範囲               | 適合 | `Path.home()`配下の固定Provider rootと固定ホームファイルだけを走査する                                               |
| 書込範囲               | 適合 | カタログが発行したKiroの直接子Skill bundleだけを、同一`.kiro/skills`直下へコピーできる                               |
| 任意パス・Provider横断 | 適合 | 不透明File ID、一階層宛先名、固定root検証により受け付けない                                                          |
| リンク回避             | 適合 | source、skills root、stage、宛先でシンボリックリンクとWindows再解析ポイントを拒否する                                |
| 陳腐化・競合           | 適合 | 表示済みdigestと実行直前snapshotを照合し、Linuxは`RENAME_NOREPLACE`、Windowsは既存宛先で失敗するrenameで上書きを防ぐ |
| source保全             | 適合 | 専用stageでsnapshot完全一致を確認し、失敗時は所有確認済みstageだけを除去してsourceを変更しない                       |
| パス・エラー露出       | 適合 | 相対bundlePathと固定コードだけを返し、本文・絶対パス・OS例外を返さない                                               |
| DOM安全性              | 適合 | 本文を`<pre>.textContent`で表示し、コピー結果・エラーもDOM APIのテキストとして表示する                               |
| Provider部分失敗       | 適合 | `ProviderResult`で失敗を分離し、他Providerの結果を維持する                                                           |
## 3. 残余リスクと制約
- loopbackであっても、同じ端末・同じユーザー権限で接続できる別プロセスからの閲覧・コピーを防ぐ認証機構はない。確認checkboxは認可ではない。本ツールは単一ユーザーのローカル利用を前提とし、共有端末・権限分離環境の保護境界には用いない。
- File IDはプロセス内カタログにだけ有効であり、新規カタログ生成またはサーバー再起動後は失効する。クライアントは`read_failed`として扱う。
- LinuxとWindows以外では、安全な非上書き確定を提供できない場合に`copy_failed`で中止する。
- ディレクトリ操作と同一権限の別プロセスによる敵対的な競合を、OSのファイルシステム保証を超えて防ぐものではない。
- MarkdownのHTMLレンダリング、外部画像・リンクの読込、任意パス選択、編集・作成・改名・削除、bundle移動は未実装であり、本レビューの対象外である。
## 4. 検証記録
Python構文検査、隔離fixtureでのbackendコピーsmoke、変更ファイルの診断、`git diff --check`を実施した。コピーのブラウザE2EはローカルNode.js未導入のため未実行であり、PRのGitHub Actionsで確認する。
## 5. 改訂履歴
| 版数    | 改訂日     | 変更者 | 変更内容                                                             |
| :------ | :--------- | :----- | :------------------------------------------------------------------- |
| Rev.1.0 | 2026-09-08 | xzyozi | ローカルサーバー方式と本文プレビューの安全境界をレビュー。           |
| Rev.1.1 | 2026-09-15 | xzyozi | Phase 3のSkill bundleコピーAPI、UI、非上書き確定、残余リスクを反映。 |
