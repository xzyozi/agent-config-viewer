---
title: "agent-config-viewer 画面内データ構造仕様書"
document_type: "data_structure_specification"
version: "2.0"
created_at: "2026-09-08"
updated_at: "2026-09-08"
author: "xzyozi"
purpose: "ローカルAPI、画面状態、不透明File IDのメモリ内ライフサイクルを定義する。"
related_documents:
  - "ACV-BD-001_基本設計書.md"
  - "ACV-DD-001_閲覧フロー詳細設計書.md"
---
# データ構造・状態設計書（画面内データ・非永続化仕様）
| 項目     | 内容                                   |
| :------- | :------------------------------------- |
| 文書番号 | ACV-DS-001                             |
| 版数     | Rev.2.0（ローカルAPI状態モデルへ更新） |
| 改訂日   | 2026-09-08                             |
## 1. データ管理方針
DAO、データベース、localStorage、IndexedDBは使用しない。サーバーはカタログ作成時にFile IDと`(Path, allowedRoot)`の対応を`FILE_INDEX`へ保持し、次回カタログ作成時にロック下で全置換する。この対応、画面のカタログ、プレビュー本文はプロセスまたはページのメモリだけに存在し、再起動・再読込で失われる。本文、絶対パス、生例外をAPI・UI・ログへ出さない。
## 2. API DTO
### 2.1 ProviderResult
| フィールド    | 型               | 制約                                                  |
| :------------ | :--------------- | :---------------------------------------------------- |
| `providerId`  | 文字列           | `kiro`、`claude`、`gemini`、`codex`のいずれか         |
| `status`      | 列挙値           | `ok`、`not_found`、`permission_denied`、`list_failed` |
| `fileEntries` | FileEntry配列    | `ok`以外は空配列                                      |
| `errorKind`   | 列挙値またはnull | `ok`ではnull、それ以外はstatusと同じ値                |
ブラウザ側の`Catalog`はRegistryの表示名を対応結果へ追加する。Provider単位の失敗は他Providerの成功結果を破棄しない。
### 2.2 FileEntry
| フィールド                    | 型               | 制約                                                            |
| :---------------------------- | :--------------- | :-------------------------------------------------------------- |
| `id`                          | 文字列           | `secrets.token_urlsafe(24)`で生成する不透明ID。実パスを含めない |
| `providerId`、`categoryName`  | 文字列           | Providerとカテゴリを識別                                        |
| `relativePath`、`displayName` | 文字列           | 許可rootまたはホームからの相対表示。`..`を含まない              |
| `kind`                        | 列挙値           | `markdown`、`json`、`toml`、`text`                              |
| `sizeBytes`                   | 数値             | 0以上。初回走査時のサイズ                                       |
| `readable`                    | 真偽値           | falseの場合、クライアントは本文APIを呼ばない                    |
| `unreadableReason`            | 列挙値またはnull | 現行値は`too_large`または`permission_denied`                    |
`read_failed`は読取後に判明するためFileEntryには保持しない。APIレスポンスまたはクライアントの`FileReadError.code`として扱う。
## 3. BrowseStateとPreview
| フィールド           | 型                          | 用途                                                |
| :------------------- | :-------------------------- | :-------------------------------------------------- |
| `providerResults`    | ProviderResult配列          | 固定順のProvider一覧                                |
| `selectedProviderId` | 文字列またはnull            | 最初の`ok` Provider、なければ先頭Provider           |
| `selectedCategory`   | null                        | 将来のカテゴリ選択用予約値。現行UIは使用しない      |
| `selectedFileId`     | 文字列またはnull            | 現在本文を要求または表示するファイル                |
| `preview`            | Previewまたはnull           | 読込状態、本文、固定エラー文言の入力                |
| `noticeCode`         | null                        | 将来拡張用予約値。現行UIは使用しない                |
| Preview.status       | `reading`、`ready`、`error` | `ready`は`displayName`と本文、`error`は`code`を持つ |
同じ選択File IDの応答だけが`preview`を更新できる。Provider切替では`selectedFileId`と`preview`をnullにする。
## 4. 生命周期と保護
1. `/api/catalog` が新しいFile ID対応を作成し、ProviderResultを返す。
2. `Catalog.discover` がBrowseStateを初期化する。
3. 選択したFileEntryが`readable`の場合だけ本文APIを呼ぶ。
4. サーバーが再検証したUTF-8本文を返すと、`preview`へ一時保持し`<pre>.textContent`で表示する。
5. 新規カタログ、Provider切替、ページ再読込、サーバー再起動で対応または表示状態を破棄する。
## 5. 互換性と将来拡張
Providerカテゴリの追加はProvider宣言内に閉じる。未知の`kind`はサーバーでは`text`として扱う。MarkdownのHTMLレンダリングや永続検索を追加する場合は、本文の保存範囲、サニタイズ契約、URL・メモリの扱いを別途定義する。
## 6. 改訂履歴
| 版数    | 改訂日     | 変更者 | 変更内容・変更理由                                             |
| :------ | :--------- | :----- | :------------------------------------------------------------- |
| Rev.1.0 | 2026-09-08 | xzyozi | 初版作成。                                                     |
| Rev.1.1 | 2026-09-08 | xzyozi | ProviderResultとunreadableReasonを追加。                       |
| Rev.1.2 | 2026-09-08 | xzyozi | 実装前設計を確定。                                             |
| Rev.2.0 | 2026-09-08 | xzyozi | HTTP DTO、BrowseState、File IDのメモリ内ライフサイクルへ追従。 |
