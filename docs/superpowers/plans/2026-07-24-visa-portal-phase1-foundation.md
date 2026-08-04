# ビザ申請ポータル ― フェーズ1（DB基盤・セキュリティ・移行）実装計画

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 受入企業向けビザ申請提出ポータルの土台となるDBスキーマ・office境界セキュリティ（RLS）・既存データ移行を、越境を許さない形で構築する。

**Architecture:** 既存FunBase(Next.js14 + Supabase)にマイグレーションを追加。office境界を `people.tenant_office_id`(UUID) に一本化し、新規テーブル群に SECURITY DEFINER 関数ベースのコマンド別RLSを敷く。親子の tenant/office 整合は複合FKでDB強制。既存の受入企業ユーザーを締め出さないよう、RESTRICTIVE有効化の前にoffice割当をバックフィルする。

**Tech Stack:** Supabase (PostgreSQL, RLS), supabase CLI 2.40.7, vitest, TypeScript。

**このプランの位置づけ:** 全体は3フェーズ。**本書=フェーズ1（基盤）**。フェーズ2=ポータルUI・案件管理・チェックリスト・コメント・アップロード。フェーズ3=kintone書き込み・Excelパース。フェーズ1は他フェーズに依存せず単体で適用・検証できる。仕様書 `docs/specs/2026-07-24-visa-application-portal-design.md` の §5/§6/§8 に対応。

**前提の設計判断（仕様§で確定済み）:**
- office判定は `tenant_office_id`(UUID) に統一。`people.company` 文字列一致は使わない。
- 取得書類カタログ/テンプレの「値」シード（8種の正式名称等）は §10-2 の業務確定待ちのため**フェーズ2で投入**。本フェーズは**テーブル作成のみ**。
- RLS統合テストの専用ハーネスは本リポにないため、DB系タスクの検証は `supabase:reset`(適用) ＋ ロールを模したSQL問い合わせで行う。純ロジック（invite検証）は vitest。

---

## ファイル構成（作成/変更）

**マイグレーション（新規, `supabase/migrations/`）:**
- `20260724120000_portal_add_tenant_office_id.sql` — people/person_documents に `tenant_office_id` 追加、既定office生成、company→office バックフィル
- `20260724120100_portal_security_functions.sql` — 境界判定 SECURITY DEFINER 関数4本
- `20260724120200_portal_core_tables.sql` — 案件・メンバー・企業書類・チェックリスト・コメント・監査・抽出ステージングの各テーブル
- `20260724120300_portal_master_tables.sql` — カタログ/テンプレ/明細（テーブルのみ、シードなし）
- `20260724120400_portal_rls_new_tables.sql` — 新規テーブルのコマンド別RLS
- `20260724120500_portal_restrict_people_documents.sql` — people/person_documents の RESTRICTIVE(FOR ALL) と backfill前提チェック
- `20260724120600_portal_backfill_member_offices.sql` — 既存 member/guest の user_tenant_offices バックフィル

**アプリコード（変更）:**
- Modify: `app/api/tenants/[tenantId]/members/invite/route.ts` — member/guest 招待時 `officeIds` 必須化
- Create: `__tests__/portal-invite-office-required.test.ts` — 上記バリデーションの単体テスト
- Create: `lib/portal/invite-validation.ts` — 招待バリデーションの純関数（テスト可能に切り出し）

---

## Task 1: office境界キーの導入とバックフィル

**Files:**
- Create: `supabase/migrations/20260724120000_portal_add_tenant_office_id.sql`

- [ ] **Step 1: マイグレーションを書く**

`supabase/migrations/20260724120000_portal_add_tenant_office_id.sql`:

```sql
-- 1) tenant_offices を1つも持たないテナントに既定officeを生成（NOT NULL office前提を満たす）
INSERT INTO public.tenant_offices (tenant_id, name, is_active)
SELECT t.id, t.name, true
FROM public.tenants t
WHERE NOT EXISTS (SELECT 1 FROM public.tenant_offices o WHERE o.tenant_id = t.id);

-- 2) people に office 参照列を追加（複合FKで同一テナント担保）
ALTER TABLE public.people ADD COLUMN IF NOT EXISTS tenant_office_id uuid;
ALTER TABLE public.people
  ADD CONSTRAINT people_office_fk FOREIGN KEY (tenant_office_id, tenant_id)
  REFERENCES public.tenant_offices(id, tenant_id) ON DELETE SET NULL;
CREATE INDEX IF NOT EXISTS idx_people_office ON public.people(tenant_office_id);

-- 3) company 文字列 × office.name（trim小文字）で backfill。一致するものだけ埋める。
UPDATE public.people p
SET tenant_office_id = o.id
FROM public.tenant_offices o
WHERE o.tenant_id = p.tenant_id
  AND p.tenant_office_id IS NULL
  AND p.company IS NOT NULL
  AND lower(btrim(o.name)) = lower(btrim(p.company));

-- 4) 4-1) company が空/単一office運用の people は既定office（テナント唯一のoffice）に寄せる
UPDATE public.people p
SET tenant_office_id = o.id
FROM public.tenant_offices o
WHERE p.tenant_office_id IS NULL
  AND o.tenant_id = p.tenant_id
  AND (SELECT count(*) FROM public.tenant_offices o2 WHERE o2.tenant_id = p.tenant_id) = 1;

-- 5) person_documents にも office を継承（RESTRICTIVE 判定用）
ALTER TABLE public.person_documents ADD COLUMN IF NOT EXISTS tenant_office_id uuid;
UPDATE public.person_documents pd
SET tenant_office_id = p.tenant_office_id
FROM public.people p
WHERE pd.person_id = p.id AND pd.tenant_office_id IS NULL;
CREATE INDEX IF NOT EXISTS idx_person_documents_office ON public.person_documents(tenant_office_id);

-- 6) 未マッチ確認用ビュー（運用で手当てするため。0件が理想）
CREATE OR REPLACE VIEW public.portal_people_without_office AS
  SELECT id, tenant_id, company FROM public.people WHERE tenant_office_id IS NULL;
```

- [ ] **Step 2: 適用して成功を確認**

Run: `npm run supabase:reset`
Expected: 全マイグレーションがエラーなく適用され `Finished supabase db reset`。失敗時はSQL構文/FK名衝突を修正。

- [ ] **Step 3: backfill結果を検証**

Run:
```bash
npx supabase@2.40.7 db query "SELECT count(*) AS unmatched FROM public.portal_people_without_office;"
```
Expected: シードデータ上で `unmatched` が 0 または少数。0でなければ company/office名の不一致であり、運用で手当て対象（プラン上は許容、本番移行時に手動割当）。

- [ ] **Step 4: コミット**

```bash
git add supabase/migrations/20260724120000_portal_add_tenant_office_id.sql
git commit -m "feat(portal): add people.tenant_office_id and backfill office scope"
```

---

## Task 2: 境界判定 SECURITY DEFINER 関数

**Files:**
- Create: `supabase/migrations/20260724120100_portal_security_functions.sql`

- [ ] **Step 1: マイグレーションを書く**

`supabase/migrations/20260724120100_portal_security_functions.sql`:

```sql
-- テナント全体アクセス（owner/admin/supporter）
CREATE OR REPLACE FUNCTION public.portal_has_tenant_wide_access(p_tenant_id uuid)
RETURNS boolean LANGUAGE sql SECURITY DEFINER STABLE SET search_path = public AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.user_tenants ut
    WHERE ut.user_id = auth.uid() AND ut.tenant_id = p_tenant_id
      AND ut.status = 'active' AND ut.role IN ('owner','admin','supporter'));
$$;

-- office境界。office∈tenant を必ず検証（越境防止）。割当なし=false（fail-closed）。
CREATE OR REPLACE FUNCTION public.portal_can_access_office(p_tenant_id uuid, p_office_id uuid)
RETURNS boolean LANGUAGE sql SECURITY DEFINER STABLE SET search_path = public AS $$
  SELECT EXISTS (SELECT 1 FROM public.tenant_offices o
           WHERE o.id = p_office_id AND o.tenant_id = p_tenant_id)
    AND (public.portal_has_tenant_wide_access(p_tenant_id)
      OR EXISTS (SELECT 1 FROM public.user_tenants ut
          JOIN public.user_tenant_offices uto ON uto.user_tenant_id = ut.id
          WHERE ut.user_id = auth.uid() AND ut.tenant_id = p_tenant_id
            AND ut.status = 'active' AND uto.tenant_office_id = p_office_id));
$$;

-- 書き込み（承認等）: member 以上
CREATE OR REPLACE FUNCTION public.portal_is_writer(p_tenant_id uuid)
RETURNS boolean LANGUAGE sql SECURITY DEFINER STABLE SET search_path = public AS $$
  SELECT EXISTS (SELECT 1 FROM public.user_tenants ut
    WHERE ut.user_id = auth.uid() AND ut.tenant_id = p_tenant_id
      AND ut.status = 'active' AND ut.role IN ('owner','admin','supporter','member'));
$$;

-- アップロード/コメント: guest も含む
CREATE OR REPLACE FUNCTION public.portal_can_upload(p_tenant_id uuid)
RETURNS boolean LANGUAGE sql SECURITY DEFINER STABLE SET search_path = public AS $$
  SELECT EXISTS (SELECT 1 FROM public.user_tenants ut
    WHERE ut.user_id = auth.uid() AND ut.tenant_id = p_tenant_id
      AND ut.status = 'active' AND ut.role IN ('owner','admin','supporter','member','guest'));
$$;

REVOKE ALL ON FUNCTION public.portal_has_tenant_wide_access(uuid) FROM public;
REVOKE ALL ON FUNCTION public.portal_can_access_office(uuid, uuid) FROM public;
REVOKE ALL ON FUNCTION public.portal_is_writer(uuid) FROM public;
REVOKE ALL ON FUNCTION public.portal_can_upload(uuid) FROM public;
GRANT EXECUTE ON FUNCTION public.portal_has_tenant_wide_access(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.portal_can_access_office(uuid, uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.portal_is_writer(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.portal_can_upload(uuid) TO authenticated;
```

- [ ] **Step 2: 適用して成功を確認**

Run: `npm run supabase:reset`
Expected: エラーなく適用。

- [ ] **Step 3: 関数の健全性を検証（office∈tenant短絡の穴が無いこと）**

Run:
```bash
npx supabase@2.40.7 db query "SELECT public.portal_can_access_office('00000000-0000-0000-0000-000000000000'::uuid, '00000000-0000-0000-0000-000000000001'::uuid) AS should_be_false;"
```
Expected: `should_be_false = f`（存在しない office/tenant で false。auth.uid() が NULL でも例外なく false）。

- [ ] **Step 4: コミット**

```bash
git add supabase/migrations/20260724120100_portal_security_functions.sql
git commit -m "feat(portal): add office-boundary security definer functions"
```

---

## Task 3: 新規コアテーブル

**Files:**
- Create: `supabase/migrations/20260724120200_portal_core_tables.sql`

- [ ] **Step 1: マイグレーションを書く**

`supabase/migrations/20260724120200_portal_core_tables.sql`:

```sql
-- 案件
CREATE TABLE public.visa_application_cases (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  tenant_office_id uuid NOT NULL,
  entity_type text NOT NULL CHECK (entity_type IN ('corporate','sole_proprietor')),
  application_category text NOT NULL CHECK (application_category IN ('initial','renewal')),
  field text NOT NULL CHECK (field IN ('care','food_service','accommodation','food_manufacturing','other')),
  application_type text CHECK (application_type IN ('認定申請','変更申請','更新申請','特定活動申請','資格変更（特定技能2号）')),
  management_number text,
  kintone_record_id text,
  status text NOT NULL DEFAULT 'draft'
    CHECK (status IN ('draft','collecting','reviewing','ready','synced','completed','archived')),
  title text, note text,
  kintone_sync_status text, kintone_last_synced_at timestamptz,
  created_by uuid REFERENCES auth.users(id),
  created_at timestamptz NOT NULL DEFAULT now(), updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT vac_office_fk FOREIGN KEY (tenant_office_id, tenant_id)
    REFERENCES public.tenant_offices(id, tenant_id) ON DELETE RESTRICT,
  CONSTRAINT vac_id_tenant_office_uniq UNIQUE (id, tenant_id, tenant_office_id)
);
CREATE INDEX idx_vac_tenant ON public.visa_application_cases(tenant_id, tenant_office_id);
CREATE INDEX idx_vac_status ON public.visa_application_cases(status);
CREATE UNIQUE INDEX uq_vac_mgmt_no ON public.visa_application_cases(tenant_id, management_number) WHERE management_number IS NOT NULL;

-- 案件×人材（1:N）。tenant/office を親caseと厳密一致
CREATE TABLE public.visa_application_case_members (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  case_id uuid NOT NULL, tenant_id uuid NOT NULL, tenant_office_id uuid NOT NULL,
  person_id text NOT NULL REFERENCES public.people(id) ON DELETE CASCADE,
  visa_id text REFERENCES public.visas(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT vacm_case_fk FOREIGN KEY (case_id, tenant_id, tenant_office_id)
    REFERENCES public.visa_application_cases(id, tenant_id, tenant_office_id) ON DELETE CASCADE,
  CONSTRAINT uq_case_person UNIQUE (case_id, person_id)
);
CREATE INDEX idx_vacm_person ON public.visa_application_case_members(person_id);
CREATE INDEX idx_vacm_case ON public.visa_application_case_members(case_id);

-- 企業/事業所単位の取得書類
CREATE TABLE public.office_documents (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  tenant_office_id uuid NOT NULL,
  document_code text NOT NULL, storage_path text NOT NULL,
  file_name text, content_type text, file_size_bytes integer,
  issued_on date, note text, uploaded_by uuid REFERENCES auth.users(id),
  created_at timestamptz NOT NULL DEFAULT now(), updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT od_office_fk FOREIGN KEY (tenant_office_id, tenant_id)
    REFERENCES public.tenant_offices(id, tenant_id) ON DELETE CASCADE,
  CONSTRAINT uq_od_office_code UNIQUE (tenant_office_id, document_code)
);
CREATE INDEX idx_od_tenant ON public.office_documents(tenant_id, tenant_office_id);

-- 必要書類チェックリスト
CREATE TABLE public.case_document_requirements (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  case_id uuid NOT NULL, tenant_id uuid NOT NULL, tenant_office_id uuid NOT NULL,
  document_code text NOT NULL, name text NOT NULL,
  scope text NOT NULL CHECK (scope IN ('office','person')),
  person_id text REFERENCES public.people(id) ON DELETE CASCADE,
  is_required boolean NOT NULL DEFAULT true,
  copy_type text CHECK (copy_type IN ('original','copy')),
  issuer text, validity_months integer, expires_on date,
  status text NOT NULL DEFAULT 'not_submitted'
    CHECK (status IN ('not_submitted','reviewing','approved','needs_fix')),
  rejection_reason text,
  office_document_id uuid REFERENCES public.office_documents(id) ON DELETE SET NULL,
  person_document_id uuid REFERENCES public.person_documents(id) ON DELETE SET NULL,
  sort_order integer NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now(), updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT cdr_case_fk FOREIGN KEY (case_id, tenant_id, tenant_office_id)
    REFERENCES public.visa_application_cases(id, tenant_id, tenant_office_id) ON DELETE CASCADE
);
CREATE UNIQUE INDEX uq_cdr_office ON public.case_document_requirements(case_id, document_code) WHERE person_id IS NULL;
CREATE UNIQUE INDEX uq_cdr_person ON public.case_document_requirements(case_id, document_code, person_id) WHERE person_id IS NOT NULL;
CREATE INDEX idx_cdr_case ON public.case_document_requirements(case_id);
CREATE INDEX idx_cdr_status ON public.case_document_requirements(status);

-- 案件コメント（メール置換）
CREATE TABLE public.case_comments (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  case_id uuid NOT NULL, tenant_id uuid NOT NULL, tenant_office_id uuid NOT NULL,
  requirement_id uuid REFERENCES public.case_document_requirements(id) ON DELETE SET NULL,
  author uuid REFERENCES auth.users(id), body text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT cc_case_fk FOREIGN KEY (case_id, tenant_id, tenant_office_id)
    REFERENCES public.visa_application_cases(id, tenant_id, tenant_office_id) ON DELETE CASCADE
);
CREATE INDEX idx_cc_case ON public.case_comments(case_id);

-- 監査イベント
CREATE TABLE public.case_document_events (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  case_id uuid NOT NULL, tenant_id uuid NOT NULL, requirement_id uuid,
  event_type text NOT NULL CHECK (event_type IN ('submitted','approved','rejected','reminded')),
  actor uuid REFERENCES auth.users(id), comment text,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX idx_cde_case ON public.case_document_events(case_id);

-- 抽出ステージング（フェーズ3で使用。テーブルは基盤として先に用意）
CREATE TABLE public.case_data_extractions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  case_id uuid NOT NULL, tenant_id uuid NOT NULL,
  source text NOT NULL CHECK (source IN ('workbook','ocr')),
  target_kind text NOT NULL CHECK (target_kind IN ('company','person')),
  person_id text,
  payload jsonb NOT NULL,
  status text NOT NULL DEFAULT 'draft' CHECK (status IN ('draft','confirmed','synced','error')),
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX idx_cde_ext_case ON public.case_data_extractions(case_id);
```

- [ ] **Step 2: 適用して成功を確認**

Run: `npm run supabase:reset`
Expected: エラーなく適用。

- [ ] **Step 3: 複合FKと部分ユニークが効くことを検証**

Run:
```bash
npx supabase@2.40.7 db query "SELECT conname FROM pg_constraint WHERE conname IN ('vacm_case_fk','cdr_case_fk','vac_office_fk') ORDER BY conname;"
npx supabase@2.40.7 db query "SELECT indexname FROM pg_indexes WHERE indexname IN ('uq_cdr_office','uq_cdr_person');"
```
Expected: 3つの複合FKと2つの部分ユニークindexが全て存在。

- [ ] **Step 4: コミット**

```bash
git add supabase/migrations/20260724120200_portal_core_tables.sql
git commit -m "feat(portal): add core tables (cases, members, docs, checklist, comments, events)"
```

---

## Task 4: マスタ（カタログ/テンプレ）テーブル ※シードは含めない

**Files:**
- Create: `supabase/migrations/20260724120300_portal_master_tables.sql`

- [ ] **Step 1: マイグレーションを書く**

`supabase/migrations/20260724120300_portal_master_tables.sql`:

```sql
CREATE TABLE public.document_catalog (
  code text PRIMARY KEY,
  name text NOT NULL,
  default_scope text NOT NULL CHECK (default_scope IN ('office','person')),
  is_acquired_cert boolean NOT NULL DEFAULT false,
  description text
);

CREATE TABLE public.document_requirement_templates (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  entity_type text NOT NULL CHECK (entity_type IN ('corporate','sole_proprietor')),
  application_category text NOT NULL CHECK (application_category IN ('initial','renewal')),
  field text NOT NULL CHECK (field IN ('care','food_service','accommodation','food_manufacturing','other')),
  version integer NOT NULL DEFAULT 1,
  is_active boolean NOT NULL DEFAULT true,
  CONSTRAINT uq_template_key UNIQUE (entity_type, application_category, field)
);

CREATE TABLE public.document_requirement_template_items (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  template_id uuid NOT NULL REFERENCES public.document_requirement_templates(id) ON DELETE CASCADE,
  document_code text NOT NULL REFERENCES public.document_catalog(code),
  scope text NOT NULL CHECK (scope IN ('office','person')),
  is_required boolean NOT NULL DEFAULT true,
  copy_type text CHECK (copy_type IN ('original','copy')),
  issuer text, validity_months integer,
  sort_order integer NOT NULL DEFAULT 0,
  CONSTRAINT uq_tpl_item UNIQUE (template_id, document_code, scope)
);

-- 参照はグローバル（テナント非依存）。変更は service_role のみ。
ALTER TABLE public.document_catalog ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.document_requirement_templates ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.document_requirement_template_items ENABLE ROW LEVEL SECURITY;
CREATE POLICY dc_read ON public.document_catalog FOR SELECT TO authenticated USING (true);
CREATE POLICY drt_read ON public.document_requirement_templates FOR SELECT TO authenticated USING (true);
CREATE POLICY drti_read ON public.document_requirement_template_items FOR SELECT TO authenticated USING (true);
-- 変更ポリシーは作らない＝authenticatedからは書けない。service_role はRLSバイパス。
```

- [ ] **Step 2: 適用して成功を確認**

Run: `npm run supabase:reset`
Expected: エラーなく適用。

- [ ] **Step 3: 読み取り専用が効くことを検証**

Run:
```bash
npx supabase@2.40.7 db query "SELECT relrowsecurity FROM pg_class WHERE relname='document_catalog';"
```
Expected: `relrowsecurity = t`（RLS有効）。シード投入はフェーズ2（§10-2 確定後）。

- [ ] **Step 4: コミット**

```bash
git add supabase/migrations/20260724120300_portal_master_tables.sql
git commit -m "feat(portal): add document catalog and requirement template tables"
```

---

## Task 5: 新規テーブルのRLS（コマンド別・最小権限）

**Files:**
- Create: `supabase/migrations/20260724120400_portal_rls_new_tables.sql`

- [ ] **Step 1: マイグレーションを書く**

`supabase/migrations/20260724120400_portal_rls_new_tables.sql`（`visa_application_cases` の4本を範に、6テーブルに適用）:

```sql
-- 共通ヘルパを使うマクロ的パターン。各テーブルに SELECT/INSERT/UPDATE/DELETE を貼る。
-- === visa_application_cases ===
ALTER TABLE public.visa_application_cases ENABLE ROW LEVEL SECURITY;
CREATE POLICY vac_select ON public.visa_application_cases FOR SELECT TO authenticated
  USING (portal_can_access_office(tenant_id, tenant_office_id));
CREATE POLICY vac_insert ON public.visa_application_cases FOR INSERT TO authenticated
  WITH CHECK (portal_can_access_office(tenant_id, tenant_office_id) AND portal_is_writer(tenant_id));
CREATE POLICY vac_update ON public.visa_application_cases FOR UPDATE TO authenticated
  USING (portal_can_access_office(tenant_id, tenant_office_id) AND portal_is_writer(tenant_id))
  WITH CHECK (portal_can_access_office(tenant_id, tenant_office_id) AND portal_is_writer(tenant_id));
CREATE POLICY vac_delete ON public.visa_application_cases FOR DELETE TO authenticated
  USING (portal_has_tenant_wide_access(tenant_id));

-- === visa_application_case_members ===
ALTER TABLE public.visa_application_case_members ENABLE ROW LEVEL SECURITY;
CREATE POLICY vacm_select ON public.visa_application_case_members FOR SELECT TO authenticated
  USING (portal_can_access_office(tenant_id, tenant_office_id));
CREATE POLICY vacm_insert ON public.visa_application_case_members FOR INSERT TO authenticated
  WITH CHECK (portal_can_access_office(tenant_id, tenant_office_id) AND portal_is_writer(tenant_id));
CREATE POLICY vacm_update ON public.visa_application_case_members FOR UPDATE TO authenticated
  USING (portal_can_access_office(tenant_id, tenant_office_id) AND portal_is_writer(tenant_id))
  WITH CHECK (portal_can_access_office(tenant_id, tenant_office_id) AND portal_is_writer(tenant_id));
CREATE POLICY vacm_delete ON public.visa_application_case_members FOR DELETE TO authenticated
  USING (portal_has_tenant_wide_access(tenant_id));

-- === office_documents（INSERTはguest可＝portal_can_upload）===
ALTER TABLE public.office_documents ENABLE ROW LEVEL SECURITY;
CREATE POLICY od_select ON public.office_documents FOR SELECT TO authenticated
  USING (portal_can_access_office(tenant_id, tenant_office_id));
CREATE POLICY od_insert ON public.office_documents FOR INSERT TO authenticated
  WITH CHECK (portal_can_access_office(tenant_id, tenant_office_id)
             AND portal_can_upload(tenant_id)
             AND uploaded_by = (SELECT auth.uid()));
CREATE POLICY od_update ON public.office_documents FOR UPDATE TO authenticated
  USING (portal_can_access_office(tenant_id, tenant_office_id) AND portal_can_upload(tenant_id))
  WITH CHECK (portal_can_access_office(tenant_id, tenant_office_id) AND portal_can_upload(tenant_id));
CREATE POLICY od_delete ON public.office_documents FOR DELETE TO authenticated
  USING (portal_has_tenant_wide_access(tenant_id));

-- === case_document_requirements（確定/承認はwriter）===
ALTER TABLE public.case_document_requirements ENABLE ROW LEVEL SECURITY;
CREATE POLICY cdr_select ON public.case_document_requirements FOR SELECT TO authenticated
  USING (portal_can_access_office(tenant_id, tenant_office_id));
CREATE POLICY cdr_insert ON public.case_document_requirements FOR INSERT TO authenticated
  WITH CHECK (portal_can_access_office(tenant_id, tenant_office_id) AND portal_is_writer(tenant_id));
CREATE POLICY cdr_update ON public.case_document_requirements FOR UPDATE TO authenticated
  USING (portal_can_access_office(tenant_id, tenant_office_id) AND portal_is_writer(tenant_id))
  WITH CHECK (portal_can_access_office(tenant_id, tenant_office_id) AND portal_is_writer(tenant_id));
CREATE POLICY cdr_delete ON public.case_document_requirements FOR DELETE TO authenticated
  USING (portal_has_tenant_wide_access(tenant_id));

-- === case_comments（企業もコメント可＝portal_can_upload）===
ALTER TABLE public.case_comments ENABLE ROW LEVEL SECURITY;
CREATE POLICY cc_select ON public.case_comments FOR SELECT TO authenticated
  USING (portal_can_access_office(tenant_id, tenant_office_id));
CREATE POLICY cc_insert ON public.case_comments FOR INSERT TO authenticated
  WITH CHECK (portal_can_access_office(tenant_id, tenant_office_id)
             AND portal_can_upload(tenant_id)
             AND author = (SELECT auth.uid()));
CREATE POLICY cc_delete ON public.case_comments FOR DELETE TO authenticated
  USING (portal_has_tenant_wide_access(tenant_id));

-- === case_data_extractions（社内のみ: 抽出はサーバ/社内処理）===
ALTER TABLE public.case_data_extractions ENABLE ROW LEVEL SECURITY;
CREATE POLICY cde_ext_select ON public.case_data_extractions FOR SELECT TO authenticated
  USING (portal_has_tenant_wide_access(tenant_id));
CREATE POLICY cde_ext_write ON public.case_data_extractions FOR ALL TO authenticated
  USING (portal_has_tenant_wide_access(tenant_id))
  WITH CHECK (portal_has_tenant_wide_access(tenant_id));

-- === case_document_events（読取=office境界, 追記=writer, 変更/削除なし）===
ALTER TABLE public.case_document_events ENABLE ROW LEVEL SECURITY;
CREATE POLICY cde_select ON public.case_document_events FOR SELECT TO authenticated
  USING (EXISTS (SELECT 1 FROM public.visa_application_cases c
    WHERE c.id = case_document_events.case_id
      AND portal_can_access_office(c.tenant_id, c.tenant_office_id)));
CREATE POLICY cde_insert ON public.case_document_events FOR INSERT TO authenticated
  WITH CHECK (portal_is_writer(tenant_id) AND actor = (SELECT auth.uid()));
```

- [ ] **Step 2: 適用して成功を確認**

Run: `npm run supabase:reset`
Expected: エラーなく適用。

- [ ] **Step 3: 全新規テーブルでRLS有効かつポリシーが存在することを検証**

Run:
```bash
npx supabase@2.40.7 db query "SELECT tablename, count(*) FROM pg_policies WHERE tablename IN ('visa_application_cases','visa_application_case_members','office_documents','case_document_requirements','case_comments','case_document_events','case_data_extractions') GROUP BY tablename ORDER BY tablename;"
```
Expected: 7テーブルすべてが1件以上のポリシーを持つ（cases/members/cdr=4本, office_documents=4本, comments=3本, events=2本, extractions=2本）。

- [ ] **Step 4: コミット**

```bash
git add supabase/migrations/20260724120400_portal_rls_new_tables.sql
git commit -m "feat(portal): command-scoped RLS on new portal tables"
```

---

## Task 6: 既存 people / person_documents を RESTRICTIVE で締める

**Files:**
- Create: `supabase/migrations/20260724120500_portal_restrict_people_documents.sql`

> **重要な順序:** この RESTRICTIVE は Task 1（office backfill）と Task 7（メンバーoffice割当）が完了した後にのみ有効化する。未割当メンバーが締め出されるため、reset時は同一マイグレーション列で Task 1 が先に走る（timestampが小さい）ので満たされる。本番はバックフィル完了を確認してから適用。

- [ ] **Step 1: マイグレーションを書く**

`supabase/migrations/20260724120500_portal_restrict_people_documents.sql`:

```sql
-- people: 既存の permissive tenant ポリシーはそのまま。RESTRICTIVE を AND 合成して office 境界を追加。
-- owner/admin/supporter は tenant-wide で素通り。member/guest は自 office のみ。
CREATE POLICY people_office_boundary ON public.people AS RESTRICTIVE FOR ALL TO authenticated
  USING (
    portal_has_tenant_wide_access(tenant_id)
    OR (tenant_office_id IS NOT NULL AND portal_can_access_office(tenant_id, tenant_office_id))
  );

-- person_documents: 同型（tenant_office_id は Task1 で付与済み）
CREATE POLICY person_documents_office_boundary ON public.person_documents AS RESTRICTIVE FOR ALL TO authenticated
  USING (
    portal_has_tenant_wide_access(tenant_id)
    OR (tenant_office_id IS NOT NULL AND portal_can_access_office(tenant_id, tenant_office_id))
  );
```

- [ ] **Step 2: 適用して成功を確認**

Run: `npm run supabase:reset`
Expected: エラーなく適用。

- [ ] **Step 3: RESTRICTIVE が FOR ALL で入っていることを検証**

Run:
```bash
npx supabase@2.40.7 db query "SELECT polname, polpermissive, polcmd FROM pg_policy WHERE polname IN ('people_office_boundary','person_documents_office_boundary');"
```
Expected: 両ポリシーとも `polpermissive = f`（RESTRICTIVE）かつ `polcmd = *`（ALL）。

- [ ] **Step 4: コミット**

```bash
git add supabase/migrations/20260724120500_portal_restrict_people_documents.sql
git commit -m "feat(portal): restrict people and person_documents to office boundary"
```

---

## Task 7: 既存 member/guest の office 割当バックフィル

**Files:**
- Create: `supabase/migrations/20260724120600_portal_backfill_member_offices.sql`

- [ ] **Step 1: マイグレーションを書く**

`supabase/migrations/20260724120600_portal_backfill_member_offices.sql`:

```sql
-- 既存の active な member/guest で office 未割当の user_tenant を、
-- そのテナントに office が1つだけなら自動割当。複数officeのテナントは手動割当対象（下のビューで可視化）。
INSERT INTO public.user_tenant_offices (user_tenant_id, tenant_office_id)
SELECT ut.id, o.id
FROM public.user_tenants ut
JOIN public.tenant_offices o ON o.tenant_id = ut.tenant_id
WHERE ut.role IN ('member','guest') AND ut.status = 'active'
  AND NOT EXISTS (SELECT 1 FROM public.user_tenant_offices x WHERE x.user_tenant_id = ut.id)
  AND (SELECT count(*) FROM public.tenant_offices o2 WHERE o2.tenant_id = ut.tenant_id) = 1
ON CONFLICT DO NOTHING;

-- 手動割当が必要な（複数office持ちテナントの未割当）member/guest を可視化
CREATE OR REPLACE VIEW public.portal_members_without_office AS
  SELECT ut.id AS user_tenant_id, ut.user_id, ut.tenant_id, ut.role
  FROM public.user_tenants ut
  WHERE ut.role IN ('member','guest') AND ut.status = 'active'
    AND NOT EXISTS (SELECT 1 FROM public.user_tenant_offices x WHERE x.user_tenant_id = ut.id);
```

- [ ] **Step 2: 適用して成功を確認**

Run: `npm run supabase:reset`
Expected: エラーなく適用。

- [ ] **Step 3: 未割当メンバーが可視化されることを検証**

Run:
```bash
npx supabase@2.40.7 db query "SELECT count(*) AS need_manual_office FROM public.portal_members_without_office;"
```
Expected: `need_manual_office` が確認できる（本番移行時、0になるまで手動割当してから Task 6 の RESTRICTIVE を本番適用する運用）。

- [ ] **Step 4: コミット**

```bash
git add supabase/migrations/20260724120600_portal_backfill_member_offices.sql
git commit -m "feat(portal): backfill office assignment for existing members"
```

---

## Task 8: 招待APIの officeId 必須化（純関数＋テスト＋配線）

**Files:**
- Create: `lib/portal/invite-validation.ts`
- Create: `__tests__/portal-invite-office-required.test.ts`
- Modify: `app/api/tenants/[tenantId]/members/invite/route.ts`

- [ ] **Step 1: 失敗するテストを書く**

`__tests__/portal-invite-office-required.test.ts`:

```ts
import { describe, it, expect } from 'vitest'
import { validateInviteOffices } from '@/lib/portal/invite-validation'

describe('validateInviteOffices', () => {
  it('member/guest は officeIds が空だとエラー', () => {
    expect(validateInviteOffices('member', [])).toEqual({ ok: false, error: 'officeIds required for member/guest' })
    expect(validateInviteOffices('guest', undefined)).toEqual({ ok: false, error: 'officeIds required for member/guest' })
  })
  it('member/guest は officeIds があればOK', () => {
    expect(validateInviteOffices('member', ['11111111-1111-1111-1111-111111111111'])).toEqual({ ok: true })
  })
  it('owner/admin は officeIds 不要', () => {
    expect(validateInviteOffices('admin', [])).toEqual({ ok: true })
    expect(validateInviteOffices('owner', undefined)).toEqual({ ok: true })
  })
})
```

- [ ] **Step 2: テストが落ちることを確認**

Run: `npm test -- portal-invite-office-required`
Expected: FAIL（`validateInviteOffices` が未定義でモジュール解決エラー）。

- [ ] **Step 3: 純関数を実装**

`lib/portal/invite-validation.ts`:

```ts
export type InviteRole = 'owner' | 'admin' | 'member' | 'guest' | 'supporter'

export function validateInviteOffices(
  role: InviteRole,
  officeIds: string[] | undefined | null,
): { ok: true } | { ok: false; error: string } {
  const needsOffice = role === 'member' || role === 'guest'
  if (needsOffice && (!officeIds || officeIds.length === 0)) {
    return { ok: false, error: 'officeIds required for member/guest' }
  }
  return { ok: true }
}
```

- [ ] **Step 4: テストが通ることを確認**

Run: `npm test -- portal-invite-office-required`
Expected: PASS（3 tests）。

- [ ] **Step 5: 招待ルートに配線**

`app/api/tenants/[tenantId]/members/invite/route.ts` の、role と officeIds を読み取った直後（既存の officeIds 実在チェックの前）に挿入:

```ts
import { validateInviteOffices } from '@/lib/portal/invite-validation'
// ... role, officeIds を取得した後:
const officeCheck = validateInviteOffices(role, officeIds)
if (!officeCheck.ok) {
  return NextResponse.json({ error: officeCheck.error }, { status: 400 })
}
```

- [ ] **Step 6: 型チェック**

Run: `npm run typecheck`
Expected: エラーなし（既存の `NextResponse` import を利用。無ければ既存の返却パターンに合わせる）。

- [ ] **Step 7: コミット**

```bash
git add lib/portal/invite-validation.ts __tests__/portal-invite-office-required.test.ts app/api/tenants/[tenantId]/members/invite/route.ts
git commit -m "feat(portal): require officeIds when inviting member/guest"
```

---

## Task 9: フェーズ1の総合検証

**Files:** なし（検証のみ）

- [ ] **Step 1: クリーン適用**

Run: `npm run supabase:reset`
Expected: 全84+マイグレーションがエラーなく適用。

- [ ] **Step 2: 型チェックとテスト**

Run: `npm run typecheck && npm test`
Expected: typecheck エラーなし、vitest 全green（既存＋新規invite）。

- [ ] **Step 3: 越境の要ケースをSQLで確認（手動RLSチェック）**

`supabase/README` の手順でローカル起動し、Supabase Studio かサービスロールSQLで、テストユーザー2名（別テナント/別office）を作り、`set request.jwt.claims` を切り替えて `visa_application_cases` を跨いで SELECT/INSERT できないことを確認する。最低限、次を確認:
- office未割当の member は people を1件も取得できない（RESTRICTIVE fail-closed）。
- テナントAのユーザーが tenant_id=B の case を INSERT できない（複合FK＋RLSで拒否）。

Expected: いずれも拒否/空。詳細な自動RLSテストはフェーズ2でハーネスを整備する（本フェーズでは手動確認）。

- [ ] **Step 4: 最終コミット（必要なら）**

```bash
git add -A && git commit -m "chore(portal): phase1 foundation verified" --allow-empty
```

---

## Self-Review（記入済み）

- **Spec coverage:** §5.2(office一本化=Task1)/§5.3(コアテーブル=Task3)/§5.5(マスタ=Task4)/§6.1(関数=Task2)/§6.2(新表RLS=Task5)/§6.3(RESTRICTIVE=Task6)/§8(移行・招待=Task1,7,8) を網羅。§7(kintone)・§9(UI)・カタログのシード値(§10-2依存)は**フェーズ2/3**（スコープ外を明記）。
- **Placeholder scan:** カタログの「値」シードは §10-2 業務確定待ちで意図的にフェーズ2送り（プラン内プレースホルダではなく外部依存）。それ以外に TBD/未定義参照なし。
- **Type consistency:** 関数名 `portal_can_access_office`/`portal_has_tenant_wide_access`/`portal_is_writer`/`portal_can_upload` は Task2 定義を Task5/6 で一貫使用。テーブル/カラム名は Task3 定義と後続で一致。`validateInviteOffices` の戻り型は Task8 内で一貫。

## 既知の限界・後続フェーズへの申し送り
- RLSの自動統合テスト基盤が本リポに無いため、フェーズ1は手動SQL検証。**フェーズ2でロール別RLSテストハーネス（`set local role` / JWTクレーム切替のvitest統合）を整備**する。
- 人材書類ファイル本体のoffice保護は「外部ユーザーの署名URLをサーバAPI経由に限定」で実現する方針（仕様§6.3）。このサーバAPIは**フェーズ2**で実装。
- `materialize_case_requirements` RPC（権限再検査つき）は案件作成フローの一部として**フェーズ2**で実装。
