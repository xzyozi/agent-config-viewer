---
title: "agent-config-viewer 画面内データ構造仕様書"
document_type: "data_structure_specification"
version: "5.0"
created_at: "2026-09-08"
updated_at: "2026-10-02"
author: "xzyozi"
purpose: "ユーザーroot限定の複数Providerカタログ、TreeNode、遅延Preview、拡張子別View、不透明File IDのライフサイクルを定義する。"
related_documents:
  - "ACV-BD-001_基本設計書.md"
  - "ACV-DD-001_閲覧フロー詳細設計書.md"
---
# データ構造・状態設計書（ユーザーroot画面）
| 項目     | 内容                                          |
| :------- | :-------------------------------------------- |
| 文書番号 | ACV-DS-001                                    |
| 版数     | Rev.5.0（ユーザーroot限定・遅延本文View対応） |
| 改訂日   | 2026-10-02                                    |

## 1. データ管理方針

DAO、データベース、localStorage、IndexedDBは使用しない。サーバーはユーザーrootのカタログ作成時にFile IDと`(Path, allowedRoot)`の対応をメモリへ保持し、Refresh時に全置換する。カタログはメタデータだけを持ち、本文はファイル選択時に取得する。

## 2. API DTO

### 2.1 ProviderResult

| フィールド    | 型                 | 制約                                                  |
| :------------ | :----------------- | :---------------------------------------------------- |
| `providerId`  | 文字列             | `kiro`、`claude`、`gemini`、`codex`                   |
| `label`       | 文字列             | Provider表示名                                        |
| `status`      | 列挙値             | `ok`、`not_found`、`permission_denied`、`list_failed` |
| `fileEntries` | FileEntry配列      | ユーザーroot内をフラットに保持                        |
| `tree`        | TreeNodeまたはnull | `ok`の場合はProvider rootノード                       |
| `errorKind`   | 列挙値またはnull   | `ok`ではnull、それ以外はstatusと同じ                  |

### 2.2 FileEntry

| フィールド         | 型               | 制約                                                    |
| :----------------- | :--------------- | :------------------------------------------------------ |
| `id`               | 文字列           | 不透明ID。実パスを含めない                              |
| `providerId`       | 文字列           | Provider識別子                                          |
| `scope`            | 列挙値           | `user`のみ                                              |
| `categoryName`     | 文字列           | Providerと相対パスから派生                              |
| `relativePath`     | 文字列           | `~/.kiro`などの表示用相対パス。`..`を含めない           |
| `displayName`      | 文字列           | ファイル名                                              |
| `kind`             | 列挙値           | 拡張子に応じたView選択値                                |
| `sizeBytes`        | 数値             | 0以上。初回走査時のサイズ                               |
| `readable`         | 真偽値           | バイナリ、保護対象、サイズ超過、権限失敗はfalse         |
| `unreadableReason` | 列挙値またはnull | `binary`、`sensitive`、`too_large`、`permission_denied` |

### 2.3 TreeNode

`TreeNode`はProvider rootを親に持ち、ユーザーrootのディレクトリとファイルを表現する。ディレクトリの`open`状態は画面だけで保持し、初期APIには含めない。初期描画ではすべて閉じる。

## 3. BrowseStateとPreview

`providerResults`は固定順の4 Providerを持つ。`selectedProviderId`は最初の`ok` Provider、`selectedFileId`は選択ファイル、`preview`は`reading`、`ready`、`error`のいずれかである。

`kind`ごとのViewは次のとおりとする。

- `markdown`: Markdownレンダラー
- `json`: 整形JSON
- `toml`、`yaml`、`javascript`、`python`、`css`、`html`、`shell`: ソースコードView
- `text`: プレーンテキスト
- `binary`、`sensitive`: メタ情報のみ

## 4. 生命周期と保護

1. `/api/catalog`がユーザーroot直下のTreeNodeとFileEntryメタデータを作成する。
2. ディレクトリ展開時に`/api/directories/<directory-id>/children`が1階層だけを追加取得する。
3. 選択したFileEntryが`readable`の場合だけ本文APIを呼ぶ。
4. サーバーが再検証した本文を返すと、kindに応じたViewで表示する。
5. Provider切替、Refresh、ページ再読込、サーバー再起動で選択・Previewを破棄する。

## 5. 改訂履歴

| 版数    | 改訂日     | 変更者 | 変更内容                                                         |
| :------ | :--------- | :----- | :--------------------------------------------------------------- |
| Rev.1.0 | 2026-09-08 | xzyozi | 初版作成。                                                       |
| Rev.2.0 | 2026-09-08 | xzyozi | HTTP DTO、BrowseState、File IDのライフサイクルへ更新。           |
| Rev.3.0 | 2026-10-01 | xzyozi | Kiro専用TreeNode、Markdownプレビューへ更新。                     |
| Rev.4.0 | 2026-10-02 | xzyozi | 4 Provider、複数rootへ更新。                                     |
| Rev.5.0 | 2026-10-02 | xzyozi | ユーザーroot限定、初期折りたたみ、遅延本文、拡張子別Viewへ更新。 |
