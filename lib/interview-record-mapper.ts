import type {
  CompanyConfirmationStatus,
  DailySupportEntry,
  DailySupportRecord,
  InterviewMethod,
  KintoneInterviewStatus,
  RegularInterview,
} from "@/lib/models"

type InterviewRecordPerson = {
  id?: string | null
  name?: string | null
  kana?: string | null
}

export type InterviewRecordRow = {
  id: string
  person_id: string
  source_person_id?: string | null
  source_system?: string | null
  source_app_id?: string | null
  source_record_id?: string | null
  record_type: string
  source_status?: string | null
  interview_date: string
  start_time?: string | null
  end_time?: string | null
  target_quarter?: string | null
  interview_method?: string | null
  interview_place?: string | null
  interview_duration_minutes?: number | null
  company_id?: string | null
  company_name?: string | null
  support_staff_name?: string | null
  sales_staff_name?: string | null
  internal_staff_name?: string | null
  external_report_body?: string | null
  activity_entries?: unknown
  internal_notes?: string | null
  external_confirmation_status?: string | null
  created_at: string
  updated_at: string
  person?: InterviewRecordPerson | InterviewRecordPerson[] | null
}

const KINTONE_INTERVIEW_STATUSES = new Set<KintoneInterviewStatus>([
  "Not started",
  "完了",
  "確認不要",
  "クローズ",
  "確認中",
  "差戻(確認事項あり)",
])

const COMPANY_CONFIRMATION_STATUSES = new Set<CompanyConfirmationStatus>([
  "確認待ち",
  "確認完了",
])

const INTERVIEW_METHODS = new Set<InterviewMethod>([
  "オンラインMTG",
  "対面",
  "電話",
  "メール",
])

export function isMissingInterviewRecordsTableError(error: { code?: string; message?: string } | null | undefined): boolean {
  if (!error) return false
  return (
    error.code === "42P01" ||
    (/interview_records/i.test(error.message || "") && /does not exist|Could not find the table/i.test(error.message || ""))
  )
}

function parseKintoneInterviewStatus(value?: string | null): KintoneInterviewStatus | undefined {
  if (!value) return undefined
  if (KINTONE_INTERVIEW_STATUSES.has(value as KintoneInterviewStatus)) {
    return value as KintoneInterviewStatus
  }

  console.warn("[interview-records] unknown kintone status", { value })
  return undefined
}

function parseCompanyConfirmationStatus(value?: string | null): CompanyConfirmationStatus {
  if (!value) return "確認待ち"
  if (COMPANY_CONFIRMATION_STATUSES.has(value as CompanyConfirmationStatus)) {
    return value as CompanyConfirmationStatus
  }

  console.warn("[interview-records] unknown company confirmation status", { value })
  return "確認待ち"
}

function parseInterviewMethod(value?: string | null): InterviewMethod | undefined {
  if (!value) return undefined
  if (INTERVIEW_METHODS.has(value as InterviewMethod)) {
    return value as InterviewMethod
  }

  console.warn("[interview-records] unknown interview method", { value })
  return undefined
}

function getPerson(row: InterviewRecordRow): InterviewRecordPerson | null {
  if (Array.isArray(row.person)) return row.person[0] ?? null
  return row.person ?? null
}

function trimTime(value?: string | null): string | undefined {
  if (!value) return undefined
  return value.slice(0, 5)
}

function toDailyEntries(value: unknown): DailySupportEntry[] {
  if (!Array.isArray(value)) return []

  return value.map((entry) => {
    const item = entry && typeof entry === "object" ? entry as Record<string, unknown> : {}
    const shou = item.shou

    return {
      dai: String(item.dai || ""),
      chu: String(item.chu || ""),
      shou: Array.isArray(shou) ? shou.filter(Boolean).join(", ") : String(shou || ""),
      notes: item.notes ? String(item.notes) : undefined,
    }
  })
}

function baseFields(row: InterviewRecordRow) {
  const person = getPerson(row)

  return {
    id: row.id,
    kintoneRecordId: row.source_record_id ?? undefined,
    personId: row.person_id,
    personName: person?.name || row.source_person_id || row.person_id,
    nickName: person?.kana ?? undefined,
    companyId: row.company_id ?? undefined,
    companyName: row.company_name ?? undefined,
    startTime: trimTime(row.start_time),
    endTime: trimTime(row.end_time),
    supportStaffName: row.support_staff_name ?? undefined,
    kintoneStatus: parseKintoneInterviewStatus(row.source_status),
    companyConfirmationStatus: parseCompanyConfirmationStatus(row.external_confirmation_status),
    internalNotes: row.internal_notes ?? undefined,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  }
}

export function mapInterviewRecordToRegularInterview(row: InterviewRecordRow): RegularInterview {
  return {
    ...baseFields(row),
    interviewDate: row.interview_date,
    targetQuarter: row.target_quarter ?? undefined,
    interviewDuration: row.interview_duration_minutes ?? undefined,
    interviewMethod: parseInterviewMethod(row.interview_method),
    interviewPlace: row.interview_place ?? undefined,
    salesStaffName: row.sales_staff_name ?? undefined,
    funtocoStaff: row.internal_staff_name ?? undefined,
    companyReport: row.external_report_body || "",
  }
}

export function mapInterviewRecordToDailySupportRecord(row: InterviewRecordRow): DailySupportRecord {
  return {
    ...baseFields(row),
    supportDate: row.interview_date,
    dailyEntries: toDailyEntries(row.activity_entries),
  }
}
