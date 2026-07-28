# ビザ申請ポータル ― フェーズ2（ポータルUI・案件作成・チェックリスト）実装計画

> **For agentic workers:** REQUIRED SUB-SKILL: superpowers:subagent-driven-development or executing-plans。checkbox（`- [ ]`）で進捗管理。

**Goal:** OP（supporter）が案件を作成し、必要書類チェックリストが自動生成され、後から人材を追加すると個人書類が増える——という「触れる縦スライス」を FunBase 上に実装する。

**Architecture:** フェーズ1のスキーマ（`visa_application_cases` ほか）の上に、(1) 仮の書類カタログ/テンプレのシード＋`materialize_case_requirements` RPC（SECURITY DEFINER・権限再検査）を1マイグレーションで追加、(2) Next.js14 App Router の画面3つ（一覧/新規/詳細）＋API、を追加する。office境界はフェーズ1のRLSとRPC内再検査で担保。

**Tech Stack:** Next.js 14 (App Router), TypeScript, Supabase SSR (@supabase/ssr), Tailwind v4, shadcn/ui, vitest。

**前提/方針（確定済み）:**
- 人材選択＝**案件作成時は選ばない。詳細画面で後から追加**（追加時に個人書類を追補）。
- 書類カタログ＝**仮の標準セット**（本計画で投入、`is_provisional` 扱い。正式8書類は後日差し替え）。
- ブランチ＝`claude/visa-portal-phase2`（fun-base本体・supabaseサブモジュール両方、`claude/visa-portal-phase1` から分岐）。
- **file-generation-only**：`supabase:reset` は実行しない。DB適用は稼働中DBへ別途（docker exec）。検証は `typecheck`＋`vitest`＋開発サーバのライブ確認。

**既存パターン厳守（実装前に必ず読む）:**
- APIルート例：`app/api/tenants/[tenantId]/members/invite/route.ts`（サーバSupabaseクライアント・認可の型）
- データアクセス層：`lib/supabase/*`（people/visas の read パターン）
- 一覧画面：`app/people/`（DataTable・PageHeader・フィルタの使い方）
- サーバ/クライアント分離、認証ガード：`lib/security/*`、`middleware.ts`
- UI部品：`components/ui/*`（button/card/badge/dialog/table/tabs/select）、`components/layout/*`（sidebar）

---

## ファイル構成

**マイグレーション（submodule `supabase/migrations/`）:**
- `20260724130000_portal_seed_and_materialize.sql` — 仮カタログ＋テンプレ＋テンプレ明細のシード、`materialize_case_requirements(uuid)` RPC

**アプリ（fun-base）:**
- `lib/portal/types.ts` — 案件/要件/メンバーの型
- `lib/portal/applications.ts` — データアクセス（list/get/create/addMember、サーバクライアント使用）
- `lib/portal/requirements.ts` — チェックリスト取得＋office/person グループ化
- `app/api/applications/route.ts` — `GET`（一覧）/`POST`（作成→materialize呼び出し）
- `app/api/applications/[caseId]/route.ts` — `GET`（詳細＋要件＋メンバー）
- `app/api/applications/[caseId]/members/route.ts` — `POST`（人材追加→materialize再実行）
- `app/applications/page.tsx` — 一覧＋「新規案件」
- `app/applications/new/page.tsx` — 作成フォーム
- `app/applications/[caseId]/page.tsx` — 詳細（流れヘッダ＋チェックリスト＋メンバー追加）
- `components/portal/*` — `CaseProgressHeader` / `ChecklistTable` / `NewCaseForm` / `AddMembersDialog`
- サイドバー：`components/layout/`（該当ファイル）に「申請ポータル」= `/applications` を追加
- テスト：`__tests__/portal-materialize.test.ts`（要件グループ化ロジック）、`__tests__/portal-create-case-validation.test.ts`（作成バリデーション純関数）

---

## Task 1: 仮カタログ＋テンプレ＋materialize RPC（マイグレーション）

**Files:** Create `supabase/migrations/20260724130000_portal_seed_and_materialize.sql`

- [ ] **Step 1: マイグレーションを書く**

```sql
-- ===== 仮カタログ（provisional）=====
INSERT INTO public.document_catalog (code, name, default_scope, is_acquired_cert, description) VALUES
  ('company_registry',       '登記事項証明書',                 'office', true,  '法人の登記事項証明書（発行3ヶ月以内）'),
  ('tax_payment_cert',       '納税証明書',                     'office', true,  '法人/個人事業主の納税証明書'),
  ('financial_statements',   '決算文書（貸借対照表・損益計算書）', 'office', false, '直近年度の決算書'),
  ('labor_insurance_cert',   '労働保険料納付証明書',           'office', true,  NULL),
  ('social_insurance_cert',  '社会保険料納入証明書',           'office', true,  NULL),
  ('company_overview',       '会社案内・事業内容資料',         'office', false, NULL),
  ('wage_ledger',            '賃金台帳',                       'office', false, NULL),
  ('application_workbook',   '申請書類作成フォーム（Excel）',   'office', false, '会社が記入して提出するExcel'),
  ('residence_card',         '在留カードの写し',               'person', false, NULL),
  ('passport_copy',          'パスポートの写し',               'person', false, NULL),
  ('employment_contract',    '特定技能雇用契約書',             'person', false, NULL),
  ('employment_conditions',  '雇用条件書',                     'person', false, NULL),
  ('health_checkup',         '健康診断個人票',                 'person', false, NULL),
  ('skill_test_cert',        '技能試験合格証',                 'person', false, NULL),
  ('jlpt_cert',              '日本語試験合格証',               'person', false, NULL)
ON CONFLICT (code) DO NOTHING;

-- ===== テンプレ（全 entity×category×field。仮運用のため共通明細を全テンプレに付与）=====
INSERT INTO public.document_requirement_templates (entity_type, application_category, field)
SELECT e, c, f
FROM unnest(ARRAY['corporate','sole_proprietor']) e
CROSS JOIN unnest(ARRAY['initial','renewal']) c
CROSS JOIN unnest(ARRAY['care','food_service','accommodation','food_manufacturing','other']) f
ON CONFLICT (entity_type, application_category, field) DO NOTHING;

-- 共通明細（office項目 / person項目）。全テンプレに同一セットを付与（仮）。
WITH office_items(code, req, copyt, sort) AS (VALUES
  ('company_registry', true, 'original', 10),
  ('tax_payment_cert', true, 'original', 20),
  ('financial_statements', true, 'copy', 30),
  ('labor_insurance_cert', true, 'copy', 40),
  ('social_insurance_cert', true, 'copy', 50),
  ('company_overview', false, 'copy', 60),
  ('wage_ledger', false, 'copy', 70),
  ('application_workbook', true, 'copy', 80)
), person_items(code, req, copyt, sort) AS (VALUES
  ('residence_card', true, 'copy', 110),
  ('passport_copy', true, 'copy', 120),
  ('employment_contract', true, 'original', 130),
  ('employment_conditions', true, 'original', 140),
  ('health_checkup', true, 'copy', 150),
  ('skill_test_cert', false, 'copy', 160),
  ('jlpt_cert', false, 'copy', 170)
)
INSERT INTO public.document_requirement_template_items (template_id, document_code, scope, is_required, copy_type, sort_order)
SELECT t.id, oi.code, 'office', oi.req, oi.copyt, oi.sort FROM public.document_requirement_templates t CROSS JOIN office_items oi
ON CONFLICT (template_id, document_code, scope) DO NOTHING;
INSERT INTO public.document_requirement_template_items (template_id, document_code, scope, is_required, copy_type, sort_order)
SELECT t.id, pi.code, 'person', pi.req, pi.copyt, pi.sort FROM public.document_requirement_templates t CROSS JOIN person_items pi
ON CONFLICT (template_id, document_code, scope) DO NOTHING;

-- ===== materialize RPC（SECURITY DEFINER・権限再検査・冪等）=====
CREATE OR REPLACE FUNCTION public.materialize_case_requirements(p_case_id uuid)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE v_tenant uuid; v_office uuid; v_entity text; v_cat text; v_field text;
BEGIN
  SELECT tenant_id, tenant_office_id, entity_type, application_category, field
    INTO v_tenant, v_office, v_entity, v_cat, v_field
    FROM public.visa_application_cases WHERE id = p_case_id;
  IF v_tenant IS NULL THEN RAISE EXCEPTION 'case not found'; END IF;
  IF NOT public.portal_can_access_office(v_tenant, v_office) THEN
    RAISE EXCEPTION 'not authorized for this office';
  END IF;
  -- office項目（case毎に1件、person_id NULL）
  INSERT INTO public.case_document_requirements
    (case_id, tenant_id, tenant_office_id, document_code, name, scope, is_required, copy_type, issuer, validity_months, sort_order)
  SELECT p_case_id, v_tenant, v_office, i.document_code, dc.name, 'office', i.is_required, i.copy_type, i.issuer, i.validity_months, i.sort_order
  FROM public.document_requirement_templates t
  JOIN public.document_requirement_template_items i ON i.template_id = t.id AND i.scope='office'
  JOIN public.document_catalog dc ON dc.code = i.document_code
  WHERE t.entity_type=v_entity AND t.application_category=v_cat AND t.field=v_field AND t.is_active
  ON CONFLICT DO NOTHING;
  -- person項目（メンバー×person明細）
  INSERT INTO public.case_document_requirements
    (case_id, tenant_id, tenant_office_id, document_code, name, scope, person_id, is_required, copy_type, issuer, validity_months, sort_order)
  SELECT p_case_id, v_tenant, v_office, i.document_code, dc.name, 'person', m.person_id, i.is_required, i.copy_type, i.issuer, i.validity_months, i.sort_order
  FROM public.visa_application_case_members m
  JOIN public.document_requirement_templates t ON t.entity_type=v_entity AND t.application_category=v_cat AND t.field=v_field AND t.is_active
  JOIN public.document_requirement_template_items i ON i.template_id=t.id AND i.scope='person'
  JOIN public.document_catalog dc ON dc.code=i.document_code
  WHERE m.case_id = p_case_id
  ON CONFLICT DO NOTHING;
END; $$;
REVOKE ALL ON FUNCTION public.materialize_case_requirements(uuid) FROM public;
GRANT EXECUTE ON FUNCTION public.materialize_case_requirements(uuid) TO authenticated;
```

- [ ] **Step 2**: 稼働中ローカルDBに適用（`docker exec -i supabase_db_fun-studio-v0 psql -U postgres -d postgres -v ON_ERROR_STOP=1 -f - < 該当ファイル`）。エラーなしを確認。
- [ ] **Step 3**: `SELECT count(*) FROM document_catalog;`（=15）、`SELECT count(*) FROM document_requirement_templates;`（=20）、`document_requirement_template_items`（=20×15=300）を確認。
- [ ] **Step 4**: サブモジュールでコミット。

## Task 2: 作成バリデーション純関数＋テスト（TDD）

**Files:** Create `lib/portal/case-validation.ts`, `__tests__/portal-create-case-validation.test.ts`

- [ ] テスト先行：`validateNewCase({tenant_office_id, entity_type, application_category, field})` が必須欠落・enum外を弾き、正常入力で `{ok:true}`。
- [ ] 実装：enumチェック（entity_type∈corporate/sole_proprietor、category∈initial/renewal、field∈5値、office必須）。
- [ ] `npm test -- portal-create-case-validation` green。

## Task 3: データアクセス層＋型

**Files:** `lib/portal/types.ts`, `lib/portal/applications.ts`, `lib/portal/requirements.ts`

- [ ] 既存 `lib/supabase/*` のサーバクライアント生成に倣う（ユーザーセッション・RLS適用）。
- [ ] `listCases()`／`getCase(caseId)`（案件＋メンバー＋people表示名）／`createCase(input)`（insert→`rpc('materialize_case_requirements')`）／`addMember(caseId, personId, visaId?)`（insert→rpc再実行）。
- [ ] `getRequirements(caseId)`：`case_document_requirements` を取得し office/person（person_id別）でグループ化。
- [ ] 型はスキーマに一致（status enum・scope・copy_type）。

## Task 4: API ルート

**Files:** `app/api/applications/route.ts`, `app/api/applications/[caseId]/route.ts`, `app/api/applications/[caseId]/members/route.ts`

- [ ] `POST /api/applications`：認証必須。`validateNewCase`→`createCase`。作成者=`auth.uid()`。RLS違反/未認可は403/400。
- [ ] `GET /api/applications`：自分がアクセス可能な案件（RLSが自動で絞る）。
- [ ] `GET /api/applications/[caseId]`：案件＋要件（グループ化）＋メンバー。
- [ ] `POST /api/applications/[caseId]/members`：`person_id`（＋任意`visa_id`）で追加→materialize再実行→更新後の要件を返す。
- [ ] 既存 invite ルートの認可・エラー返却パターンに合わせる。

## Task 5: 画面（一覧・新規・詳細）

**Files:** `app/applications/page.tsx`, `app/applications/new/page.tsx`, `app/applications/[caseId]/page.tsx`, `components/portal/*`

- [ ] 一覧：案件カード/テーブル（会社・事業所・分野・初回/更新・ステータス）＋「新規案件」ボタン。空状態あり。
- [ ] 新規：フォーム（事業所select＝アクセス可能なtenant_offices、entity_type、initial/renewal、field、任意の管理番号/タイトル）。送信→作成→詳細へ遷移。
- [ ] 詳細：
  - `CaseProgressHeader`：申請の流れ（draft→collecting→reviewing→ready→…）を Stepper 風に。
  - `ChecklistTable`：office項目と person項目（人材ごとにグルーピング）を表示（書類名・必須/任意・原本/写し・ステータスbadge）。まだ未提出（`not_submitted`）で表示。
  - 「人材を追加」ボタン（`AddMembersDialog`：事業所の people から選択）→追加すると person 書類行が増える。
- [ ] shadcn/ui 部品を使用。日本語ラベル。やさしい表現。
- [ ] サイドバーに「申請ポータル」= `/applications` を追加。

## Task 6: ライブ検証（開発サーバ）

- [ ] `typecheck` green（新規/変更ファイルに型エラーなし）、`npm test` の新規テスト green。
- [ ] 開発サーバ（既に起動中 http://localhost:3000）で：案件作成→一覧表示→詳細でofficeチェックリスト表示→人材追加→person書類が増える、を実機確認（スクリーンショット）。
- [ ] office境界：別officeの案件が見えないこと（RLS）をログイン後に確認（可能なら）。

---

## Self-Review 観点
- スキーマ整合：INSERT列・enum・複合キーがフェーズ1定義と一致。RPCの ON CONFLICT が partial unique（uq_cdr_office/uq_cdr_person）で冪等。
- 認可：API・RPCともユーザーセッションで動き、`portal_can_access_office` が効く（サービスロール直叩きで境界を迂回しない）。
- No placeholder：カタログは「仮」だが具体値入り（正式版差し替えは別タスク）。
- 既存パターン踏襲：APIの認可・返却、データアクセスのクライアント生成、UI部品。

## 後続（フェーズ2の残り／フェーズ3）
- 書類アップロード（`office_documents`/`person_documents`＋Storage署名URLをサーバAPI経由）、コメント（`case_comments`）、レビュー承認/差戻し＋リマインド。
- 正式な8書類への差し替え（§10-2）。
- フェーズ3：kintone書き込み・Excelパース（§10-1 マッピング確定後）。
