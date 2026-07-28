# 受入企業向け 在留資格申請 提出ポータル ― 設計仕様書 (v2)

- 対象プロダクト: **FunBase**（既存の外国人人材管理アプリを拡張）
- 作成日: 2026-07-24 / 版: v2（アドバーサリアル検証24件＋スコープ確定を反映）
- ステータス: ドラフト（レビュー待ち）
- 凡例: `【事実】`=既存コード確認済み / `【設計】`=新規提案 / `【要確認】`=業務/実データ確認が必要。

## 0. v2での主な変更（v1からの差分）
- **入力フォームは作らない**。企業の提出は **Excel添付 ＋ 証明書ファイルのアップロード** のみ（お手軽さ重視。ビザ費用をいただく前提で企業に入力負担をかけない）。
- 企業とのやり取りは **FunBase内のコメント**（案件ごと）で補完＝メールスレッドの置換。
- **案件はOP（supporter）が作成**する（§4章を新設。旧仕様の致命的欠落を解消）。
- **kintone連携（書き込み）はv1で実施**。提出Excelを読み取り、kintone登録に必要な項目を集めてkintoneへ反映（転記削減）。**OCR（証明書画像の中身読取）はv2**。
- セキュリティ（office境界）を **people.tenant_office_id(UUID) 導入で一本化**し、検証で判明した越境穴を塞ぐ。
- 既存メンバー締め出しを防ぐ **移行/バックフィル手順**を明記。

## 1. 背景と課題
特定技能ビザ申請で、受入企業からの提出書類を **メール添付** でやり取りしており、(1)進捗が追えない、(2)企業が何が必要/不足か分からない、(3)OPが受領ファイルを目視で kintone に手入力転記、という課題がある。本ポータルは①提出をメールから置換し、②提出Excelを読み取って kintone へ連携し転記を削減する。

## 2. 棲み分け（確定）
```
企業 ──FunBaseポータル(Excel+書類提出・可視化・コメント)──▶ kintone(登録の正) ──ボタン──▶ RAKUVISA(様式作成→行政書士→入管申請)
       ↑ メール置換                        ↑ 提出Excelを読み取り自動反映(v1) / 証明書はOCR(v2)
```
- **FunBase**：受入企業の窓口。Excel＋書類の収集・進捗可視化・コメント・OPレビュー・kintone書き込み。
- **kintone**：登録情報の正（企業・人材マスター、ビザ進捗、管理番号）。既存の kintone→RAKUVISA ボタン連携は不変。
- **RAKUVISA**：様式作成・行政書士依頼・入管申請（作成以降）＝**スコープ外**。
- **メール**：廃止（提出・進捗・やり取りをポータル＋コメントへ）。

## 3. スコープ
### v1でやること
- 受入企業担当者が **案内ベースUI**（申請の流れ／次にやること）で、**必要書類チェックリスト**（未提出/確認中/承認済み/要修正・有効期限・請求先）を見て、**Excel添付と証明書ファイルをアップロード**。
- 必要書類は **〔法人/個人事業主〕×〔初回/更新〕×〔分野〕マトリクス**で自動生成。
- OP（supporter）が **案件作成・確認・承認・差戻し・リマインド**。
- 案件ごとの **コメント**（企業⇔OP、メール置換）。
- 提出Excelを読み取り、**kintone登録に必要な項目を集めてkintoneへ書き込み**（転記削減）。
- 外部企業ユーザーに安全に開放する **office境界の RLS（UUIDで一本化）**。

### v2（次段）
- **OCR**：証明書（PDF/画像）の中身を自動読取→下書き→OP確認→kintone。自動チェック（有効期限3ヶ月/未納0/マスキング/24か月分/本籍地有無）。

### やらないこと（Non-Goals）
- **様式生成**（雇用条件書・報酬説明書などの作成）＝RAKUVISA。
- 行政書士依頼・入管申請＝RAKUVISA。
- **企業向けの構造化入力フォーム**（企業はExcel＋ファイルを渡すだけ。データ化はFunBase側で行う）。

## 4. 案件の作成フロー（新設・v1の起点）
> 旧v1で未定義だった「誰が・いつ・どう案件を作り人材を紐付けるか」を定義。これが無いとチェックリストが1件も生成されない。

- **作成主体**：OP（`supporter`）が手動作成（v1）。kintone同期由来の自動生成はv2以降。
- **作成手順**：
  1. OPが `POST /api/applications` で案件を作成。入力＝`tenant_id`（受入企業）・`tenant_office_id`（事業所）・`entity_type`（法人/個人）・`application_category`（初回/更新）・`field`（分野）・`management_number`（任意）。
  2. `POST /api/applications/[caseId]/members` で対象人材を紐付け（kintone同期済みの `people` から選択）。**人材の選択基準**：既定は UI で手動選択（office に属する people を候補表示。候補は `people.tenant_office_id`＝§6 で導入 で絞る）。
  3. 上記確定後に **`materialize_case_requirements(case_id)`**（SECURITY DEFINER RPC）でテンプレ→`case_document_requirements` を生成。`scope='person'` 行はメンバー人数分に展開。
- **メンバー後追い**：案件作成後に `case_members` を追加した場合、追加 person の `scope='person'` 必要書類を**追補**するトリガ/アプリ処理を必ず走らせる（materialize は `ON CONFLICT DO NOTHING` で冪等）。
- **RPCの権限再検査**：`materialize_case_requirements` は SECURITY DEFINER のため、**本体で必ず** `portal_can_access_office((SELECT tenant_id..),(SELECT tenant_office_id..))` により呼び出し元の権限を再検証し、任意 `case_id` への越境書き込みを防ぐ。

## 5. データモデル
### 5.1 既存スキーマ前提（【事実】）
- `people.id text` / `tenant_id uuid` / `external_id text`（更新キー候補、ユニークは `20260212100000` で撤廃）/ `company text`（自由文字列）。
- `visas`（7段階 status、type=認定/変更/更新/特定活動/資格変更）。
- `tenant_offices(id, tenant_id)` に複合UNIQUE。子は複合FKで同一テナント担保（`user_tenant_offices` が前例）。
- `person_documents`（人材単位）＋バケット `person-documents`。**制約は `UNIQUE(person_id, document_type) WHERE document_type <> 'other'` の部分ユニーク**（`other` は複数可, `20260609170000`）。再利用する。
- ネイティブ enum は使わず `text + CHECK`。

### 5.2 office境界キーの一本化【設計・重要】
検証で「案件側=UUID一致／既存people側=`company`名一致」の二重定義が越境・情報欠落を生むと判明。**v1で `people.tenant_office_id uuid`（FK `tenant_offices(id,tenant_id)` 複合）を導入**し、全ての office 判定を UUID に統一する。
- 移行で `people.company` × `tenant_offices.name` を突合してバックフィル（§8 移行手順）。以後の突合基準は **1つ**（UUID一致）に統一し、`people-access.ts` のアプリ層フィルタも UUID 基準へ寄せる。
- `person_documents` にも `tenant_office_id`（people から継承）を持たせる。

### 5.3 新規テーブル（DDL）
命名 `visa_application_*`。全テーブル `tenant_id` と `tenant_office_id` を非正規化保持。**親子の tenant/office 整合を複合FKで担保**（検証#3の越境書き込み対策）。

```sql
CREATE TABLE public.visa_application_cases (
  id                   uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id            uuid NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  tenant_office_id     uuid NOT NULL,
  entity_type          text NOT NULL CHECK (entity_type IN ('corporate','sole_proprietor')),
  application_category  text NOT NULL CHECK (application_category IN ('initial','renewal')),
  field                text NOT NULL CHECK (field IN ('care','food_service','accommodation','food_manufacturing','other')),
  application_type     text CHECK (application_type IN ('認定申請','変更申請','更新申請','特定活動申請','資格変更（特定技能2号）')),
  management_number    text,
  kintone_record_id    text,                         -- 書込先kintone $id 【要確認: external_idの中身】
  status               text NOT NULL DEFAULT 'draft'
                         CHECK (status IN ('draft','collecting','reviewing','ready','synced','completed','archived')),
  title text, note text,
  kintone_sync_status  text, kintone_last_synced_at timestamptz,
  created_by uuid REFERENCES auth.users(id),
  created_at timestamptz NOT NULL DEFAULT now(), updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT vac_office_fk FOREIGN KEY (tenant_office_id, tenant_id)
    REFERENCES public.tenant_offices(id, tenant_id) ON DELETE RESTRICT,
  CONSTRAINT vac_id_tenant_office_uniq UNIQUE (id, tenant_id, tenant_office_id)   -- 子の複合FK参照用
);
CREATE UNIQUE INDEX uq_vac_mgmt_no ON public.visa_application_cases(tenant_id, management_number) WHERE management_number IS NOT NULL;

CREATE TABLE public.visa_application_case_members (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  case_id uuid NOT NULL, tenant_id uuid NOT NULL, tenant_office_id uuid NOT NULL,
  person_id text NOT NULL REFERENCES public.people(id) ON DELETE CASCADE,
  visa_id text REFERENCES public.visas(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  -- tenant/office 整合を親caseと厳密一致させる（越境INSERT防止, 検証#3）
  CONSTRAINT vacm_case_fk FOREIGN KEY (case_id, tenant_id, tenant_office_id)
    REFERENCES public.visa_application_cases(id, tenant_id, tenant_office_id) ON DELETE CASCADE,
  CONSTRAINT uq_case_person UNIQUE (case_id, person_id)
);

CREATE TABLE public.office_documents (   -- 取得書類8種（企業/事業所単位・複数人材共通）
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

CREATE TABLE public.case_document_requirements (   -- 必要書類チェックリスト
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
-- 一意性: NULLS DISTINCT の穴を避け、office行/person行で別の部分ユニーク（検証#13）
CREATE UNIQUE INDEX uq_cdr_office  ON public.case_document_requirements(case_id, document_code) WHERE person_id IS NULL;
CREATE UNIQUE INDEX uq_cdr_person  ON public.case_document_requirements(case_id, document_code, person_id) WHERE person_id IS NOT NULL;

CREATE TABLE public.case_comments (   -- 案件ごとのやり取り（メール置換）
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  case_id uuid NOT NULL, tenant_id uuid NOT NULL, tenant_office_id uuid NOT NULL,
  requirement_id uuid REFERENCES public.case_document_requirements(id) ON DELETE SET NULL, -- 任意: 書類に紐付く
  author uuid REFERENCES auth.users(id), body text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT cc_case_fk FOREIGN KEY (case_id, tenant_id, tenant_office_id)
    REFERENCES public.visa_application_cases(id, tenant_id, tenant_office_id) ON DELETE CASCADE
);

CREATE TABLE public.case_document_events (   -- 監査（提出/承認/差戻し/リマインド）
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  case_id uuid NOT NULL, tenant_id uuid NOT NULL, requirement_id uuid,
  event_type text NOT NULL CHECK (event_type IN ('submitted','approved','rejected','reminded')),
  actor uuid REFERENCES auth.users(id), comment text,
  created_at timestamptz NOT NULL DEFAULT now()
);
```
主要 index（tenant_id, tenant_office_id, status, case_id）は各表に付与。

### 5.4 提出Excelの扱い（v1のkintone連携の入口）
- 提出Excel（申請書類作成フォーム）は `office_documents` に `document_code='application_workbook'` として保存。
- 保存後に **パースジョブ**が Excel の該当セルを読み取り、`case_data_extractions`（下記）へステージング→OP確認→kintoneへ書き込み（§7）。
```sql
CREATE TABLE public.case_data_extractions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  case_id uuid NOT NULL, tenant_id uuid NOT NULL,
  source text NOT NULL CHECK (source IN ('workbook','ocr')),  -- v1=workbook, v2=ocr
  target_kind text NOT NULL,                 -- 'company' | 'person'
  person_id text,                            -- person向けのとき
  payload jsonb NOT NULL,                    -- 抽出フィールド（kintoneフィールドコード→値）
  status text NOT NULL DEFAULT 'draft' CHECK (status IN ('draft','confirmed','synced','error')),
  created_at timestamptz NOT NULL DEFAULT now()
);
```
- **【要確認】** 実Excelは `#REF!`/`#N/A` を含むため、パーサは壊れセルを**スキップ＋要確認フラグ**にする。どのセルを kintone のどのフィールドへ入れるかの**マッピングは実ワークブックから確定**（§10）。

### 5.5 マスタ（マトリクス）
`document_catalog`（code, name, default_scope, is_acquired_cert）／`document_requirement_templates`（entity_type×application_category×field 複合UNIQUE）／`document_requirement_template_items`（document_code, scope, is_required, copy_type, issuer, validity_months）。テナント非依存グローバル、冪等シード（`ON CONFLICT`）、SELECT=全authenticated・変更=service_roleのみ。案件作成時に一致テンプレの items を `case_document_requirements` へスナップショット。

## 6. 認証・権限・RLS（セキュリティ）
外部の受入企業担当者に開放するため、**office境界を RLS で強制**（fail-closed）。office 判定は §5.2 の `tenant_office_id`(UUID) に統一。

### 6.1 境界関数（新規・SECURITY DEFINER・search_path固定）
```sql
CREATE FUNCTION public.portal_has_tenant_wide_access(p_tenant_id uuid)
RETURNS boolean LANGUAGE sql SECURITY DEFINER STABLE SET search_path = public AS $$
  SELECT EXISTS (SELECT 1 FROM public.user_tenants ut
    WHERE ut.user_id = auth.uid() AND ut.tenant_id = p_tenant_id
      AND ut.status='active' AND ut.role IN ('owner','admin','supporter'));
$$;

-- office境界。tenant-wide短絡枝でも office∈tenant を必ず検証（検証#3）。割当なし=false（fail-closed, 検証#2）。
CREATE FUNCTION public.portal_can_access_office(p_tenant_id uuid, p_office_id uuid)
RETURNS boolean LANGUAGE sql SECURITY DEFINER STABLE SET search_path = public AS $$
  SELECT EXISTS (SELECT 1 FROM public.tenant_offices o
           WHERE o.id = p_office_id AND o.tenant_id = p_tenant_id)   -- office∈tenant 必須
    AND (public.portal_has_tenant_wide_access(p_tenant_id)
      OR EXISTS (SELECT 1 FROM public.user_tenants ut
          JOIN public.user_tenant_offices uto ON uto.user_tenant_id = ut.id
          WHERE ut.user_id = auth.uid() AND ut.tenant_id = p_tenant_id
            AND ut.status='active' AND uto.tenant_office_id = p_office_id));
$$;

CREATE FUNCTION public.portal_is_writer(p_tenant_id uuid)   -- member 以上（承認等）
RETURNS boolean LANGUAGE sql SECURITY DEFINER STABLE SET search_path = public AS $$
  SELECT EXISTS (SELECT 1 FROM public.user_tenants ut WHERE ut.user_id=auth.uid()
    AND ut.tenant_id=p_tenant_id AND ut.status='active'
    AND ut.role IN ('owner','admin','supporter','member'));
$$;

CREATE FUNCTION public.portal_can_upload(p_tenant_id uuid)  -- guest も含む（アップロード可）
RETURNS boolean LANGUAGE sql SECURITY DEFINER STABLE SET search_path = public AS $$
  SELECT EXISTS (SELECT 1 FROM public.user_tenants ut WHERE ut.user_id=auth.uid()
    AND ut.tenant_id=p_tenant_id AND ut.status='active'
    AND ut.role IN ('owner','admin','supporter','member','guest'));
$$;
```

### 6.2 新規テーブルのRLS（コマンド別・最小権限）
- **SELECT**＝`portal_can_access_office`。
- **INSERT/UPDATE**＝office境界＋`portal_is_writer`。**ただし `office_documents` の INSERT（アップロード）は `portal_can_upload`（guest含む）**（検証#6/#11の矛盾解消）。
- **DELETE**＝`portal_has_tenant_wide_access`（member/guest には DELETEポリシーを作らない＝default-deny）。
- `case_comments` INSERT＝`portal_can_upload`（企業もコメント可）、SELECT＝office境界。
- なりすまし防止：`uploaded_by`/`author = (SELECT auth.uid())` を WITH CHECK。`auth.uid()` は `(SELECT auth.uid())` でラップ。

### 6.3 既存 people / person_documents / storage を締める
検証#12（SELECT限定で書込が素通り）・#2/#8（人材書類ファイルがoffice非保護）を解消。
- **people / person_documents に RESTRICTIVE を FOR ALL（SELECT/INSERT/UPDATE/DELETE）で追加**。判定は §5.2 の `tenant_office_id`(UUID)。owner/admin/supporter は `portal_has_tenant_wide_access` で素通り、member/guest は自 office のみ。
```sql
CREATE POLICY people_office_boundary ON public.people AS RESTRICTIVE FOR ALL TO authenticated
  USING (portal_has_tenant_wide_access(tenant_id)
      OR (tenant_office_id IS NOT NULL AND portal_can_access_office(tenant_id, tenant_office_id)));
-- person_documents も tenant_office_id を持たせ同型
```
- **ファイル本体（Storage）**：人材書類パスに office が無い問題（検証#2/#8）を、**外部ユーザーの署名URL発行はサーバAPI経由に限定**して解決する。サーバが `office_documents`/`person_documents` の `tenant_office_id` と `portal_can_access_office` を検査してから署名URLを返す。storage RLS はテナント単位を defense-in-depth として維持し、**企業書類パスは `${tenantId}/offices/${officeId}/...`、人材書類は既存パス**のまま、`foldername` 依存の RESTRICTIVE は用いない（人材パスで NULL 判定になり自機能を壊すため）。内部staffは直接署名URL可。
- **突合規則の統一**（検証#9）：office 判定は UUID一致に統一したため、`people.company` 文字列一致は用いない。移行時に company→office の突合で `people.tenant_office_id` をバックフィル（§8）。

### 6.4 既存の穴と対策（検証反映）
| # | 穴 | 対策 |
|---|---|---|
| 越境書込(#3) | 子テーブルが tenant/office を親と一致させる制約なし＋関数短絡 | 子に複合FK `(id,tenant_id,tenant_office_id)`、関数に office∈tenant 検証 |
| 人材ファイル(#2/#8) | person 書類ファイルが office 非保護 | 外部ユーザーの署名URLはサーバAPIで office 検査 |
| 書込素通り(#12) | RESTRICTIVE が SELECT のみ | people/person_documents を FOR ALL に |
| 境界二重定義(#14/#18) | UUID と 名称一致の二系統 | people.tenant_office_id(UUID) で一本化 |
| 締め出し(#7/#10) | 既存 office未割当 member/guest / office未作成テナント | §8 バックフィルを RESTRICTIVE 適用の前提に |
| guest上書き矛盾(#6/#11) | INSERT が writer 限定 | office_documents/comments は portal_can_upload |
| RPC越境(#23) | materialize が DEFINER で権限無検査 | RPC本体で portal_can_access_office 再検査 |
| feature露出(#24) | feature 欠落=許可で全テナント表示 | `applications` は既定 off（欠落→非表示の特別扱い）＋段階解放 |
| 旧教訓 | user_metadata 参照RLS禁止 / DEFINER search_path固定 | 新規は遵守 |

## 7. kintone 連携（FunBase → kintone 書き込み）
**【事実】現状は読み取り専用**（OAuth read のみ）。書込API `createRecords`/`updateRecords`（`lib/kintone/api-client.ts:220-255`）は実装済・未使用。

### 7.1 有効化手順（順序厳守）
1. **重複トークンのデデュープ＋UNIQUE制約**（検証#4/#5, 先行必須）：`credentials` を `(connector_id,type)` で最新1件に整理するマイグレーション → `CREATE UNIQUE INDEX (connector_id,type)`。※これが無いと upsert は `no unique or exclusion constraint matching ON CONFLICT` で必ず失敗。
2. **write スコープ追加**：`lib/integrations/kintone.ts:36` の固定スコープに `k:app_record:write`（添付も送るなら `k:file:write`）。スコープの真実source が3箇所に分散しているため、**固定文字列を廃し `KintoneConfig.scope` に一本化**してから追加。
3. **コールバックの upsert 化**：`callback/route.ts` の `.insert()` を `upsert(onConflict:'connector_id,type')` に（手順1の制約が前提）。※これは行の無限蓄積を防ぐ衛生と再認可の冪等化が目的。**「重複が `.single()` を壊すから先行必須」という理由は誤り**（実際のライブ読取は `order(created_at desc).limit(1)` で最新を取得＝壊れない, 検証#15/#20）。真の先行必須は手順1の制約追加。
4. **再認可（再同意）必須**：既存トークンは付与時スコープに固定。各コネクタで `start` を再実行して再同意。kintone側 OAuthクライアント設定にも write 許可を追加【要確認】。
5. **共通クライアントファクトリ配線**：`createKintoneClient(connectorId)`（現状 `throw`）に、`createSyncService()` のトークン取得＋リフレッシュ＋生成ロジックを切り出して実装。read/write 共通化。

### 7.2 何を書くか
kintone が「登録の正」なので、FunBase は **(a) 提出Excelから抽出した登録項目**（企業・人材・雇用条件などの `kintone登録に必要なもの`）と **(b) 受領/進捗ステータス** を書く。ファイル本体は当面 kintone へ送らない。
- **書込は FunBase 権威の対象フィールドに限定**し、kintone側に **FunBase専用フィールドは設けず**、登録項目は既存の企業/人材フィールドへ更新キーで反映（(a)）。人手/RAKUVISAが後段で編集する運用のため、**書込トリガはOP確認後（`case_data_extractions.status='confirmed'`）**に限定して競合を避ける。

### 7.3 更新キーと方向管理
- **更新キー＝管理番号 → kintone `$id`**。`people.external_id`【要確認: `$id` か業務管理番号か】。管理番号なら `updateRecords` を kintone `updateKey` 対応へ拡張（現状 `id`=$id のみ）。撤廃済みユニーク（`20260212100000`）ゆえ重複時は書込中止＋要確認。
- **逆マッピングは自動対称ではない**（検証#17）：値変換の非可逆・kintone型エンベロープ（`{value}`、USER_SELECT/CHECK_BOX配列、日付書式）・計算/読取専用フィールド除外が必要。→ **少数の書込対象フィールド専用の前方ライタ（逆値マップ＋型整形）を新規実装**。`getUpdateKeys()` のみ再利用可（ただし**サーバ用 supabase client に差し替え**）、payloadビルダは新規。
- **方向分離**（検証#16）：`sync_direction` を導入するなら **既存の全読取 app-mapping クエリに `sync_direction IN ('read','both')` を追加**（見ないと write 行を非決定的に拾い read 同期を壊す）。または **書込専用の app/field マッピングを別立て**して読取と物理分離（推奨）。FunBase が書くフィールドは read 方向マッピングに含めない（ループ防止）。

### 7.4 トリガー・冪等性・失敗時
- **トリガ**：OPが抽出内容を確認（`confirmed`）した時、またはOP承認時。サーバAPI（`app/api/applications/[caseId]/kintone-sync`）で実行。**クライアントから直接 kintone を叩かない**（企業ユーザーに書込権限を与えない, 検証のRLS方針と一致）。
- **冪等性**：`updateRecords` は $id/updateKey 更新で再送安全。ペイロードのハッシュ＋$idで直近成功と同一ならスキップ。
- **失敗時**：401→再認可導線＋コネクタ error 化 / 404($id不在)→スキップ＋要確認 / その他→**`sync_sessions`**（【事実】`sync_logs` は実在せず, 検証#22。write方向ログは `sync_sessions` か新設テーブルとして【設計】）に記録し指数バックオフでリトライ。非同期キュー化し、ポータルUXは FunBase状態で完結・kintone反映は結果整合。

## 8. 移行・ロールアウト手順（検証#7/#10, RESTRICTIVE適用前の前提）
外部ユーザーへ RESTRICTIVE を適用すると、既存の office 未割当 member/guest が締め出されるため、**次の順で実施**：
1. **既定 office 生成**：`tenant_offices` を持たない既存テナントに、既定 office を1つ生成。
2. **people.tenant_office_id 追加＋バックフィル**：`people.company` × `tenant_offices.name` の突合で `people.tenant_office_id` を投入（不一致は要手動）。`person_documents.tenant_office_id` も people から継承。
3. **メンバーの office 割当バックフィル**：既存 member/guest の `user_tenant_offices` を（company↔office突合 or 個別再招待で）投入。
4. **招待APIの officeId 必須化**：member/guest 招待は `officeIds.length>=1` を必須に。
5. **RESTRICTIVE 有効化**：1〜4完了を前提に people/person_documents の RESTRICTIVE と新テーブルRLSを有効化。
- バックフィル不能なメンバーの扱い（暫定ブロック or 手動割当）を運用で決める。`applications` feature は既定 off で段階解放（検証#24）。

## 9. 画面・UX（案内ベース）
最初の画像イメージに沿い、**申請の流れ（今どのステップか）＋ 次にやること ＋ 各書類の状況** が視覚的に分かる案内型。企業/OP は同一ルートを role で出し分け。

| # | 画面 | 対象 | ルート | 再利用/新規 |
|---|------|------|--------|------------|
| 1 | 案件ダッシュボード | 企業=自社 / OP=横断 | `/applications` | DataTable/カード＋Stepper 再利用 |
| 2 | 案件詳細（流れ＋次にやること＋チェックリスト＋コメント） | 企業/OP | `/applications/[caseId]` | 新規レイアウト＋既存部品 |
| 3 | 提出（Excel添付＋証明書アップロード） | 企業 | 2内インライン | `DocumentUploadCard`（owner を office/case へ一般化） |
| 4 | 差戻し対応 | 企業 | `/applications/[caseId]?doc=<code>` | 新規（理由表示＋再アップ＋コメント） |
| 5 | 案件作成 | OP | `/applications/new` | 新規（企業/office/分野/初回更新＋人材選択） |
| 6 | レビュー（承認/差戻し/リマインド） | OP | `/applications/[caseId]?tab=review` | 新規操作UI＋既存Dialog/Toast |
| 7 | kintone連携（抽出確認→書込→結果） | OP | `/applications/[caseId]?tab=kintone` | 新規パネル＋既存 api-client |

- 提出は **Excel＋証明書ファイル**のみ（入力フォームは無し）。企業⇔OPの補足は **コメント**（画面2内スレッド）。
- **リマインド**（検証#19）：**アプリ内通知＋任意でメール（進捗催促のみ）**。書類授受はポータル完結。宛先は office 割当ユーザー、多重送信抑止、テンプレを定義。メール送信は既存 `sendEmail` 再利用。
- **再利用**：`document-upload-card`（owner一般化）/`data-table`/`page-header`/`stepper`/`deadline-chip`/`status-badge`/`dialog`/`filter-multi-select-popover`＋`result-count-badge`/`toaster`/`tabs`/`person-documents-tab` の `DOCUMENT_SECTIONS`。
- **新規**：`app/applications/*`（一覧/詳細/new）、`ChecklistRow`/`ReviewActionBar`＋`RejectReasonDialog`/`RemindButton`/`KintoneSyncPanel`/`CaseCommentThread`/`CaseProgressHeader`、必要書類マトリクス resolver、レビュー状態 enum＋色関数。
- **API**：`app/api/applications/...`（一覧/詳細/`members`/`documents/[code]`/`review`/`comments`/`kintone-sync`）。アクセスガードは office 境界を必ず通す。
- サイドバー：`applications` エントリ（既定 off ゲート、§6.4#24）。既存 `/documents`（人材書類）とは別メニュー。

## 10. 未確定・要確認事項
1. **提出Excel → kintone のフィールドマッピング**：実ワークブックのどのセルを kintone のどのフィールド/アプリへ入れるか。`#REF!`/`#N/A` の扱い。＝v1のkintone連携の核。
2. **取得書類8種の正式名称・コード・分野別の要否/原本写し/請求先**：業務側から受領しカタログ＆テンプレをシード。
3. **`people.external_id` の中身**（kintone `$id` か業務管理番号か）と書込先 kintone アプリのID対応。
4. **kintone OAuthクライアント側の write スコープ許可**（cybozu.com 設定）。
5. **人材選択の基準**（案件へ紐付ける people を office 候補から手動選択で確定か）。
6. **案件の全体ステータス語彙**（draft/collecting/…）を実運用フローで確定。

## 11. 実装順序（目安）
1. 移行（§8）：既定office生成→`people.tenant_office_id`追加＋バックフィル→メンバーoffice割当→招待officeId必須化。
2. 新規テーブル群＋マスタ＋境界関数＋RLS（§5,§6）。people/person_documentsのRESTRICTIVE（FOR ALL）。
3. マスタのシード（§10-2 確定後）。
4. 案件作成フロー（§4）：`/applications/new`＋`POST /applications`＋`members`＋`materialize`（権限再検査つき）。
5. `/applications` 画面・API・コメント・アップロード（§9）。`DocumentUploadCard` の owner 一般化。外部ユーザーの署名URLはサーバAPI経由（§6.3）。
6. Excel パース → `case_data_extractions` → OP確認。
7. kintone 書込（§7）：デデュープ＋UNIQUE→スコープ一本化＋write追加→callback upsert→再認可→`createKintoneClient`配線→専用前方ライタ＋方向分離。
8. E2E（企業=自社のみ提出可 / 他社越境不可(SELECT/INSERT両方) / OP作成→レビュー→抽出確認→kintone反映）。
