# 案件の複数事業所化 ＋ 事業所名入りテンプレDL 設計

作成日: 2026-08-05

## 背景

ビザ申請案件（`visa_application_cases`）は現在 1案件 = 1事業所に固定されている。実際には
1つの申請が複数事業所にまたがる（申請書類作成フォームの「はじめに」シートにも
**Ⅲ.(今回受入れ予定の)事業所情報** として最大5事業所の記入欄がある）。

kintone「就労_ビザ案件管理」(app296) 側も `office_ref` / `office_name_disp` の単一フィールドで、
`koyou_details`（対象者・複数可）のようなサブテーブルになっていない。

あわせて、企業が記入する申請書類作成フォーム(Excel) を FunBase から
**事業所名がセット済みの状態でダウンロード**できるようにしたい。現状 FunBase には
テンプレDL機能そのものが無く、アップロードのみ。

## ゴール

1. 1案件が複数事業所を持てる（FunBase DB・kintone 双方）
2. 案件に設定された事業所名を埋め込んだ申請書類作成フォームを FunBase からDLできる

## 調査で確定した事実

### kintone app296（実機確認済み）

| フィールドコード | 型 | ラベル |
|---|---|---|
| `office_ref` | NUMBER (app36 ルックアップ, key=`OFID`) | 事業所 |
| `office_name_disp` | SINGLE_LINE_TEXT | 事業所名（自動） |
| `koyou_details` | SUBTABLE | 対象者（雇用条件書・複数可） |
| └ `koyou_ref` | NUMBER (app55 ルックアップ) | 雇用条件書 |
| └ `koyou_hrid` | NUMBER | 人材ID（自動） |
| └ `koyou_applicant_disp` | SINGLE_LINE_TEXT | 申請人（自動） |
| └ `koyou_sync_status` | DROP_DOWN | 反映 |

レコードは4件のみ（#3/#5/#6/#7）で、構成変更の影響は小さい。

### テンプレ Excel（`2．申請書類作成フォーム.xlsx`）

`はじめに` シートの **Ⅲ.(今回受入れ予定の)事業所情報**：

| 行 | C列（結合 C:D） | E列（結合 E:F） | G列（結合 G:H） |
|---|---|---|---|
| 28 | 事業所名（見出し） | 労働保険番号 | 雇用保険適用事業所番号 |
| 29〜33 | ①〜⑤ の記入欄 | | |

`B41:C45` は `=C29`〜`=C33` の数式なので、C29:C33 を書けば「事業所 協力確認書提出状況」
セクションにも自動で反映される。**書き込み先は C29〜C33 のみ**。

### FunBase の既存構造

- `visa_application_cases.tenant_office_id` は NOT NULL で、RLS のアクセス境界キー
- 子3テーブル（`visa_application_case_members` / `case_document_requirements` / `case_comments`）が
  複合FK `(case_id, tenant_id, tenant_office_id) → visa_application_cases(id, tenant_id, tenant_office_id)` で伝播
- RLS は全テーブルで `portal_can_access_office(tenant_id, tenant_office_id)`
- `document_catalog` の16書類は**すべて法人単位**（履歴事項全部証明書・納税証明書・社会保険料 等）。
  事業所ごとに複製が必要な書類は無い

## 決定事項

| 論点 | 決定 |
|---|---|
| FunBase のデータモデル | 案件を**完全に**複数事業所化（`tenant_office_id` を案件から削除） |
| kintone の既存単一フィールド | **削除**し、`office_details` サブテーブル内で同じフィールドコードを再利用 |
| kintone のアプリ設定変更 | Claude が API で実施（本番デプロイ前にユーザー確認） |
| テンプレ原本の置き場所 | リポジトリ同梱 |
| テンプレに埋める項目 | **事業所名のみ**（労働保険番号・雇用保険適用事業所番号は企業が記入） |

## 設計

### パートA: FunBase DB の複数事業所化

#### 新テーブル

```sql
CREATE TABLE public.visa_application_case_offices (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  case_id uuid NOT NULL REFERENCES public.visa_application_cases(id) ON DELETE CASCADE,
  tenant_id uuid NOT NULL,
  tenant_office_id uuid NOT NULL,
  sort_order integer NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT vaco_office_fk FOREIGN KEY (tenant_office_id, tenant_id)
    REFERENCES public.tenant_offices(id, tenant_id) ON DELETE RESTRICT,
  CONSTRAINT uq_vaco UNIQUE (case_id, tenant_office_id)
);
```

`sort_order` 昇順がテンプレの ①〜⑤ の並び。**先頭行（sort_order 最小・同値は created_at→id）を代表事業所**とする。

#### 既存テーブルの変更

1. **バックフィルを先に実行**: 既存案件の `tenant_office_id` を `case_offices` に1行ずつ投入（`sort_order = 0`）
2. `visa_application_cases`: `tenant_office_id` 列・`vac_office_fk`・`idx_vac_tenant` を削除。
   `UNIQUE(id, tenant_id, tenant_office_id)` → `UNIQUE(id, tenant_id)` へ差し替え
3. 子3テーブル: `tenant_office_id` 列と複合FKを削除し、`(case_id, tenant_id) → visa_application_cases(id, tenant_id)` に張り直し

`office_documents` はスキーマ変更なし（`tenant_office_id` を持ち続ける）。

#### RLS

```sql
CREATE FUNCTION public.portal_can_access_case(p_case_id uuid) RETURNS boolean
LANGUAGE sql SECURITY DEFINER STABLE SET search_path = public AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.visa_application_case_offices o
    WHERE o.case_id = p_case_id
      AND public.portal_can_access_office(o.tenant_id, o.tenant_office_id));
$$;
```

- `visa_application_cases`: SELECT/UPDATE/DELETE を `portal_can_access_case(id)` に差し替え。
  INSERT は行がまだ無いため `portal_is_writer(tenant_id)` のみ
- 子3テーブル: SELECT/UPDATE/DELETE を `portal_can_access_case(case_id)` に差し替え。
  INSERT も同様（親が先に作られている前提）
- `visa_application_case_offices`: SELECT は `portal_can_access_case(case_id)`（案件が見えるなら全事業所行が見える）。
  INSERT/UPDATE/DELETE は `portal_can_access_office(tenant_id, tenant_office_id) AND portal_is_writer(tenant_id)`
  （＝アクセス権のある事業所しか案件に足せない）
- `case_document_events`: `portal_can_access_case(case_id)` に差し替え

#### 受け入れる挙動変更

1. **可視性が案件単位に広がる**。事業所Aのみ割当のユーザーが、A・B・C にまたがる案件を開くと
   B・C 由来の書類・コメントも見える。案件単位で協働する以上これが自然だが、現状より緩い
2. **office 書類は代表事業所に集約**。`office_documents` は `UNIQUE(tenant_office_id, document_code)`
   のため事業所が必要。カタログが全て法人単位なので代表事業所に寄せる

#### `materialize_case_requirements()`

`v_office` 前提を外す。`portal_can_access_office` チェックを `portal_can_access_case` に、
INSERT の `tenant_office_id` 列指定を削除する。**チェックリストは案件あたり1セットのまま**
（事業所ごとの複製はしない）。

### パートB: kintone app296 のサブテーブル化

`koyou_details` と同じ形にする。

```
SUBTABLE office_details 「事業所（複数可）」
  - office_ref        [NUMBER]            「事業所」      ← app36 ルックアップ (key=OFID)
  - office_name_disp  [SINGLE_LINE_TEXT]  「事業所名（自動）」 ← ルックアップの自動コピー先
```

手順: `PUT /k/v1/preview/app/form/fields.json`（既存2フィールド削除 → サブテーブル追加）
→ `POST /k/v1/preview/app/deploy.json`。

既存4レコードの事業所値は失われるため、デプロイ後に手で入れ直す（#7=慈誠会前野病院、
#5/#6=メロディハウス、#3=未設定）。

FunBase 側の読み取り（`case-mirror.ts` / `case-hub.ts`）:

- `office_details` の各行から `office_name_disp` を取り出す
- 行ごとに `tenant_offices.name` へ名寄せ（既存の正規化 `trim().toLocaleLowerCase('ja-JP')` を流用）
- 解決できた事業所を `case_offices` に配列順の `sort_order` で upsert
- **名寄せできない行はスキップして警告ログ**。全滅（0件）の場合のみ、従来どおり
  `skipped: 'office_not_resolved'` で案件ごとスキップ（案件は最低1事業所が必要なため）

### パートC: テンプレDL

- 原本を `lib/portal/templates/application-workbook.xlsx` に同梱
  （`public/` はURL直叩きで誰でも取得できるためサーバ専用ディレクトリに置く）
- 純関数 `fillOfficeNames(workbook, names)`: `はじめに!C29`〜`C33` に最大5件を順に書き込む
- `GET /api/applications/[caseId]/template`:
  案件アクセス確認 → 原本読み込み → 事業所名書き込み → `.xlsx` を返す
- ファイル名: `{案件名}_申請書類作成フォーム_{YYYYMMDD}.xlsx`（既存 `buildDriveFileName` と同じ規則）
- 6件目以降は書き込めない。上位5件のみ埋め、UI に「5事業所まで自動入力。残りは手入力」と表示
- 事業所0件なら空欄のまま返す
- UI: 案件詳細のチェックリストで `application_workbook` 行に「テンプレDL」ボタンを追加

## テスト

既存の `__tests__/portal-*.test.ts` と同じ形で純関数を vitest で押さえる。

- `office_details` サブテーブル → 事業所素材配列のパース（空行 / 欠損 / 重複 / 非配列）
- `fillOfficeNames`（0件 / 3件 / 5件 / 6件以上 / 既存値の上書き）
- 名寄せの部分スキップ（3件中1件だけ解決できないケース）

## 非スコープ

- 労働保険番号・雇用保険適用事業所番号のテンプレ自動入力（app36 に実在するが今回は入れない）
- 事業所ごとの必要書類チェックリスト分割（カタログが全て法人単位のため不要）
- 案件作成UIからの複数事業所選択（今回は kintone 由来のミラーのみ）
