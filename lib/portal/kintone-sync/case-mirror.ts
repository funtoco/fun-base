import { getServiceClient } from '../storage'
import type { KintoneWebhookEvent } from './webhook'

// kintone「就労_ビザ案件管理」(app296) → FunBase visa_application_cases のミラー。
// Webhook 受信（service-role・RLSバイパス）で app296 レコードを案件行へ upsert する。
//
// クロスウォーク（案件INSERTのjoinキー）:
//  - 法人 COID(company_ref) → connector_app_filters(field_code='COID', filter_value=COID)
//      → connectors.tenant_id
//  - 事業所 (office_name_disp) → 同一 tenant 内の tenant_offices.name と完全一致 → tenant_office_id
//  - 申請人 HRID(applicant_ref) → people.external_id（同一 tenant）→ people.id（案件メンバー）

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
  hrid: string | null
  app55RecordId: string | null
}

function fieldStr(record: Record<string, FieldValue>, code: string): string | null {
  const v = record[code]?.value
  if (v === undefined || v === null || v === '') {
    return null
  }
  return String(v)
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
    hrid: fieldStr(r, 'applicant_ref'),
    app55RecordId: fieldStr(r, 'koyou_ref'),
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
  const { data: filters } = await service
    .from('connector_app_filters')
    .select('connector_id')
    .eq('field_code', 'COID')
    .eq('filter_value', coid)
    .limit(1)
  const connectorId = (filters as { connector_id: string }[] | null)?.[0]?.connector_id
  if (!connectorId) {
    return null
  }
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
  const { data } = await service
    .from('tenant_offices')
    .select('id')
    .eq('tenant_id', tenantId)
    .eq('name', officeName)
    .limit(1)
  return (data as { id: string }[] | null)?.[0]?.id ?? null
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
  const { data } = await service
    .from('people')
    .select('id')
    .eq('tenant_id', tenantId)
    .eq('external_id', hrid)
    .limit(1)
  return (data as { id: string }[] | null)?.[0]?.id ?? null
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
    return { caseId: null, created: false, skipped: 'tenant_not_resolved' }
  }
  const tenantOfficeId = await resolveTenantOfficeByName(
    service,
    tenantId,
    mapped.officeName
  )
  if (!tenantOfficeId) {
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

  // 申請人メンバー（重複回避で upsert）。
  const personId = await resolvePersonByHrid(service, tenantId, mapped.hrid)
  if (personId) {
    const { data: member } = await service
      .from('visa_application_case_members')
      .select('id')
      .eq('case_id', caseId)
      .eq('person_id', personId)
      .maybeSingle()
    if (!member) {
      await service
        .from('visa_application_case_members')
        .insert({ case_id: caseId, person_id: personId })
    }
  }

  // 新規時は必要書類を materialize（ベストエフォート・失敗しても案件は成立）。
  if (created) {
    try {
      await service.rpc('materialize_case_requirements', { p_case_id: caseId })
    } catch (materializeError) {
      console.error('materialize_case_requirements failed:', materializeError)
    }
  }

  return { caseId, created }
}
