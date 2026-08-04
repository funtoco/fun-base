# ビザ申請ポータル ― フェーズ2b（アップロード・レビュー・コメント）実装計画

**Goal:** 案件詳細で、書類の**アップロード**、OPの**レビュー（承認/差戻し＋理由）**、**コメント**、簡易**リマインド**を行えるようにし、「会社が出す→ファントコが確認」を一気通貫にする。

**前提:** フェーズ2（案件作成・チェックリスト）実装済・ローカル動作確認済。ブランチ `claude/visa-portal-phase2`（継続）。file-generation-only（`supabase:reset`不使用、マイグレは稼働中DBに docker exec で適用）。ローカルStorage起動済。バケット `person-documents`/`people-images` 実在、`office-documents` は本計画で新設。

**安全方式（重要）:** アップロード/ダウンロードは **サーバAPI経由**。APIで `portal_can_access_office` によりアクセス確認 → **サービスロールクライアント**で storage 操作・署名URL発行。storage.objects へのauthenticated直アクセスは付与しない（server-mediated）。クライアントに書込権限を渡さない。

**既存パターン参照:** `lib/supabase/`（サーバ/サービスロールのクライアント生成）、既存の person-documents アップロード実装（`app/people/[id]` の書類タブ／`lib/supabase` 周辺）、`app/api/tenants/.../invite/route.ts`（API認可）、`components/ui/*`。

---

## Task 1: office-documents バケット（マイグレーション）
**Files:** Create `supabase/migrations/20260724140000_portal_office_documents_bucket.sql`
```sql
INSERT INTO storage.buckets (id, name, public)
VALUES ('office-documents', 'office-documents', false)
ON CONFLICT (id) DO NOTHING;
-- authenticated への storage ポリシーは付与しない（server-mediated=サービスロールのみ）。
```
- docker exec で適用、`SELECT id FROM storage.buckets;` に `office-documents` が出ることを確認。submoduleでコミット。

## Task 2: ストレージ／データ層
**Files:** `lib/portal/storage.ts`, `lib/portal/documents.ts`, `lib/portal/comments.ts`（＋`applications.ts`拡張）
- `getServiceClient()`：既存のサービスロールクライアント生成に倣う（無ければ `@supabase/supabase-js` の createClient(URL, SERVICE_ROLE_KEY)）。
- `uploadRequirementDocument({caseId, requirementId, file})`：
  - サーバでアクセス確認（`portal_can_access_office`）。requirement を取得し scope 判定。
  - パス：office項目=`office-documents/${tenantId}/${officeId}/${caseId}/${requirementId}/${filename}`、person項目=`person-documents/${tenantId}/${personId}/portal/${caseId}/${requirementId}/${filename}`。
  - サービスロールで upload → `office_documents` または `person_documents` に行作成 → `case_document_requirements` を `office_document_id`/`person_document_id` 紐付け＋`status='reviewing'` に更新 → `case_document_events('submitted')`。
- `createSignedUrl(docKind, docId)`：アクセス確認後、サービスロールで署名URL（60分）を返す。
- `listComments(caseId)` / `addComment(caseId, body, requirementId?)`：RLS準拠（ユーザーセッション）。
- 既存 `person_documents` の必須列（`document_type` 等）に注意。`document_type` は `'other'`（複数可）を使い、ポータル用途を `note` で区別（既存の一意制約 `UNIQUE(person_id, document_type) WHERE document_type<>'other'` に衝突しないため）。

## Task 3: API ルート
**Files:**
- `app/api/applications/[caseId]/requirements/[requirementId]/documents/route.ts`：`POST`（multipart 受け→`uploadRequirementDocument`）。認証・アクセス確認・サイズ/型チェック。
- `app/api/applications/[caseId]/requirements/[requirementId]/route.ts`：`PATCH`（`{action:'approve'}` or `{action:'reject', reason}` or `{action:'reset'}`→ status 更新＋`case_document_events`。承認/差戻しは `portal_is_writer` 必須）。
- `app/api/documents/[kind]/[docId]/url/route.ts`：`GET`（署名URL返却。kind=office|person）。
- `app/api/applications/[caseId]/comments/route.ts`：`GET`/`POST`。
- `app/api/applications/[caseId]/remind/route.ts`：`POST`（`case_document_events('reminded')` 記録＋トースト用メッセージ返却。メール送信は任意・本計画では実施しない＝`nodemailer` 未導入のため。将来フック）。
- 返却・認可は既存 invite ルート型に準拠。

## Task 4: UI（案件詳細に統合）
**Files:** `app/applications/[caseId]/page.tsx` 拡張、`components/portal/*` 追加
- `RequirementRow`（`checklist-table.tsx` を行アクション対応に）：
  - 会社/企業ユーザー：**アップロード**（未提出/差戻し時）。ファイル選択→送信→`reviewing`。提出済みは「表示」（署名URLを新規タブ）。
  - OP（writer）：**承認**／**差戻し**（理由入力ダイアログ `RejectReasonDialog`）。差戻し理由をバッジ/ツールチップ表示。
  - ステータスbadge色分け（未提出=グレー / 確認中=青 / 承認済み=緑 / 要修正=赤）。
- `CommentThread`（`components/portal/comment-thread.tsx`）：一覧＋投稿フォーム。詳細下部に配置。
- `RemindButton`：ヘッダに「リマインド」。押下で記録＋トースト。
- クライアントComponentはmutationのみAPI経由、表示はServer Componentがセッションで取得→`router.refresh()`で更新。

## Task 5: 検証
- `typecheck`（新規/変更ファイルにエラーなし）、既存テスト維持。可能なら `lib/portal` の純ロジックに軽いユニットテスト（パス生成・ステータス遷移）。
- ライブ（localhost:3000, ログイン済セッション）：
  1. 既存の「動作確認テスト案件」で office 書類を1件アップロード→`確認中`
  2. OPとして承認→`承認済み`（緑）、別の書類を差戻し（理由入力）→`要修正`（赤）
  3. コメント投稿→表示
  4. リマインド→トースト
  5. アップロード済み書類を「表示」（署名URLで開く）
- スクリーンショットで確認。

## 後続
- 正式8書類への差し替え（別途、業務確定後）。フェーズ3=kintone/Excel（マッピング確定後）。メール送信（`nodemailer` 導入後）。
