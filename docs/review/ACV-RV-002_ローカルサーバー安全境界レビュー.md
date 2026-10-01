---
title: "agent-config-viewer ローカルサーバー安全境界レビュー"
document_type: "implementation_review"
version: "2.0"
created_at: "2026-09-08"
updated_at: "2026-10-01"
author: "xzyozi"
purpose: "Kiro構成の再帰走査、本文取得、Markdown表示、Skill bundleコピーの安全境界を実装と照合して記録する。"
related_documents:
  - "../design/ACV-BD-001_基本設計書.md"
  - "../design/ACV-DD-001_閲覧フロー詳細設計書.md"
  - "../design/ACV-DD-002_Skill_bundleパス移行詳細設計書.md"
  - "../design/ACV-DS-001_画面内データ構造仕様書.md"
---
# ローカルサーバー安全境界レビュー

## 1. 対象・結論

対象は`server.py`、`backend/kiro_catalog.py`、`backend/skill_migration.py`、`LocalConfigSource`、`Catalog`、`AppShell`、`BrowserView`、`markdown-renderer.js`である。プロジェクト`.kiro`だけを固定rootとして再帰走査し、不透明File ID、本文取得時の再検証、DOM APIによるMarkdown表示を確認した。定義した初期スコープの範囲で、安全な閲覧を提供できると判断する。

## 2. 確認結果

| 観点               | 結果 | 根拠                                                                    |
| :----------------- | :--- | :---------------------------------------------------------------------- |
| 待受範囲           | 適合 | `ThreadingHTTPServer`は`127.0.0.1:8765`だけにbindする                   |
| 読取範囲           | 適合 | プロセス起動時のプロジェクト`.kiro`だけを走査する                       |
| バックアップ       | 適合 | `.bak`等の固定判定に一致するファイルを一覧から除外する                  |
| リンク回避         | 適合 | 走査時と本文取得時にシンボリックリンク・Windows再解析ポイントを拒否する |
| File ID            | 適合 | 実パスをブラウザへ渡さず、プロセス内メモリの不透明IDで取得する          |
| バイナリ           | 適合 | 種別を`binary`として本文取得せず、UIはメタ情報だけ表示する              |
| パストラバーサル   | 適合 | File ID経由のみで、解決後の実体が許可root内か再検証する                 |
| Markdown DOM安全性 | 適合 | `innerHTML`を使わず、テキストノードと許可要素だけを生成する             |
| 外部参照           | 適合 | サーバーは外部取得せず、外部HTTPリンクには`noopener noreferrer`を付ける |
| Skillコピー        | 適合 | 既存Issue #12のステージング・digest・非上書き検証を維持する             |

## 3. 残余リスクと制約

- loopbackであっても、同じ端末・同じユーザー権限で接続できる別プロセスからの閲覧を防ぐ認証機構はない。
- File IDはプロセス内カタログにだけ有効であり、Refreshまたはサーバー再起動後は失効する。
- Markdownレンダラーは主要な閲覧構文に絞った実装であり、完全なCommonMark/GFM互換を保証しない。
- 表示性能のための高度なサイズ制限、仮想スクロール、検索、差分、編集は未実装である。
- Windows固有の権限・再解析ポイントは、CIのLinux検証だけでは完全に代替できない。

## 4. 検証記録

Python構文検査、Kiroカタログのバックアップ除外・バイナリ判定・本文取得スモーク、`git diff --check`を実施した。Browser E2EはNode.jsが利用できるCI環境で実行する。ローカル環境ではNode.js未導入のため、PlaywrightとJavaScript構文検査は未実行である。

## 5. 改訂履歴

| 版数    | 改訂日     | 変更者 | 変更内容                                                       |
| :------ | :--------- | :----- | :------------------------------------------------------------- |
| Rev.1.0 | 2026-09-08 | xzyozi | ローカルサーバー方式と許可範囲をレビュー。                     |
| Rev.1.1 | 2026-09-15 | xzyozi | Skill bundleコピーAPIと非上書き境界を反映。                    |
| Rev.2.0 | 2026-10-01 | xzyozi | Kiro再帰走査、バイナリ・バックアップ・Markdown安全表示を反映。 |
