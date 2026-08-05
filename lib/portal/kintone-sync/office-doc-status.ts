import { REQUIREMENT_STATUS_LABELS } from '../types'
import type { RequirementStatus } from '../types'
import type { KintoneRecordPayload } from './types'

// 事業所書類（scope='office'）のステータスを app296 の固定フィールドで管理するための純粋ヘルパ。
// kintone を正とし、FunBase は提出契機の「確認中」書き込みと、OP 操作の受信反映だけを行う。
// 対象は法人・初回テンプレの7種。application_workbook は自動転記フローで扱うため対象外。

/** document_code → app296 のフィールドコード。ここに無い書類は同期対象外。 */
export const OFFICE_DOC_STATUS_FIELDS: Record<string, string> = {
  corp_registry: 'doc_status_corp_registry',
  resident_record_corp: 'doc_status_resident_record_corp',
  labor_insurance_cert: 'doc_status_labor_insurance_cert',
  corp_tax_cert_type3: 'doc_status_corp_tax_cert_type3',
  social_insurance_proof: 'doc_status_social_insurance_proof',
  corp_residence_tax_cert: 'doc_status_corp_residence_tax_cert',
  kyogikai_cert: 'doc_status_kyogikai_cert',
}

/** RequirementStatus → kintone ドロップダウンのラベル（画面表示と同一）。 */
export function requirementStatusToKintoneLabel(status: RequirementStatus): string {
  return REQUIREMENT_STATUS_LABELS[status]
}

/** kintone ラベル → RequirementStatus。空欄・未知ラベルは null（＝無視する）。 */
export function kintoneLabelToRequirementStatus(
  label: string
): RequirementStatus | null {
  const entry = Object.entries(REQUIREMENT_STATUS_LABELS).find(
    ([, value]) => value === label
  )
  return entry ? (entry[0] as RequirementStatus) : null
}

/** ステータス同期の対象となる要件1件（Supabase の case_document_requirements 由来）。 */
export interface OfficeDocRequirement {
  id: string
  documentCode: string
  status: RequirementStatus
}

/**
 * 要件配列 → app296 の doc_status_* payload。
 * マッピングに無い書類は無視する。絞り込み（1件だけ送る・未初期化だけ送る）は
 * 呼び出し側が requirements をフィルタして表現する。
 */
export function buildOfficeDocStatusPayload(
  requirements: OfficeDocRequirement[]
): KintoneRecordPayload {
  const payload: KintoneRecordPayload = {}
  for (const req of requirements) {
    const field = OFFICE_DOC_STATUS_FIELDS[req.documentCode]
    if (!field) {
      continue
    }
    payload[field] = { value: requirementStatusToKintoneLabel(req.status) }
  }
  return payload
}

/** kintone レコードから読み取ったステータス1件。 */
export interface OfficeDocStatusEntry {
  documentCode: string
  status: RequirementStatus
}

/** レコードの doc_status_* フィールドの生ラベルを取り出す（未設定は null）。 */
function readLabel(
  record: Record<string, { value: unknown } | undefined>,
  field: string
): string | null {
  const v = record[field]?.value
  if (v === undefined || v === null || v === '') {
    return null
  }
  return String(v)
}

/**
 * Webhook の record → FunBase に反映すべきステータス一覧。
 * 空欄（＝その案件では未使用/未初期化）と未知ラベルは除外する。
 */
export function extractOfficeDocStatuses(
  record: Record<string, { value: unknown } | undefined>
): OfficeDocStatusEntry[] {
  const out: OfficeDocStatusEntry[] = []
  for (const [documentCode, field] of Object.entries(OFFICE_DOC_STATUS_FIELDS)) {
    const label = readLabel(record, field)
    if (label === null) {
      continue
    }
    const status = kintoneLabelToRequirementStatus(label)
    if (!status) {
      continue
    }
    out.push({ documentCode, status })
  }
  return out
}

/**
 * 値が入っている書類コード一覧（初期化のスキップ判定用）。
 * 未知ラベルも「入力済み」として扱い、OP の入力を上書きしない。
 */
export function listFilledOfficeDocCodes(
  record: Record<string, { value: unknown } | undefined>
): string[] {
  return Object.entries(OFFICE_DOC_STATUS_FIELDS)
    .filter(([, field]) => readLabel(record, field) !== null)
    .map(([documentCode]) => documentCode)
}

/** Supabase を更新すべき要件（差分のみ）。 */
export interface OfficeDocStatusUpdate {
  id: string
  status: RequirementStatus
}

/**
 * kintone の現状 × FunBase の要件 → 更新すべき要件だけ返す。
 * 値が一致する書類は返さないため、FunBase 起因の書き込みで返ってくる Webhook は no-op になる。
 */
export function diffOfficeDocStatuses(
  kintoneStatuses: OfficeDocStatusEntry[],
  requirements: OfficeDocRequirement[]
): OfficeDocStatusUpdate[] {
  const byCode = new Map(requirements.map((r) => [r.documentCode, r]))
  const updates: OfficeDocStatusUpdate[] = []
  for (const entry of kintoneStatuses) {
    const req = byCode.get(entry.documentCode)
    if (!req || req.status === entry.status) {
      continue
    }
    updates.push({ id: req.id, status: entry.status })
  }
  return updates
}
