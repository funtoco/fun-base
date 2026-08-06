# ビザ案件「その他ファイル」複数アップロード 設計

作成日: 2026-08-05

## 1. 目的

ビザ案件（`/applications/[caseId]`）で、チェックリストに載っていない任意のファイルを
**複数まとめて自由にアップロード**できるようにする。

現状は `case_document_requirements`（チェックリストの1行）に紐付く形でしか提出できず、
1要件＝1ファイルに固定されている。任意ファイルの置き場が無い。

## 2. 保存先の決定

**kintone app296「就労_ビザ案件管理」のレコード添付ファイルフィールド**を唯一の保存先とする。
Supabase Storage には保存しない。

### Google Drive ではなく kintone を選んだ理由

既存の Drive ミラー（`lib/portal/drive/`）は、OP が案件ごとに `drive_folder_url` を手で貼る前提で、
貼り忘れると `no_drive_folder` で静かに skip される。その他ファイルの主保存先としては穴が大きい。
kintone レコード添付なら案件レコード内で完結し、URL の手貼り運用が不要になる。

トレードオフとして以下を受け入れる。

- kintone の契約ディスク容量を消費する（Drive は別枠だった）
- 添付ファイルフィールドは PUT で**丸ごと置換**されるため、追記に read-modify-write が必要

なお既存のチェックリスト書類の Drive ミラーは**そのまま残す**（この変更の対象外）。

## 3. 全体フロー

```
[企業担当者] ファイルを複数選択
  → POST /api/applications/{caseId}/files      セッション認証＋案件アクセス確認
  → kintone POST /k/v1/file.json  × N          fileKey を取得
  → app296 レコードの other_files を「既存 + 新規」で PUT（revision 楽観ロック）
  ← 1ファイルごとの成否を返し、画面は router.refresh() で一覧を取り直す

[プレビュー] GET /api/applications/{caseId}/files/{fileKey}
  → アクセス確認 → kintone GET /k/v1/file.json → Content-Type 付きでストリーム返却
  → 新規タブで PDF・画像がそのまま開く
```

API ルートは1リクエストで複数ファイル（`files[]`、最大10件）を受け付けるが、
**画面は1ファイルずつ順番に送る**。まとめて送るとリクエストが巨大になり、既存の書類
アップロード（1件10MBまで）で実績のあるサイズ感を超えるため。副次的に、途中で失敗しても
成功分は保存され、`2/5件` のような進捗も出せる。

## 4. kintone 側の前提（OP 作業）

app296 に**添付ファイルフィールドを1つ追加**する。フィールドコードは `other_files`。
API トークンは既存のもの（app296 のレコード閲覧・編集権限）をそのまま使う。

フィールドが存在しない／API トークン未設定／案件が kintone 未連携（`kintone_record_id` が null）の
いずれでも、UI はカードを表示したうえでアップロードを無効化し、理由を明示する（fail-closed）。

## 5. コンポーネント

| ファイル | 責務 |
|---|---|
| `lib/portal/kintone-sync/kintone-write-client.ts` | `uploadFile()` / `downloadFile()` を I/F と REST 実装に追加。`KintoneApiError`（`status` 付き）を導入 |
| `lib/portal/kintone-sync/case-files.ts`（新規） | `listCaseFiles()` / `appendCaseFiles()`。添付フィールドの読み取りと**追記**ロジック |
| `lib/portal/case-files.ts`（新規） | 案件アクセス確認（RLS）＋ファイル検証を通す server-mediated 層 |
| `app/api/applications/[caseId]/files/route.ts`（新規） | 複数ファイル受信・検証・アップロード |
| `app/api/applications/[caseId]/files/[fileKey]/route.ts`（新規） | ダウンロード／プレビューのプロキシ |
| `components/portal/other-files-card.tsx`（新規） | 一覧＋「ファイルを追加」（複数選択可） |
| `app/applications/[caseId]/page.tsx` | カードを差し込み、初期一覧を渡す |

## 6. 追記ロジック（最重要）

kintone の添付ファイルフィールドは PUT で**丸ごと置換**される。既存ファイルを消さないため
`appendCaseFiles` は以下の手順を取る。

1. レコードを `$revision` 込みで読む
2. 既存の `fileKey` 配列に新規 `fileKey` を append
3. `revision` を指定して PUT（楽観ロック）
4. 409（`GAIA_CO02` = revision 不一致）なら**読み直して1回だけリトライ**

リトライしても 409 なら例外にする（黙って上書きしない）。

## 7. 決定事項

- **ファイル名**: 元のファイル名をそのまま使う。レコード内に置くので案件名の付与は不要
- **形式・サイズ**: 現状のまま（PDF・画像・Excel、10MB）。既存 `validateUploadFile` を流用
- **削除**: 実装しない（追加のみ）。誤アップロードは OP が kintone 側で削除する
- **プレビュー**: 署名 URL は使わず、FunBase のセッション認証を必ず通るプロキシ方式にする

## 8. テスト

`__tests__/portal-case-files.test.ts`

- 既存ファイルが保持されたまま新規が append されること
- revision 競合（409）で読み直して1回リトライすること
- リトライしても 409 なら例外になること
- 添付フィールドが空／未設定でもパースが壊れないこと

`__tests__/portal-kintone-client-methods.test.ts`（追記）

- `uploadFile` が `POST /k/v1/file.json` に multipart で送り `fileKey` を返すこと
- `downloadFile` が `GET /k/v1/file.json?fileKey=` を叩き本文と Content-Type を返すこと
