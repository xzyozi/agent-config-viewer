---
title: "agent-config-viewer 画面内データ構造仕様書"
document_type: "data_structure_specification"
version: "3.0"
created_at: "2026-09-08"
updated_at: "2026-10-01"
author: "xzyozi"
purpose: "Kiroカタログ、再帰ツリー、画面状態、Markdownプレビュー、不透明File IDのメモリ内ライフサイクルを定義する。"
related_documents:
  - "ACV-BD-001_基本設計書.md"
  - "ACV-DD-001_閲覧フロー詳細設計書.md"
---
# データ構造・状態設計書（Kiro構成画面）
| 項目     | 内容                                      |
| :------- | :---------------------------------------- |
| 文書番号 | ACV-DS-001                                |
| 版数     | Rev.3.0（Kiroツリー・Markdownビュー対応） |
| 改訂日   | 2026-10-01                                |

## 1. データ管理方針

DAO、データベース、localStorage、IndexedDBは使用しない。サーバーはカタログ作成時にFile IDと`(Path, allowedRoot)`の対応をメモリへ保持し、Refresh時に全置換する。カタログ、ツリー、本文はプロセスまたはページのメモリだけに存在し、再起動・再読込で失われる。

## 2. API DTO

### 2.1 ProviderResult

| フィールド    | 型                 | 制約                                                  |
| :------------ | :----------------- | :---------------------------------------------------- |
| `providerId`  | 文字列             | `kiro`だけ                                            |
| `status`      | 列挙値             | `ok`、`not_found`、`permission_denied`、`list_failed` |
| `fileEntries` | FileEntry配列      | ファイルノードをフラットに保持                        |
| `tree`        | TreeNodeまたはnull | `ok`の場合は`.kiro` rootノード                        |
| `errorKind`   | 列挙値またはnull   | `ok`ではnull、それ以外はstatusと同じ                  |

### 2.2 FileEntry

| フィールド         | 型               | 制約                                                                             |
| :----------------- | :--------------- | :------------------------------------------------------------------------------- |
| `id`               | 文字列           | `secrets.token_urlsafe(24)`の不透明ID。実パスを含めない                          |
| `providerId`       | 文字列           | `kiro`                                                                           |
| `categoryName`     | 文字列           | `Steering`、`Skills`、`Knowledge`、`Other`。先頭ディレクトリから派生             |
| `relativePath`     | 文字列           | `.kiro`からの表示パス。`..`を含めない                                            |
| `displayName`      | 文字列           | ファイル名                                                                       |
| `kind`             | 列挙値           | `markdown`、`json`、`toml`、`yaml`、`javascript`、`python`、`text`、`binary`など |
| `sizeBytes`        | 数値             | 0以上。初回走査時のサイズ                                                        |
| `readable`         | 真偽値           | バイナリ、サイズ超過、権限失敗はfalse                                            |
| `unreadableReason` | 列挙値またはnull | `binary`、`too_large`、`permission_denied`                                       |

### 2.3 TreeNode

| フィールド                      | 型                 | 制約                       |
| :------------------------------ | :----------------- | :------------------------- |
| `type`                          | 列挙値             | `directory`または`file`    |
| `name`                          | 文字列             | 表示名                     |
| `relativePath`                  | 文字列             | `.kiro`からの表示パス      |
| `children`                      | TreeNode配列       | directoryだけが持つ        |
| `fileId`                        | 文字列または未定義 | fileだけが持つFileEntry ID |
| `kind`、`sizeBytes`、`readable` | ファイル属性       | fileだけが持つ             |

## 3. BrowseStateとPreview

| フィールド           | 型                       | 用途                                 |
| :------------------- | :----------------------- | :----------------------------------- |
| `providerResults`    | ProviderResult配列       | 現在はKiro一件                       |
| `selectedProviderId` | 文字列またはnull         | `kiro`                               |
| `selectedFileId`     | 文字列またはnull         | 現在本文を要求または表示するファイル |
| `preview`            | Previewまたはnull        | 読込状態、本文、固定エラー文言の入力 |
| `migrationPlan`      | 既存計画状態またはnull   | Issue #12のSkill bundle計画          |
| `migrationCopy`      | 既存コピー状態またはnull | Issue #12のコピー状態                |

`Preview.status`は`reading`、`ready`、`error`のいずれかとする。`ready`は`displayName`と本文、`error`は`code`を持つ。`binary`と`too_large`でも選択ファイルのメタ情報は表示し、本文は保持しない。

## 4. 生命周期と保護

1. `/api/catalog`が新しいFile ID対応とTreeNodeを作成する。
2. `Catalog.discover`がBrowseStateを初期化する。
3. 選択したFileEntryが`readable`の場合だけ本文APIを呼ぶ。
4. サーバーが再検証したUTF-8本文を返すと、Markdownは安全なDOM要素、その他は`<pre>.textContent`で表示する。
5. Provider切替、Refresh、ページ再読込、サーバー再起動で対応または表示状態を破棄する。
6. Markdown内の相対リンクは同一`.kiro`のFileEntryだけに解決し、未解決・外部以外のスキームは遷移させない。

## 5. 互換性と将来拡張

走査、TreeNode生成、本文取得、表示を分離しているため、将来のファイルサイズ制限、検索、仮想スクロール、差分、編集を個別に追加できる。追加時は本文の保存範囲、サニタイズ契約、パス操作を別途定義する。

## 6. 改訂履歴

| 版数    | 改訂日     | 変更者 | 変更内容                                                       |
| :------ | :--------- | :----- | :------------------------------------------------------------- |
| Rev.1.0 | 2026-09-08 | xzyozi | 初版作成。                                                     |
| Rev.2.0 | 2026-09-08 | xzyozi | HTTP DTO、BrowseState、File IDのメモリ内ライフサイクルへ更新。 |
| Rev.3.0 | 2026-10-01 | xzyozi | Kiro専用TreeNode、バイナリ情報表示、Markdownプレビューへ更新。 |
