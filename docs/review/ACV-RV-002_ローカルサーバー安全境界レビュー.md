---
title: "agent-config-viewer ローカルサーバー安全境界レビュー"
document_type: "implementation_review"
version: "4.0"
created_at: "2026-09-08"
updated_at: "2026-10-02"
author: "xzyozi"
purpose: "ユーザーroot限定の複数Provider走査、遅延本文取得、拡張子別View、Markdown表示、Skill bundleコピーの安全境界を実装と照合する。"
related_documents:
  - "../design/ACV-BD-001_基本設計書.md"
  - "../design/ACV-DD-001_閲覧フロー詳細設計書.md"
  - "../design/ACV-DD-002_Skill_bundleパス移行詳細設計書.md"
  - "../design/ACV-DS-001_画面内データ構造仕様書.md"
---
# ローカルサーバー安全境界レビュー

## 1. 対象・結論

対象は`server.py`、`backend/kiro_catalog.py`、`backend/skill_migration.py`、`LocalConfigSource`、`Catalog`、`AppShell`、`BrowserView`、`markdown-renderer.js`である。ユーザーrootだけを固定宣言から走査し、既知拡張子のカタログ分類で本文を読まず、選択時に本文を遅延取得することを確認した。定義した初期スコープの範囲で、安全かつ従来より軽量な閲覧を提供できると判断する。

## 2. 確認結果

| 観点                   | 結果 | 根拠                                                                   |
| :--------------------- | :--- | :--------------------------------------------------------------------- |
| 待受範囲               | 適合 | `ThreadingHTTPServer`は`127.0.0.1:8765`だけにbindする                  |
| 読取範囲               | 適合 | Providerごとに宣言したユーザーrootと固定ファイルだけを走査する         |
| プロジェクトroot       | 適合 | 初期カタログの対象から除外する                                         |
| 初期I/O                | 適合 | 既知拡張子では本文サンプルを読まず、未知拡張子だけ512 bytesを確認する  |
| 本文取得               | 適合 | File ID選択後に2MiB以下の本文を遅延取得する                            |
| バックアップ・運用領域 | 適合 | `.bak`等、logs、sessions、tmp等を対象外にする                          |
| 保護ファイル           | 適合 | 接続設定、秘密鍵、token/password/secret/credential名を本文非表示にする |
| リンク回避             | 適合 | 走査時と本文取得時にシンボリックリンク・再解析ポイントを拒否する       |
| Markdown DOM安全性     | 適合 | `innerHTML`を使わず、テキストノードと許可要素だけを生成する            |

## 3. 残余リスクと制約

- loopbackであっても、同じ端末・同じユーザー権限で接続できる別プロセスからの閲覧を防ぐ認証機構はない。
- File IDはプロセス内カタログにだけ有効であり、Refreshまたはサーバー再起動後は失効する。
- Markdownレンダラーは主要な閲覧構文に絞った実装であり、完全なCommonMark/GFM互換を保証しない。
- 表示性能のための高度なサイズ制限、仮想スクロール、検索、差分、編集は未実装である。
- Windows固有の権限・再解析ポイントは、CIのLinux検証だけでは完全に代替できない。

## 4. 検証記録

Python構文、ユーザーroot限定カタログ、分類時間、保護・除外、HTTPスモーク、`git diff --check`を確認する。Browser E2Eと`node --check`はNode.jsが利用できるCI環境で実行する。

## 5. 改訂履歴

| 版数    | 改訂日     | 変更者 | 変更内容                                            |
| :------ | :--------- | :----- | :-------------------------------------------------- |
| Rev.1.0 | 2026-09-08 | xzyozi | ローカルサーバー方式と許可範囲をレビュー。          |
| Rev.2.0 | 2026-10-01 | xzyozi | Kiro再帰走査、Markdown安全表示を反映。              |
| Rev.3.0 | 2026-10-02 | xzyozi | 4 Provider、複数root、保護ファイルを反映。          |
| Rev.4.0 | 2026-10-02 | xzyozi | ユーザーroot限定、初期I/O削減、遅延本文取得を反映。 |
