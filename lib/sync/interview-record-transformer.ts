import type { KintoneRecord } from '@/lib/kintone/api-client'

export const DEFAULT_EXTERNAL_CONFIRMATION_STATUS = '確認待ち'
export const IMPORTABLE_INTERVIEW_STATUS = '完了'
export const KINTONE_INTERVIEW_SOURCE_SYSTEM = 'kintone'

type RecordType = 'regular_interview' | 'daily_support'

export interface InterviewRecordTransformContext {
  tenantId: string
  personId: string
  sourceAppId: string
}

export interface ActivityEntry {
  dai: string
  chu: string
  shou: string
  notes?: string
}

export interface InterviewRecordPayload {
  tenant_id: string
  person_id: string
  source_person_id: string | null
  source_system: typeof KINTONE_INTERVIEW_SOURCE_SYSTEM
  source_app_id: string
  source_record_id: string
  record_type: RecordType
  source_status: string
  interview_date: string
  start_time: string | null
  end_time: string | null
  target_quarter: string | null
  interview_method: string | null
  interview_place: string | null
  interview_duration_minutes: number | null
  company_id: string | null
  company_name: string | null
  support_staff_name: string | null
  sales_staff_name: string | null
  internal_staff_name: string | null
  external_report_body: string | null
  activity_entries: ActivityEntry[]
  internal_notes: string | null
  external_confirmation_status: typeof DEFAULT_EXTERNAL_CONFIRMATION_STATUS
  confirmation_due_at: string | null
  raw_record_json: Record<string, unknown>
}

function fieldValue(record: Record<string, any>, fieldCode: string): any {
  if (fieldCode === '$id') return record.$id?.value
  if (fieldCode === '$revision') return record.$revision?.value
  return record[fieldCode]?.value
}

function toStringOrNull(value: any): string | null {
  if (value === undefined || value === null) return null

  if (Array.isArray(value)) {
    const joined = value
      .map((item) => {
        if (item && typeof item === 'object') {
          return item.name ?? item.code ?? item.value
        }
        return item
      })
      .filter((item) => item !== undefined && item !== null && String(item).trim() !== '')
      .map(String)
      .join(', ')

    return joined || null
  }

  if (typeof value === 'object') {
    const label = value.name ?? value.code ?? value.value
    return label === undefined || label === null || String(label).trim() === '' ? null : String(label)
  }

  const text = String(value).trim()
  return text || null
}

function toNumberOrNull(value: any): number | null {
  if (value === undefined || value === null || value === '') return null
  const parsed = Number(value)
  return Number.isFinite(parsed) ? parsed : null
}

function toDateOrNull(value: any): string | null {
  const text = toStringOrNull(value)
  if (!text) return null
  return text.slice(0, 10)
}

function normalizeRecordType(value: any): RecordType | null {
  const text = toStringOrNull(value)
  if (text === '定期面談') return 'regular_interview'
  if (text === '日々の面談') return 'daily_support'
  return null
}

function hasCompletedStatusFilter(query: string): boolean {
  return /\bStatus\s*=\s*"完了"/.test(query)
}

export function buildInterviewRecordsQuery(baseQuery = ''): string {
  const trimmed = baseQuery.trim()
  const statusFilter = 'Status = "完了"'

  if (!trimmed) return statusFilter
  if (hasCompletedStatusFilter(trimmed)) return trimmed

  return `${trimmed} and ${statusFilter}`
}

export function isImportableInterviewRecord(record: KintoneRecord): boolean {
  return (
    toStringOrNull(fieldValue(record, 'Status')) === IMPORTABLE_INTERVIEW_STATUS &&
    normalizeRecordType(fieldValue(record, 'interview')) !== null
  )
}

export function getInterviewRecordSourcePersonId(record: KintoneRecord): string | null {
  return toStringOrNull(fieldValue(record, 'HRID'))
}

export function getInterviewRecordSourceRecordId(record: KintoneRecord): string | null {
  return toStringOrNull(fieldValue(record, '$id'))
}

function pickSubtableValue(row: Record<string, any>, fieldCodes: string[]): any {
  for (const fieldCode of fieldCodes) {
    if (row[fieldCode]?.value !== undefined) {
      return row[fieldCode].value
    }
  }
  return undefined
}

export function parseActivityEntries(tableStorageDaily: any): ActivityEntry[] {
  const rows = Array.isArray(tableStorageDaily?.value) ? tableStorageDaily.value : []

  return rows
    .map((row: any) => {
      const values = row?.value || {}
      const dai = toStringOrNull(pickSubtableValue(values, ['dai', '大分類']))
      const chu = toStringOrNull(pickSubtableValue(values, ['chu', '中分類']))
      const shou = toStringOrNull(pickSubtableValue(values, ['shou', '小分類']))
      const notes = toStringOrNull(pickSubtableValue(values, ['notes', 'note', '備考', '対応内容']))

      if (!dai && !chu && !shou && !notes) return null

      return {
        dai: dai || '',
        chu: chu || '',
        shou: shou || '',
        ...(notes ? { notes } : {}),
      }
    })
    .filter((entry): entry is ActivityEntry => entry !== null)
}

function toRawRecordJson(record: KintoneRecord): Record<string, unknown> {
  return JSON.parse(JSON.stringify(record)) as Record<string, unknown>
}

export function transformInterviewRecord(
  record: KintoneRecord,
  context: InterviewRecordTransformContext
): InterviewRecordPayload {
  if (!isImportableInterviewRecord(record)) {
    throw new Error('Interview record is not importable')
  }

  const recordType = normalizeRecordType(fieldValue(record, 'interview'))
  const interviewDate = toDateOrNull(fieldValue(record, 'interviewDate'))
  const sourceRecordId = toStringOrNull(fieldValue(record, '$id'))

  if (!recordType) {
    throw new Error('Unsupported interview record type')
  }
  if (!interviewDate) {
    throw new Error('Missing interviewDate')
  }
  if (!sourceRecordId) {
    throw new Error('Missing Kintone record id')
  }

  return {
    tenant_id: context.tenantId,
    person_id: context.personId,
    source_person_id: toStringOrNull(fieldValue(record, 'HRID')),
    source_system: KINTONE_INTERVIEW_SOURCE_SYSTEM,
    source_app_id: context.sourceAppId,
    source_record_id: sourceRecordId,
    record_type: recordType,
    source_status: toStringOrNull(fieldValue(record, 'Status')) || IMPORTABLE_INTERVIEW_STATUS,
    interview_date: interviewDate,
    start_time: toStringOrNull(fieldValue(record, 'Time')),
    end_time: toStringOrNull(fieldValue(record, 'Time_0')),
    target_quarter: toStringOrNull(fieldValue(record, 'targetQuarter')),
    interview_method: toStringOrNull(fieldValue(record, 'interviewMethod')),
    interview_place: toStringOrNull(fieldValue(record, 'interviewPlace')),
    interview_duration_minutes: toNumberOrNull(fieldValue(record, 'timeInterview')),
    company_id: toStringOrNull(fieldValue(record, 'COID')),
    company_name: toStringOrNull(fieldValue(record, 'companyName')),
    support_staff_name: toStringOrNull(fieldValue(record, 'supportName')),
    sales_staff_name: toStringOrNull(fieldValue(record, 'salesName')),
    internal_staff_name: toStringOrNull(fieldValue(record, 'funtocoStaff')),
    external_report_body: toStringOrNull(fieldValue(record, '企業提出用レポート')),
    activity_entries: recordType === 'daily_support' ? parseActivityEntries(record.tableStorageDaily) : [],
    internal_notes: toStringOrNull(fieldValue(record, 'interviewContent')) || toStringOrNull(fieldValue(record, 'memo')),
    external_confirmation_status: DEFAULT_EXTERNAL_CONFIRMATION_STATUS,
    confirmation_due_at: toStringOrNull(fieldValue(record, '確認期限')),
    raw_record_json: toRawRecordJson(record),
  }
}
