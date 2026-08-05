# 事業所書類のステータスを kintone で管理する（app296 固定フィールド方式）

作成日: 2026-08-05
関連: [docs/visa-case-management-design.md](../../visa-case-management-design.md)（Phase 1〜6 の全体設計）

## 1. 背景と目的

FunBase の申請ポータル（`/applications/[caseId]`）は、案件ごとの必要書類チェックリストを表示する。
現状、書類1件ごとのステータス（`case_document_requirements.status`）は Supabase にしか存在せず、
kintone からは見えない。さらに `approved` / `needs_fix` へ遷移させる導線がどこにも無いため、
企業がアップロードすると `reviewing`（確認中）になったきり止まる。

kintone と同期しているのは案件全体のステータス（app296 のプロセス管理6段階）だけである。

**目的**: 事業所書類7種のステータスを kintone app296 で管理し、OP が kintone 上で
「承認済み / 要修正」を操作できるようにする。kintone を正とする。

## 2. スコープ

### 対象（7書類・すべて `scope = 'office'`）

| document_code | 書類名 |
|---|---|
| `corp_registry` | 履歴事項全部証明書 |
| `resident_record_corp` | 住民票（本籍地記載あり・マイナンバー記載無） |
| `labor_insurance_cert` | 労働保険料等納付証明書 |
| `corp_tax_cert_type3` | 納税証明書（その3） |
| `social_insurance_proof` | 社会保険料納入状況照会回答票 または 保険料領収証書 |
| `corp_residence_tax_cert` | 法人住民税納税証明書 |
| `kyogikai_cert` | 特定技能協議会加入証明書 |

これは「法人・初回」テンプレの内訳である
（[20260724150000_portal_real_document_catalog.sql](../../../supabase/migrations/20260724150000_portal_real_document_catalog.sql) の 4-1）。

### 対象外

- `application_workbook`（申請書類作成フォーム Excel）: 既存の自動転記フローで扱うため、ステータス管理の対象外
- 人材（`scope = 'person'`）の書類
- 個人事業主向け6種・更新向け `prev_documents`・外食/宿泊のみの `business_license`
  （カタログには存在するが今回はフィールドを作らない。将来必要になれば同じ方式でフィールドを追加する）

### 設計判断とトレードオフ

固定フィールド方式（1書類 = 1ドロップダウン）を採る。サブテーブル方式・別アプリ方式に比べて
実装が最小になる代わりに、**必要書類マスタが変わるたびに kintone アプリのフィールド追加と
コード側マッピング表の更新が必要**になる。この運用コストは受容する。

## 3. kintone app296 に追加するフィールド

7本すべて DROP_DOWN。フィールドコードは `doc_status_` ＋ `document_code`。

| フィールドコード | フィールド名 |
|---|---|
| `doc_status_corp_registry` | 履歴事項全部証明書 |
| `doc_status_resident_record_corp` | 住民票 |
| `doc_status_labor_insurance_cert` | 労働保険料等納付証明書 |
| `doc_status_corp_tax_cert_type3` | 納税証明書（その3） |
| `doc_status_social_insurance_proof` | 社会保険料納入状況照会回答票 |
| `doc_status_corp_residence_tax_cert` | 法人住民税納税証明書 |
| `doc_status_kyogikai_cert` | 特定技能協議会加入証明書 |

- 選択肢: `未提出` / `確認中` / `承認済み` / `要修正`（`REQUIREMENT_STATUS_LABELS` と完全一致）
- 初期値: なし（空欄）
- **空欄 = その案件では未使用、または未初期化**。同期対象外として扱う。
  個人事業主案件・更新案件ではこの7本が空のままになる。
- 要修正の理由フィールドは作らない。差し戻し理由は実装済みのコメント双方向連携（Phase 6）で伝える。

これらは kintone アプリ側の手作業（フィールド追加）が前提であり、GO-LIVE 前の外部作業として扱う。

## 4. データフロー

### 4.1 初期化（FunBase → kintone）

案件 Webhook（`ADD_RECORD` / `UPDATE_RECORD`）で `mirrorCaseFromKintone` が案件を upsert し
必要書類を materialize したあと、**kintone 側が空欄の書類だけ** FunBase の現ステータスを書き込む
（通常は「未提出」）。値が入っているフィールドは kintone が正なので触らない。

初期化書き込みは kintone 側で `UPDATE_RECORD` Webhook を発火させるが、2周目は空欄が無くなるため
書き込みが発生せず停止する。

### 4.2 提出（FunBase → kintone）

企業が書類をアップロードすると、既存どおり `linkAndSubmit` が `status = 'reviewing'` にする。
そのあと同じ API ルート（Drive ミラーの隣）で、該当書類のフィールドを **「確認中」に更新**する。
承認済みだった書類を差し替えた場合も「確認中」に戻る。

### 4.3 OP 操作（kintone → FunBase）

OP が kintone でフィールドを「承認済み / 要修正」に変更 → `UPDATE_RECORD` Webhook →
7フィールドを読み、`case_document_requirements.status` に**差分だけ**反映する。
併せて `case_document_events` に監査行を追加する。

### 4.4 ループ防止

- 受信側（4.3）は Supabase 更新のみで kintone へ書き返さない（既存 `applyKintoneStatusToCase` と同方針）
- 送信側（4.1 / 4.2）の更新で返ってくる Webhook は値が一致するため差分ゼロ＝ no-op

## 5. モジュール構成

### 5.1 `lib/portal/kintone-sync/office-doc-status.ts`（新規・純粋関数のみ）

| 関数 / 定数 | 責務 |
|---|---|
| `OFFICE_DOC_STATUS_FIELDS` | `document_code` → kintone フィールドコードの表（7件） |
| `requirementStatusToKintoneLabel(status)` | `RequirementStatus` → 日本語ラベル |
| `kintoneLabelToRequirementStatus(label)` | 日本語ラベル → `RequirementStatus`（未知は `null`） |
| `buildOfficeDocStatusPayload(requirements, options)` | 要件配列 → `KintoneRecordPayload`。`onlyMissing` 指定時は既存値のあるフィールドを除外 |
| `extractOfficeDocStatuses(record)` | Webhook record → `{ documentCode, status }[]`（空欄・未知ラベルは除外） |
| `diffOfficeDocStatuses(kintoneStatuses, requirements)` | kintone 値と FunBase 要件を突き合わせ、更新すべき要件だけ返す |

外部 I/O を持たないため、すべてユニットテストで固める。

### 5.2 `lib/portal/kintone-sync/office-doc-sync.ts`（新規・DB orchestration）

| 関数 | 責務 |
|---|---|
| `pushOfficeDocStatuses({ caseId, kintoneCaseId, client, onlyMissing, documentCodes })` | Supabase から office 要件を読み、payload を作って `client.updateRecord`。`documentCodes` 指定時はその書類だけ送る（提出時は1件） |
| `applyKintoneOfficeDocStatuses({ caseId, record })` | Webhook record から差分を求め、Supabase を更新＋イベント記録 |

いずれも best-effort。`client` が `null`（API トークン未設定）、`kintoneCaseId` が `null`（案件未紐付け）
なら skip を返す。例外は握って `{ status: 'error' }` を返し、throw しない。

### 5.3 結線

| 場所 | 追加する処理 |
|---|---|
| [app/api/kintone/webhook/route.ts](../../../app/api/kintone/webhook/route.ts) | `ADD_RECORD` / `UPDATE_RECORD` で `mirrorCaseFromKintone` の後に `applyKintoneOfficeDocStatuses` → `pushOfficeDocStatuses({ onlyMissing: true })` |
| [app/api/applications/[caseId]/requirements/[requirementId]/documents/route.ts](../../../app/api/applications/%5BcaseId%5D/requirements/%5BrequirementId%5D/documents/route.ts) | Drive ミラーの隣で `pushOfficeDocStatuses({ documentCodes: [提出された書類のコード] })` |

`case-mirror.ts` には手を入れない（案件ミラーの責務に書類ステータスを混ぜない）。

## 6. FunBase 画面への影響

[components/portal/checklist-table.tsx](../../../components/portal/checklist-table.tsx) が既に `status` を
表示しているため、UI 変更は不要。kintone で「承認済み」にすると `canUpload` が `false` になり
再アップロードがロックされ、「要修正」にすると差し戻し表示になる。

## 7. エラー処理

| 状況 | 挙動 |
|---|---|
| 案件が app296 と未紐付け（`kintone_record_id` が `null`） | skip |
| kintone API トークン未設定 | skip |
| kintone 側フィールド未作成 | kintone API がエラーを返す → ログのみ、提出は成功 |
| kintone に未知のラベルが入っている | その書類だけ無視 |
| 対象書類がその案件の要件に無い | その書類だけ無視 |

提出フロー（アップロード）は、この同期が失敗しても必ず成功として返す。

## 8. テスト

- 純粋関数（5.1）をユニットテストで網羅する
  - ラベル双方向マッピング（未知ラベル含む）
  - `buildOfficeDocStatusPayload` の `onlyMissing` 挙動
  - `extractOfficeDocStatuses` の空欄・未知ラベル除外
  - `diffOfficeDocStatuses` の差分抽出（変化なし＝空配列）
- DB orchestration（5.2）は既存の Supabase 系関数と同様ユニット対象外とし、ライブ疎通で検証する

## 9. 外部作業（実装と別に必要）

1. kintone app296 に7本のドロップダウンフィールドを追加（フィールドコードは §3 のとおり）
2. kintone API トークンに app296 のレコード編集権限があることを確認
