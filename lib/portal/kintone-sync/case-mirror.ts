import { getServiceClient } from '../storage'
import type { KintoneWebhookEvent } from './webhook'

// kintone「就労_ビザ案件管理」(app296) → FunBase visa_application_cases のミラー。
// Webhook 受信（service-role・RLSバイパス）で app296 レコードを案件行へ upsert する。
//
// クロスウォーク（案件INSERTのjoinキー）:
//  - 法人 COID(company_ref) → connector_app_filters(field_code='COID', filter_value=COID)
//      → connectors.tenant_id
//  - 事業所 (office_details[].office_name_disp) → 同一 tenant 内の tenant_offices.name と
//      完全一致（正規化後）→ visa_application_case_offices（複数可・配列順が sort_order）
//  - 申請人 HRID(koyou_details[].koyou_hrid) → people.external_id（同一 tenant）→ people.id
//      （雇用条件書サブテーブルの各行＝複数人分の案件メンバー）

type ServiceClient = ReturnType<typeof getServiceClient>

type FieldValue = { value: unknown } | undefined

/** 分野ラベル → visa_application_cases.field。 */
const BUNYA_TO_FIELD: Record<
  string,
  'care' | 'food_service' | 'accommodation' | 'food_manufacturing' | 'other'
> = {
  介護: 'care',
  外食: 'food_service',
  宿泊: 'accommodation',
  飲食料品製造: 'food_manufacturing',
  その他: 'other',
}

/** 雇用条件書サブテーブル(koyou_details)1行から抽出した申請人素材。 */
export interface KoyouMemberSource {
  /** koyou_hrid（申請人HRID・人材マスタ照合キー）。 */
  hrid: string | null
  /** koyou_applicant_disp（申請人氏名の表示用コピー）。 */
  applicantName: string | null
  /** koyou_ref（app55 雇用条件書 レコード番号）。 */
  app55RecordId: string | null
}

/** app296 レコード（Webhook payload）から案件行の素材を取り出す（純粋）。 */
export interface MappedCaseRow {
  kintoneRecordId: string
  title: string | null
  applicationCategory: 'initial' | 'renewal'
  field: 'care' | 'food_service' | 'accommodation' | 'food_manufacturing' | 'other'
  entityType: 'corporate' | 'sole_proprietor'
  driveFolderUrl: string | null
  /** crosswalk 素材 */
  coid: string | null
  /** 事業所サブテーブル(office_details)の各行の事業所名（配列順＝表示順）。 */
  officeNames: string[]
  /** 雇用条件書サブテーブルの各行（複数人分の申請人素材）。 */
  koyouTargets: KoyouMemberSource[]
}

function fieldStr(record: Record<string, FieldValue>, code: string): string | null {
  const v = record[code]?.value
  if (v === undefined || v === null || v === '') {
    return null
  }
  return String(v)
}

/** SUBTABLE の1行（`{ id?, value: { subCode: { value } } }`）。 */
type SubtableRow = { id?: string; value: Record<string, FieldValue> }

/**
 * office_details サブテーブル → 事業所名の配列（配列順を保つ）。
 * 空行は無視し、同一名の重複行は先勝ちで1つに畳む（kintone 側の入力ミス吸収）。
 */
function readOfficeNames(r: Record<string, FieldValue>): string[] {
  const raw = r['office_details']?.value
  if (!Array.isArray(raw)) {
    return []
  }
  const out: string[] = []
  const seen = new Set<string>()
  for (const row of raw as SubtableRow[]) {
    const v = row.value?.['office_name_disp']?.value
    if (v === undefined || v === null || v === '') {
      continue
    }
    const name = String(v).trim()
    if (!name) {
      continue
    }
    const key = name.toLocaleLowerCase('ja-JP')
    if (seen.has(key)) {
      continue
    }
    seen.add(key)
    out.push(name)
  }
  return out
}

/** koyou_details サブテーブル → 申請人素材の配列（koyou_ref/koyou_hrid が両方無い行は無視）。 */
function readKoyouTargets(r: Record<string, FieldValue>): KoyouMemberSource[] {
  const raw = r['koyou_details']?.value
  if (!Array.isArray(raw)) {
    return []
  }
  const out: KoyouMemberSource[] = []
  for (const row of raw as SubtableRow[]) {
    const cell = (code: string): string | null => {
      const v = row.value?.[code]?.value
      if (v === undefined || v === null || v === '') {
        return null
      }
      return String(v)
    }
    const target: KoyouMemberSource = {
      hrid: cell('koyou_hrid'),
      applicantName: cell('koyou_applicant_disp'),
      app55RecordId: cell('koyou_ref'),
    }
    // 空行（両キー無し）はスキップ。
    if (!target.hrid && !target.app55RecordId) {
      continue
    }
    out.push(target)
  }
  return out
}

/**
 * app296 レコード → 案件行素材。
 * ※簡略化（要件 §10）: entity_type は app296 に区分が無いため 'corporate' 既定、
 *   apply_type 新規→initial / 変更→renewal（それ以外は initial）。
 */
export function mapKintoneRecordToCaseRow(event: KintoneWebhookEvent): MappedCaseRow {
  const r = event.record
  const applyType = fieldStr(r, 'apply_type')
  const bunya = fieldStr(r, 'bunya')
  return {
    kintoneRecordId: event.recordId,
    title: fieldStr(r, 'case_title'),
    applicationCategory: applyType === '変更' ? 'renewal' : 'initial',
    field: (bunya && BUNYA_TO_FIELD[bunya]) || 'other',
    entityType: 'corporate',
    driveFolderUrl: fieldStr(r, 'drive_folder_url'),
    coid: fieldStr(r, 'company_ref'),
    officeNames: readOfficeNames(r),
    koyouTargets: readKoyouTargets(r),
  }
}

/** COID → tenant_id（connector_app_filters 経由）。未解決は null。 */
export async function resolveTenantByCoid(
  service: ServiceClient,
  coid: string | null
): Promise<string | null> {
  if (!coid) {
    return null
  }
  // 有効(is_active)なフィルタのみ。ソフトデリートの残骸行や無効化コネクタを避ける。
  const { data: filters } = await service
    .from('connector_app_filters')
    .select('connector_id')
    .eq('field_code', 'COID')
    .eq('filter_value', coid)
    .eq('is_active', true)
    .limit(2)
  const rows = (filters as { connector_id: string }[] | null) ?? []
  // 複数の有効フィルタが別コネクタ(別テナント)を指す場合は曖昧として解決しない。
  const uniqueConnectors = Array.from(new Set(rows.map((r) => r.connector_id)))
  if (uniqueConnectors.length !== 1) {
    return null
  }
  const connectorId = uniqueConnectors[0]
  const { data: conn } = await service
    .from('connectors')
    .select('tenant_id')
    .eq('id', connectorId)
    .maybeSingle()
  return (conn as { tenant_id: string } | null)?.tenant_id ?? null
}

// DB は UNIQUE(tenant_id, lower(name))、コードベースの正準キーは name.trim().toLocaleLowerCase('ja-JP')。
// 完全一致(eq)だと大小文字・空白のドリフトで案件がサイレント欠落するため、正規化して照合する。
function normalizeOfficeName(s: string): string {
  return s.trim().toLocaleLowerCase('ja-JP')
}

/** 名寄せ結果。resolved は入力順を保つ（＝case_offices の sort_order）。 */
export interface OfficeResolution {
  resolved: string[]
  unresolvedNames: string[]
}

/**
 * 事業所名の配列 → tenant_office_id の配列（同一 tenant 内で正規化名寄せ）。
 * 解決できなかった名前は unresolvedNames に集める（呼び出し側で警告に使う）。
 */
export async function resolveTenantOfficesByNames(
  service: ServiceClient,
  tenantId: string,
  officeNames: string[]
): Promise<OfficeResolution> {
  if (officeNames.length === 0) {
    return { resolved: [], unresolvedNames: [] }
  }
  const { data } = await service
    .from('tenant_offices')
    .select('id, name')
    .eq('tenant_id', tenantId)
  const rows = (data as { id: string; name: string }[] | null) ?? []
  const idByName = new Map(rows.map((r) => [normalizeOfficeName(r.name), r.id]))

  const resolved: string[] = []
  const unresolvedNames: string[] = []
  const seenIds = new Set<string>()
  for (const name of officeNames) {
    const id = idByName.get(normalizeOfficeName(name))
    if (!id) {
      unresolvedNames.push(name)
      continue
    }
    // 別名が同一事業所に解決した場合の重複を防ぐ（uq_vaco 違反回避）。
    if (seenIds.has(id)) {
      continue
    }
    seenIds.add(id)
    resolved.push(id)
  }
  return { resolved, unresolvedNames }
}

/** HRID → people.id（同一 tenant の external_id 一致）。未解決は null。 */
export async function resolvePersonByHrid(
  service: ServiceClient,
  tenantId: string,
  hrid: string | null
): Promise<string | null> {
  if (!hrid) {
    return null
  }
  // external_id(=人材ID) は UNIQUE 撤去済みで同一 tenant 内に複数 people 行があり得る。
  // 任意の1件を選ぶと誤紐付けになるため、複数一致は曖昧としてスキップ（本流同期の ambiguous-person 慣行に合わせる）。
  const { data } = await service
    .from('people')
    .select('id')
    .eq('tenant_id', tenantId)
    .eq('external_id', hrid)
    .limit(2)
  const rows = (data as { id: string }[] | null) ?? []
  if (rows.length !== 1) {
    if (rows.length > 1) {
      console.warn(
        `resolvePersonByHrid: HRID ${hrid} が tenant ${tenantId} で複数一致（曖昧）→ メンバー付与をスキップ`
      )
    }
    return null
  }
  return rows[0].id
}

export interface MirrorResult {
  caseId: string | null
  created: boolean
  skipped?: string
}

/**
 * 案件の事業所を officeIds（配列順＝sort_order）に一致させる。
 * kintone から消えた事業所は削除する。ただし office 書類の格納先（代表事業所）を
 * 消すと既存書類が孤立するため、代表事業所だけは残す。
 */
async function syncCaseOffices(
  service: ServiceClient,
  params: { caseId: string; tenantId: string; officeIds: string[] }
): Promise<void> {
  const { caseId, tenantId, officeIds } = params

  const { data: existingRows } = await service
    .from('visa_application_case_offices')
    .select('id, tenant_office_id, sort_order')
    .eq('case_id', caseId)
    .order('sort_order', { ascending: true })
  const existing = (existingRows as
    | { id: string; tenant_office_id: string; sort_order: number }[]
    | null) ?? []
  const primaryOfficeId = existing[0]?.tenant_office_id ?? null

  const desired = new Set(officeIds)
  const existingByOffice = new Map(existing.map((r) => [r.tenant_office_id, r]))

  // 追加・並べ替え。sort_order は配列順で振り直す。
  for (const [index, officeId] of officeIds.entries()) {
    const current = existingByOffice.get(officeId)
    if (!current) {
      const { error } = await service.from('visa_application_case_offices').insert({
        case_id: caseId,
        tenant_id: tenantId,
        tenant_office_id: officeId,
        sort_order: index,
      })
      if (error) {
        // 事業所の欠落はテンプレDLとアクセス境界に直結するため握り潰さない。
        console.error('Error inserting case office:', error)
      }
      continue
    }
    if (current.sort_order !== index) {
      await service
        .from('visa_application_case_offices')
        .update({ sort_order: index })
        .eq('id', current.id)
    }
  }

  // kintone から消えた事業所を除去（代表事業所は書類の格納先なので残す）。
  for (const row of existing) {
    if (desired.has(row.tenant_office_id)) {
      continue
    }
    if (row.tenant_office_id === primaryOfficeId) {
      console.warn(
        `[case-mirror] 代表事業所 ${primaryOfficeId} が kintone の事業所一覧から外れましたが、` +
          `office書類の格納先のため case ${caseId} に残します。`
      )
      continue
    }
    await service.from('visa_application_case_offices').delete().eq('id', row.id)
  }
}

/**
 * app296 レコードを FunBase 案件へミラーする。
 * DELETE は案件を archived 化。ADD/UPDATE はクロスウォーク解決 → kintone_record_id で upsert →
 * 申請人メンバー付与 → 新規時は要件 materialize（ベストエフォート）。
 */
export async function mirrorCaseFromKintone(
  event: KintoneWebhookEvent
): Promise<MirrorResult> {
  const service = getServiceClient()
  const mapped = mapKintoneRecordToCaseRow(event)

  if (event.type === 'DELETE_RECORD') {
    await service
      .from('visa_application_cases')
      .update({ status: 'archived' })
      .eq('kintone_record_id', mapped.kintoneRecordId)
    return { caseId: null, created: false, skipped: 'deleted->archived' }
  }

  // クロスウォーク（tenant / office は案件 NOT NULL のため必須）。
  const tenantId = await resolveTenantByCoid(service, mapped.coid)
  if (!tenantId) {
    // 法人(COID)が FunBase のコネクタ/テナントに紐づいていない。
    console.warn(
      `[case-mirror] skipped=tenant_not_resolved kintoneRecord=${mapped.kintoneRecordId} ` +
        `COID=${mapped.coid ?? 'null'}（この法人はFunBaseにコネクタ/テナントが無い）`
    )
    return { caseId: null, created: false, skipped: 'tenant_not_resolved' }
  }
  // 事業所は複数可。名寄せできた分だけ採用し、できなかった名前は警告に出す。
  const { resolved: officeIds, unresolvedNames } = await resolveTenantOfficesByNames(
    service,
    tenantId,
    mapped.officeNames
  )
  if (unresolvedNames.length > 0) {
    // 事業所名が FunBase の tenant_offices と一致しない。OP が正しい名前を選べるよう候補を出す。
    const { data: offices } = await service
      .from('tenant_offices')
      .select('name')
      .eq('tenant_id', tenantId)
      .eq('is_active', true)
    const names = ((offices as { name: string }[] | null) ?? []).map((o) => o.name)
    console.warn(
      `[case-mirror] office_not_resolved kintoneRecord=${mapped.kintoneRecordId} ` +
        `tenant=${tenantId} 未解決の事業所名=${JSON.stringify(unresolvedNames)} ` +
        `／FunBaseにあるこの法人の事業所名: ${JSON.stringify(names)}`
    )
  }
  if (officeIds.length === 0) {
    // 1件も解決できない案件は RLS 上だれにも見えないため作らない（fail-closed）。
    console.warn(
      `[case-mirror] skipped=office_not_resolved kintoneRecord=${mapped.kintoneRecordId} ` +
        `tenant=${tenantId}（解決できた事業所が0件）`
    )
    return { caseId: null, created: false, skipped: 'office_not_resolved' }
  }

  // 案件行（status は DB 既定 'draft'／Phase5 の UPDATE_STATUS で更新するためここでは触らない）。
  const row = {
    tenant_id: tenantId,
    entity_type: mapped.entityType,
    application_category: mapped.applicationCategory,
    field: mapped.field,
    title: mapped.title,
    kintone_record_id: mapped.kintoneRecordId,
    kintone_sync_status: 'mirrored',
    kintone_last_synced_at: new Date().toISOString(),
  }

  const { data: existing } = await service
    .from('visa_application_cases')
    .select('id')
    .eq('kintone_record_id', mapped.kintoneRecordId)
    .maybeSingle()

  let caseId: string
  let created: boolean
  if (existing) {
    caseId = (existing as { id: string }).id
    await service.from('visa_application_cases').update(row).eq('id', caseId)
    created = false
  } else {
    const { data: inserted, error } = await service
      .from('visa_application_cases')
      .insert(row)
      .select('id')
      .single()
    if (error || !inserted) {
      throw new Error(`案件のミラー(INSERT)に失敗: ${error?.message ?? 'unknown'}`)
    }
    caseId = (inserted as { id: string }).id
    created = true
  }

  // 案件の事業所を kintone の内容に合わせる（配列順＝sort_order）。
  // kintone が発生源なので、そこから消えた事業所は FunBase 側からも外す。
  await syncCaseOffices(service, { caseId, tenantId, officeIds })

  // 申請人メンバー（雇用条件書サブテーブルの各人）。重複回避で upsert。
  // 同一 person が複数行に現れても1回だけ付与する（同一イベント内の重複を吸収）。
  const seenPersonIds = new Set<string>()
  let insertedMember = false
  for (const target of mapped.koyouTargets) {
    const personId = await resolvePersonByHrid(service, tenantId, target.hrid)
    if (!personId || seenPersonIds.has(personId)) {
      continue
    }
    seenPersonIds.add(personId)
    const { data: member } = await service
      .from('visa_application_case_members')
      .select('id')
      .eq('case_id', caseId)
      .eq('person_id', personId)
      .maybeSingle()
    if (member) {
      continue
    }
    // tenant_id は NOT NULL＋複合FK(case_id,tenant_id)。
    // service-role でも列制約はバイパスされないため、案件と同一の値を必ず渡す。
    const { error: memberError } = await service
      .from('visa_application_case_members')
      .insert({
        case_id: caseId,
        tenant_id: tenantId,
        person_id: personId,
      })
    if (memberError) {
      // メンバー付与失敗は person 系必要書類の materialize 欠落に直結するため握り潰さない。
      console.error('Error inserting case member:', memberError)
    } else {
      insertedMember = true
    }
  }

  // 必要書類を materialize（ベストエフォート・失敗しても案件は成立）。
  // 新規案件、または既存案件に新メンバーを追加した時（複数人を後から追加した UPDATE 等）に実行。
  // materialize_case_requirements は ON CONFLICT DO NOTHING で冪等なので、追加分の person 要件だけが増える。
  if (created || insertedMember) {
    try {
      await service.rpc('materialize_case_requirements', { p_case_id: caseId })
    } catch (materializeError) {
      console.error('materialize_case_requirements failed:', materializeError)
    }
  }

  return { caseId, created }
}
