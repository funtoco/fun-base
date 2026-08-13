import { getServiceClient } from '../storage'
import type { KintoneWebhookEvent } from './webhook'

// kintone「就労_ビザ案件管理」(app296) → FunBase visa_application_cases のミラー。
// Webhook 受信（service-role・RLSバイパス）で app296 レコードを案件行へ upsert する。
//
// クロスウォーク（案件INSERTのjoinキー）:
//  - 法人 COID(company_ref) → connector_app_filters(field_code='COID', filter_value=COID)
//      → connectors.tenant_id
//  - 事業所 (office_name_disp) → 同一 tenant 内の tenant_offices.name と完全一致 → tenant_office_id
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
  officeName: string | null
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
    officeName: fieldStr(r, 'office_name_disp'),
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

/** 事業所名 → tenant_office_id（同一 tenant 内で完全一致名寄せ）。未解決は null。 */
export async function resolveTenantOfficeByName(
  service: ServiceClient,
  tenantId: string,
  officeName: string | null
): Promise<string | null> {
  if (!officeName) {
    return null
  }
  // DB は UNIQUE(tenant_id, lower(name))、コードベースの正準キーは name.trim().toLocaleLowerCase('ja-JP')。
  // 完全一致(eq)だと大小文字・空白のドリフトで案件がサイレント欠落するため、正規化して照合する。
  const normalize = (s: string) => s.trim().toLocaleLowerCase('ja-JP')
  const target = normalize(officeName)
  const { data } = await service
    .from('tenant_offices')
    .select('id, name')
    .eq('tenant_id', tenantId)
  const rows = (data as { id: string; name: string }[] | null) ?? []
  const match = rows.find((r) => normalize(r.name) === target)
  return match?.id ?? null
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
  const tenantOfficeId = await resolveTenantOfficeByName(
    service,
    tenantId,
    mapped.officeName
  )
  if (!tenantOfficeId) {
    // 事業所名が FunBase の tenant_offices と一致しない。OP が正しい名前を選べるよう候補を出す。
    const { data: offices } = await service
      .from('tenant_offices')
      .select('name')
      .eq('tenant_id', tenantId)
      .eq('is_active', true)
    const names = ((offices as { name: string }[] | null) ?? []).map((o) => o.name)
    console.warn(
      `[case-mirror] skipped=office_not_resolved kintoneRecord=${mapped.kintoneRecordId} ` +
        `tenant=${tenantId} officeName=${JSON.stringify(mapped.officeName)} ` +
        `／FunBaseにあるこの法人の事業所名: ${JSON.stringify(names)}`
    )
    return { caseId: null, created: false, skipped: 'office_not_resolved' }
  }

  // 案件行（status は DB 既定 'draft'／Phase5 の UPDATE_STATUS で更新するためここでは触らない）。
  const row = {
    tenant_id: tenantId,
    tenant_office_id: tenantOfficeId,
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
    // tenant_id/tenant_office_id は NOT NULL＋複合FK(case_id,tenant_id,tenant_office_id)。
    // service-role でも列制約はバイパスされないため、案件と同一の値を必ず渡す。
    const { error: memberError } = await service
      .from('visa_application_case_members')
      .insert({
        case_id: caseId,
        tenant_id: tenantId,
        tenant_office_id: tenantOfficeId,
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
