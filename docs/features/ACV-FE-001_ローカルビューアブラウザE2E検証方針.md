---
title: "ローカルビューア ブラウザE2E検証方針"
document_type: "feature_plan"
version: "2.0"
status: "implemented_pending_ci"
created_at: "2026-09-08"
updated_at: "2026-10-01"
author: "xzyozi"
purpose: "Kiro構成ツリー、Markdownプレビュー、本文安全境界をGitHub Actionsで自動検証する。"
related_documents:
  - "../setup/local_viewer_ci_validation.md"
  - "../design/ACV-DD-001_閲覧フロー詳細設計書.md"
  - "../design/ACV-DS-001_画面内データ構造仕様書.md"
---
# ローカルビューア ブラウザE2E検証方針
| 項目     | 内容                   |
| :------- | :--------------------- |
| 文書番号 | ACV-FE-001             |
| 状態     | 実装済み（CI検証待ち） |
| 実装区分 | CI専用PR               |

## 1. 目的

`Validate local viewer` workflowで、プロジェクト`.kiro`だけを対象にしたExplorer、ファイル情報、StackEdit風Markdownプレビュー、本文安全境界を実ブラウザで検証する。

## 2. テスト環境

CIは実ユーザーの設定を読まず、ジョブ内の一時プロジェクトrootにKiroの合成フィクスチャを作成する。`AGENT_CONFIG_VIEWER_PROJECT_ROOT`でサーバーの対象rootを一時rootへ設定し、loopbackの`http://127.0.0.1:8765/`だけをブラウザで操作する。

| フィクスチャ                     | 確認目的                        |
| :------------------------------- | :------------------------------ |
| Steering Markdown                | 再帰ツリーとMarkdownプレビュー  |
| 通常テキスト                     | Markdown以外の本文表示          |
| `.bak`バックアップ               | 一覧からの除外                  |
| バイナリ                         | ファイル情報だけの表示          |
| 2MiB超Markdown                   | 本文を表示しないこと            |
| HTML・script文字列を含むMarkdown | DOM要素・スクリプト非実行       |
| Skill bundle                     | 既存Issue #12の計画とコピー回帰 |

## 3. Browser E2Eの受入条件

- Kiroだけのタブが表示される。
- `.kiro`配下の通常ファイルが再帰的にExplorerへ表示される。
- バックアップファイルが表示されない。
- Markdownの見出し、表、インライン要素、コードブロックがレンダリングされる。
- HTML文字列はDOMとして解釈されず、スクリプトが実行されない。
- 危険なURLスキームがリンク化されない。
- バイナリは本文を表示せず、種別・サイズなどの情報を表示する。
- 2MiB超のファイルは本文を返さず、サイズ超過メッセージを表示する。
- 同一`.kiro`内の相対Markdownリンクから安全にファイル選択できる。
- Skill bundleの既存read-only計画と明示確認付きコピーが回帰しない。

## 4. 実装方針

- `tests/browser/create-fixtures.py`で一時プロジェクトrootを作成する。
- テストデータは非機密のKiroフィクスチャに限定する。
- サーバー起動完了を確認してからテストを開始し、成功・失敗を問わず終了時に停止する。
- 失敗時はスクリーンショット、trace、サーバーログをCI成果物として保存する。ただし実ユーザー設定や認証情報を成果物に含めない。

## 5. 非対象と制約

実ユーザー環境、Windows固有の権限・再解析ポイント、自動ファイル監視、編集、任意パス選択、高度な検索・差分は対象外である。CIは機能回帰を検出するものであり、Windows実環境での手動確認を完全には置き換えない。

## 6. 改訂履歴

| 版数    | 改訂日     | 変更者 | 変更内容                                                             |
| :------ | :--------- | :----- | :------------------------------------------------------------------- |
| Rev.1.0 | 2026-09-08 | xzyozi | 初期ローカルビューアのE2E方針を作成。                                |
| Rev.1.2 | 2026-09-08 | xzyozi | Browser E2EをPR限定とした。                                          |
| Rev.2.0 | 2026-10-01 | xzyozi | Kiro専用ツリー、Markdown安全表示、バックアップ・バイナリ検証へ更新。 |
