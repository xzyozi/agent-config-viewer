---
title: "ローカルビューア ブラウザE2E検証方針"
document_type: "feature_plan"
version: "3.0"
status: "implemented_pending_ci"
created_at: "2026-09-08"
updated_at: "2026-10-02"
author: "xzyozi"
purpose: "複数Provider・複数rootの設定ツリー、Markdownプレビュー、本文安全境界をGitHub Actionsで自動検証する。"
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

`Validate local viewer` workflowで、Kiroだけに限定しない4 Providerと、各Providerのプロジェクトroot・ユーザーrootをExplorerへ表示できることを確認する。StackEdit風Markdownプレビュー、保護ファイル、バイナリ、本文安全境界も実ブラウザで検証する。

## 2. テスト環境

CIは実ユーザーの設定を読まず、一時root配下に`project`と`user`を分けて合成フィクスチャを作成する。`AGENT_CONFIG_VIEWER_PROJECT_ROOT`と`AGENT_CONFIG_VIEWER_HOME_ROOT`で対象rootを設定し、loopbackの`http://127.0.0.1:8765/`だけをブラウザで操作する。

| フィクスチャ                     | 確認目的                        |
| :------------------------------- | :------------------------------ |
| Project/User Kiro                | 2つのrootを同時表示             |
| Claude、Gemini、Codex            | Kiro以外のProvider表示          |
| Steering Markdown                | Markdownプレビューと相対リンク  |
| `.bak`、logs                     | バックアップ・運用領域の除外    |
| 接続設定名                       | 保護メタ情報だけの表示          |
| バイナリ                         | 本文を表示しないこと            |
| 2MiB超Markdown                   | 本文を表示しないこと            |
| HTML・script文字列を含むMarkdown | DOM要素・スクリプト非実行       |
| User Skill bundle                | 既存Issue #12の計画とコピー回帰 |

## 3. Browser E2Eの受入条件

- Kiro、Claude、Gemini、Codexのタブが固定順で表示される。
- 各ProviderのプロジェクトrootとユーザーrootがExplorerへ表示される。
- 初期表示ではディレクトリが展開されず、必要なroot・ディレクトリを操作して展開できる。
- JSONは整形JSON、TOML/YAML/JavaScript/Python/CSS/HTML/Shellはソースコード、その他のテキストは対応する本文Viewで表示される。
- バックアップ、ログ、セッション、一時領域が表示されない。
- Markdownの見出し、表、インライン要素、コードブロックがレンダリングされる。
- HTML文字列はDOMとして解釈されず、スクリプトが実行されない。
- 危険なURLスキームがリンク化されない。
- バイナリと保護ファイルは本文を表示せず、情報だけを表示する。
- 2MiB超のファイルは本文を返さず、サイズ超過メッセージを表示する。
- 同じProvider/root内の相対Markdownリンクから安全にファイル選択できる。
- User Kiro Skill bundleの既存read-only計画と明示確認付きコピーが回帰しない。

## 4. 実装方針

- `tests/browser/create-fixtures.py`で一時rootの`project`と`user`を作成する。
- テストデータは非機密のフィクスチャに限定し、実ユーザーrootをartifactへ含めない。
- サーバー起動完了を確認してからテストを開始し、成功・失敗を問わず終了時に停止する。
- 失敗時はスクリーンショット、trace、サーバーログをCI成果物として保存する。

## 5. 非対象と制約

実ユーザー環境、Windows固有の権限・再解析ポイント、自動ファイル監視、任意root追加、編集、差分、高度な検索、完全なMarkdown互換性は対象外である。CIは機能回帰を検出するものであり、Windows実環境での手動確認を完全には置き換えない。

## 6. 改訂履歴

| 版数    | 改訂日     | 変更者 | 変更内容                                       |
| :------ | :--------- | :----- | :--------------------------------------------- |
| Rev.1.0 | 2026-09-08 | xzyozi | 初期ローカルビューアのE2E方針を作成。          |
| Rev.1.2 | 2026-09-08 | xzyozi | Browser E2EをPR限定とした。                    |
| Rev.2.0 | 2026-10-01 | xzyozi | Kiro専用ツリー、Markdown安全表示へ更新。       |
| Rev.3.0 | 2026-10-02 | xzyozi | 4 Provider、複数root、保護ファイル検証へ拡張。 |
