---
title: "ローカルビューア ブラウザE2E検証方針"
document_type: "feature_plan"
version: "4.0"
status: "implemented_pending_ci"
created_at: "2026-09-08"
updated_at: "2026-10-02"
author: "xzyozi"
purpose: "ユーザーroot限定の複数Provider設定ツリー、初期折りたたみ、遅延本文、拡張子別View、安全境界をGitHub Actionsで検証する。"
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

Kiroだけに限定しない4 Providerのユーザー設定を表示し、初期ロードではrootを展開せず、選択時に本文を遅延取得することを実ブラウザで検証する。

## 2. テスト環境

CIは実ユーザーの設定を読まず、一時ユーザーrootにKiro、Claude、Gemini、Codexフィクスチャを作成する。`AGENT_CONFIG_VIEWER_HOME_ROOT`で対象rootを設定し、loopbackだけを操作する。

## 3. Browser E2Eの受入条件

- Kiro、Claude、Gemini、Codexのタブが固定順で表示される。
- 初期表示で`.kiro-explorer details[open]`が0件である。
- 必要なディレクトリを操作すると対象ファイルが表示される。
- JSONが整形JSON、TOML等がソースコードView、MarkdownがMarkdown Viewで表示される。
- バックアップ、ログ、セッション、一時領域が表示されない。
- 保護ファイルとバイナリは本文を表示しない。
- HTML文字列・スクリプトが実行されない。
- 2MiB超のファイルは本文を表示しない。
- Kiro Skill bundleの既存計画・コピーが回帰しない。

## 4. 非対象と制約

Node.js/npmがないローカル環境では、Python/APIスモークとCIのNode検証を利用する。実ユーザー環境、Windows固有権限、編集、検索、差分、自動ファイル監視は対象外である。

## 5. 改訂履歴

| 版数    | 改訂日     | 変更者 | 変更内容                                                         |
| :------ | :--------- | :----- | :--------------------------------------------------------------- |
| Rev.1.0 | 2026-09-08 | xzyozi | 初期E2E方針を作成。                                              |
| Rev.2.0 | 2026-10-01 | xzyozi | Kiro専用ツリー、Markdown安全表示へ更新。                         |
| Rev.3.0 | 2026-10-02 | xzyozi | 4 Provider、複数root、保護ファイルへ拡張。                       |
| Rev.4.0 | 2026-10-02 | xzyozi | ユーザーroot限定、初期折りたたみ、遅延本文、拡張子別Viewへ更新。 |
