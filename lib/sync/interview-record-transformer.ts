import type { KintoneRecord } from '@/lib/kintone/api-client'

export const DEFAULT_EXTERNAL_CONFIRMATION_STATUS = '確認待ち'
export const IMPORTABLE_INTERVIEW_STATUS = '完了'
export const KINTONE_INTERVIEW_SOURCE_SYSTEM = 'kintone'
const KINTONE_INTERVIEW_RECORD_TYPE_QUERY =
  'timeInterview in ("定期面談", "日々の面談")'

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

function labelValue(value: any): any {
  if (value && typeof value === 'object') {
    return value.name ?? value.code ?? value.value
  }

  return value
}

function nonEmptyStringOrNull(value: any): string | null {
  if (value === undefined || value === null) return null

  const text = String(value).trim()
  return text || null
}

function toStringOrNull(value: any): string | null {
  if (value === undefined || value === null) return null

  if (Array.isArray(value)) {
    const joined = value
      .map(labelValue)
      .map(nonEmptyStringOrNull)
      .filter((item): item is string => item !== null)
      .join(', ')

    return joined || null
  }

  return nonEmptyStringOrNull(labelValue(value))
}

function toMinutesOrNull(startTime: string | null, endTime: string | null): number | null {
  if (!startTime || !endTime) return null

  const startMatch = /^(\d{1,2}):(\d{2})$/.exec(startTime)
  const endMatch = /^(\d{1,2}):(\d{2})$/.exec(endTime)
  if (!startMatch || !endMatch) return null

  const startHour = Number(startMatch[1])
  const startMinute = Number(startMatch[2])
  const endHour = Number(endMatch[1])
  const endMinute = Number(endMatch[2])
  if (startHour > 23 || endHour > 23 || startMinute > 59 || endMinute > 59) {
    return null
  }

  const startMinutes = startHour * 60 + startMinute
  const endMinutes = endHour * 60 + endMinute
  const duration = endMinutes - startMinutes

  return duration >= 0 ? duration : null
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

function recordTypeValue(record: KintoneRecord): any {
  return toStringOrNull(fieldValue(record, 'timeInterview')) ?? fieldValue(record, 'interview')
}

function hasRecordTypeFilter(query: string): boolean {
  return (
    /\btimeInterview\s+in\s*\([^)]*"定期面談"[^)]*"日々の面談"[^)]*\)/.test(query) ||
    (/\btimeInterview\s*=\s*"定期面談"/.test(query) &&
      /\btimeInterview\s*=\s*"日々の面談"/.test(query))
  )
}

function parenthesizeQuery(query: string): string {
  return query.startsWith('(') && query.endsWith(')') ? query : `(${query})`
}

export function buildInterviewRecordsQuery(baseQuery = ''): string {
  const trimmed = baseQuery.trim()

  if (!trimmed) return KINTONE_INTERVIEW_RECORD_TYPE_QUERY
  if (hasRecordTypeFilter(trimmed)) return trimmed

  return `${parenthesizeQuery(trimmed)} and ${KINTONE_INTERVIEW_RECORD_TYPE_QUERY}`
}

export function isImportableInterviewRecord(record: KintoneRecord): boolean {
  const recordType = normalizeRecordType(recordTypeValue(record))
  if (recordType === 'regular_interview') {
    return toStringOrNull(fieldValue(record, 'Status')) === IMPORTABLE_INTERVIEW_STATUS
  }

  return recordType === 'daily_support'
}

export function getInterviewRecordSourceWorkId(record: KintoneRecord): string | null {
  return toStringOrNull(fieldValue(record, 'WOID'))
}

export function getInterviewRecordSourceHumanResourceId(record: KintoneRecord): string | null {
  return toStringOrNull(fieldValue(record, 'HRID'))
}

export function getInterviewRecordSourcePersonId(record: KintoneRecord): string | null {
  return getInterviewRecordSourceWorkId(record) ?? getInterviewRecordSourceHumanResourceId(record)
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
  const rawValue = tableStorageDaily?.value ?? tableStorageDaily

  if (typeof rawValue === 'string' && rawValue.trim()) {
    try {
      const parsed = JSON.parse(rawValue)
      if (Array.isArray(parsed)) {
        return parsed
          .map((row: any) => {
            const dai = toStringOrNull(row?.dai)
            const chu = toStringOrNull(row?.chu)
            const shou = toStringOrNull(row?.shou)
            const notes = toStringOrNull(row?.notes)

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
    } catch {
      return []
    }
  }

  const rows = Array.isArray(rawValue) ? rawValue : []

  return rows
    .map((row: any) => {
      const values = row?.value || {}
      const dai = toStringOrNull(pickSubtableValue(values, ['dai', 'tableStorageDaily_大項目', '大分類']))
      const chu = toStringOrNull(pickSubtableValue(values, ['chu', 'tableStorageDaily_中項目', '中分類']))
      const shou = toStringOrNull(pickSubtableValue(values, ['shou', 'tableStorageDaily_小項目', '小分類']))
      const notes = toStringOrNull(pickSubtableValue(values, ['notes', 'tableStorageDaily_内容', 'note', '備考', '対応内容']))

      if (!dai && !chu && !shou && !notes) return null

      return {
        dai: dai || '',
        chu: chu || '',
        shou: shou || '',
        ...(notes ? { notes } : {}),
      }
    })
    .filter((entry: ActivityEntry | null): entry is ActivityEntry => entry !== null)
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

  const recordType = normalizeRecordType(recordTypeValue(record))
  const interviewDate = toDateOrNull(fieldValue(record, 'interviewDate'))
  const sourceRecordId = toStringOrNull(fieldValue(record, '$id'))
  const startTime = toStringOrNull(fieldValue(record, 'Time'))
  const endTime = toStringOrNull(fieldValue(record, 'Time_0'))

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
    source_person_id: getInterviewRecordSourcePersonId(record),
    source_system: KINTONE_INTERVIEW_SOURCE_SYSTEM,
    source_app_id: context.sourceAppId,
    source_record_id: sourceRecordId,
    record_type: recordType,
    source_status: toStringOrNull(fieldValue(record, 'Status')) || IMPORTABLE_INTERVIEW_STATUS,
    interview_date: interviewDate,
    start_time: startTime,
    end_time: endTime,
    target_quarter: toStringOrNull(fieldValue(record, 'targetQuarter')),
    interview_method: toStringOrNull(fieldValue(record, 'interviewMethod')),
    interview_place: toStringOrNull(fieldValue(record, 'interviewPlace')),
    interview_duration_minutes: toMinutesOrNull(startTime, endTime),
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
