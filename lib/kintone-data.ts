/**
 * Kintone App 98 Data Adapter
 *
 * This module provides typed data adapter functions for Kintone App 98 (就労_面談記録).
 * It reads normalized records from the FunBase `interview_records` table.
 */

import type { CompanyConfirmationStatus, RegularInterview, DailySupportRecord, DailySupportEntry } from "@/lib/models"
import { createClient } from "@/lib/supabase/client"
import {
  DEFAULT_COMPANY_CONFIRMATION_STATUS,
  ELIGIBLE_REGULAR_INTERVIEW_KINTONE_STATUS,
  formatLocalDate,
  formatLocalDateTime,
} from "@/lib/interview-records"
import {
  isMissingInterviewRecordsTableError,
  mapInterviewRecordToDailySupportRecord,
  mapInterviewRecordToRegularInterview,
  type InterviewRecordRow,
} from "@/lib/interview-record-mapper"

// ============================================================================
// DATA ADAPTER FUNCTIONS
// These functions define the interface for fetching normalized interview data.
// ============================================================================

function handleInterviewRecordsFetchError<T>(context: string, error: { code?: string; message?: string }): T[] {
  if (isMissingInterviewRecordsTableError(error)) {
    console.warn(`[interview-records] ${context}: interview_records table is not ready yet`)
    return []
  }

  console.error(`[interview-records] ${context}:`, error)
  throw error
}

/**
 * Get all regular interview records (定期面談)
 * Main content: 企業提出用レポート (companyReport)
 */
export async function getRegularInterviews(): Promise<RegularInterview[]> {
  const supabase = createClient()
  const { data, error } = await supabase
    .from("interview_records")
    .select("*, person:people(id, name, kana)")
    .eq("record_type", "regular_interview")
    .order("interview_date", { ascending: false })
    .order("created_at", { ascending: false })

  if (error) {
    return handleInterviewRecordsFetchError("fetch regular interviews", error)
  }

  return ((data || []) as InterviewRecordRow[]).map(mapInterviewRecordToRegularInterview)
}

/**
 * Get latest regular interviews for compact dashboard widgets.
 */
export async function getLatestRegularInterviews(limit = 5): Promise<RegularInterview[]> {
  const supabase = createClient()
  const { data, error } = await supabase
    .from("interview_records")
    .select("*, person:people(id, name, kana)")
    .eq("record_type", "regular_interview")
    .order("interview_date", { ascending: false })
    .order("created_at", { ascending: false })
    .limit(limit)

  if (error) {
    return handleInterviewRecordsFetchError("fetch latest regular interviews", error)
  }

  return ((data || []) as InterviewRecordRow[]).map(mapInterviewRecordToRegularInterview)
}

/**
 * Get regular interview records for a specific person
 * @param personId - The FunBase people.id
 */
export async function getRegularInterviewsByPersonId(personId: string): Promise<RegularInterview[]> {
  const supabase = createClient()
  const { data, error } = await supabase
    .from("interview_records")
    .select("*")
    .eq("record_type", "regular_interview")
    .eq("person_id", personId)
    .order("interview_date", { ascending: false })
    .order("created_at", { ascending: false })

  if (error) {
    return handleInterviewRecordsFetchError("fetch regular interviews by person", error)
  }

  return ((data || []) as InterviewRecordRow[]).map(mapInterviewRecordToRegularInterview)
}

/**
 * Get all daily support records (日々の面談)
 * Main content: tableStorageDaily entries (dailyEntries)
 */
export async function getDailySupportRecords(): Promise<DailySupportRecord[]> {
  const supabase = createClient()
  const { data, error } = await supabase
    .from("interview_records")
    .select("*, person:people(id, name, kana)")
    .eq("record_type", "daily_support")
    .order("interview_date", { ascending: false })
    .order("created_at", { ascending: false })

  if (error) {
    return handleInterviewRecordsFetchError("fetch daily support records", error)
  }

  return ((data || []) as InterviewRecordRow[]).map(mapInterviewRecordToDailySupportRecord)
}

/**
 * Get latest daily support records for compact dashboard widgets.
 */
export async function getLatestDailySupportRecords(limit = 5): Promise<DailySupportRecord[]> {
  const supabase = createClient()
  const { data, error } = await supabase
    .from("interview_records")
    .select("*, person:people(id, name, kana)")
    .eq("record_type", "daily_support")
    .order("interview_date", { ascending: false })
    .order("created_at", { ascending: false })
    .limit(limit)

  if (error) {
    return handleInterviewRecordsFetchError("fetch latest daily support records", error)
  }

  return ((data || []) as InterviewRecordRow[]).map(mapInterviewRecordToDailySupportRecord)
}

/**
 * Get daily support records for a specific person
 * @param personId - The FunBase people.id
 */
export async function getDailySupportRecordsByPersonId(personId: string): Promise<DailySupportRecord[]> {
  const supabase = createClient()
  const { data, error } = await supabase
    .from("interview_records")
    .select("*")
    .eq("record_type", "daily_support")
    .eq("person_id", personId)
    .order("interview_date", { ascending: false })
    .order("created_at", { ascending: false })

  if (error) {
    return handleInterviewRecordsFetchError("fetch daily support records by person", error)
  }

  return ((data || []) as InterviewRecordRow[]).map(mapInterviewRecordToDailySupportRecord)
}

/**
 * Get unique categories from daily support records
 * Used for filter options in the UI
 */
export async function getDailySupportCategories(): Promise<{ dai: string; chu: string; shou: string }[]> {
  const records = await getDailySupportRecords()
  const categories = new Map<string, { dai: string; chu: string; shou: string }>()

  records.forEach((record) => {
    record.dailyEntries.forEach((entry) => {
      const key = `${entry.dai}:${entry.chu}:${entry.shou}`
      categories.set(key, { dai: entry.dai, chu: entry.chu, shou: entry.shou })
    })
  })

  return Array.from(categories.values())
}

// ============================================================================
// SAMPLE DATA FOR DEVELOPMENT/TESTING
// This sample data can be used during development to test the UI.
// Import and use ONLY in development/test environments.
// ============================================================================

// Sample 企業提出用レポート content
const sampleCompanyReports = [
  `【面談概要】
本人の勤務状況は良好で、業務への適応も順調に進んでいる。
日本語でのコミュニケーション能力も向上しており、同僚との関係も良好。

【健康状態】
健康状態は良好。睡眠時間も確保できており、体調管理ができている。

【今後の課題・支援内容】
引き続き日本語学習のサポートを継続。JLPT N3受験に向けた準備を進める。`,
  `【面談概要】
業務遂行状況は問題なく、指示された作業を正確にこなしている。
職場環境にも慣れ、自発的に質問や提案ができるようになってきた。

【生活状況】
住居環境は安定している。近隣住民とのトラブルもなく、生活リズムも整っている。

【今後の支援計画】
在留資格更新に向けた書類準備のサポートを行う。`,
  `【面談概要】
今四半期は特に大きな問題なく過ごせている。
仕事面では新しい業務にも積極的に取り組んでいる。

【メンタル面】
精神的にも安定しており、ストレス管理もできている様子。
家族との連絡も定期的に取れている。

【次回面談に向けて】
資格試験の申込みサポートと、キャリアプランについて相談予定。`,
]

// Sample tableStorageDaily entries (dai/chu/shou categories)
const sampleDailyCategories: { dai: string; chu: string; shou: string }[] = [
  { dai: "生活支援", chu: "住居関連", shou: "引越し手続き" },
  { dai: "生活支援", chu: "住居関連", shou: "不動産会社連絡" },
  { dai: "生活支援", chu: "行政手続き", shou: "住民票取得" },
  { dai: "生活支援", chu: "行政手続き", shou: "マイナンバー申請" },
  { dai: "生活支援", chu: "銀行・送金", shou: "口座開設" },
  { dai: "生活支援", chu: "銀行・送金", shou: "海外送金手続き" },
  { dai: "生活支援", chu: "医療", shou: "病院予約" },
  { dai: "生活支援", chu: "医療", shou: "診察同行" },
  { dai: "就労支援", chu: "職場対応", shou: "上司への連絡" },
  { dai: "就労支援", chu: "職場対応", shou: "シフト調整" },
  { dai: "就労支援", chu: "キャリア", shou: "資格取得相談" },
  { dai: "就労支援", chu: "キャリア", shou: "転職相談" },
  { dai: "ビザ関連", chu: "書類準備", shou: "必要書類確認" },
  { dai: "ビザ関連", chu: "書類準備", shou: "申請書作成" },
  { dai: "ビザ関連", chu: "入管対応", shou: "申請同行" },
  { dai: "その他", chu: "通訳", shou: "電話通訳" },
  { dai: "その他", chu: "通訳", shou: "対面通訳" },
  { dai: "その他", chu: "相談", shou: "生活相談" },
]

const sampleNotes = [
  "対応完了。特に問題なし。",
  "継続対応中。来週フォローアップ予定。",
  "本人より感謝の言葉あり。",
  "企業担当者にも報告済み。",
  "追加書類が必要。本人に連絡済み。",
  "予約完了。日時を本人に連絡。",
  "",
]

/**
 * Generate sample regular interviews for a specific person
 * USE ONLY FOR DEVELOPMENT/TESTING
 *
 * @param personId - The person's ID
 * @param personName - The person's name
 * @param companyName - Optional company name
 * @param count - Number of records to generate (default: 3)
 */
export function generateSampleRegularInterviews(
  personId: string,
  personName: string,
  companyName?: string,
  count: number = 3
): RegularInterview[] {
  const confirmationStatuses: CompanyConfirmationStatus[] = [DEFAULT_COMPANY_CONFIRMATION_STATUS, "確認完了"]
  const methods: RegularInterview["interviewMethod"][] = ["オンラインMTG", "対面", "電話", "メール"]
  const quarters = ["2025年Q2", "2025年Q1", "2024年Q4"]
  const supportStaff = ["田中", "佐藤", "鈴木"]

  return Array.from({ length: Math.min(count, 3) }, (_, i) => {
    const interviewDate = new Date(2025, 5 - i, 15 - i * 5)
    return {
      id: `sample-ri-${personId}-${i + 1}`,
      kintoneRecordId: undefined, // No real Kintone record
      personId,
      personName,
      companyName,
      interviewDate: formatLocalDate(interviewDate),
      startTime: "10:00",
      endTime: "11:00",
      targetQuarter: quarters[i % quarters.length],
      interviewDuration: 60,
      interviewMethod: methods[i % methods.length],
      interviewPlace: i % 2 === 0 ? "本社会議室" : "オンライン",
      supportStaffName: supportStaff[i % supportStaff.length],
      kintoneStatus: ELIGIBLE_REGULAR_INTERVIEW_KINTONE_STATUS,
      companyConfirmationStatus: confirmationStatuses[i % confirmationStatuses.length],
      companyReport: sampleCompanyReports[i % sampleCompanyReports.length],
      createdAt: formatLocalDateTime(interviewDate),
      updatedAt: formatLocalDateTime(interviewDate),
    }
  })
}

/**
 * Generate sample daily support records for a specific person
 * USE ONLY FOR DEVELOPMENT/TESTING
 *
 * @param personId - The person's ID
 * @param personName - The person's name
 * @param companyName - Optional company name
 * @param count - Number of records to generate (default: 5)
 */
export function generateSampleDailySupportRecords(
  personId: string,
  personName: string,
  companyName?: string,
  count: number = 5
): DailySupportRecord[] {
  const confirmationStatuses: CompanyConfirmationStatus[] = [DEFAULT_COMPANY_CONFIRMATION_STATUS, "確認完了"]
  const supportStaff = ["田中", "佐藤", "鈴木", "高橋"]

  return Array.from({ length: Math.min(count, 5) }, (_, i) => {
    const supportDate = new Date(2025, 5, 15 - i * 2)

    // Generate 1-3 daily entries per record
    const entryCount = 1 + (i % 3)
    const dailyEntries: DailySupportEntry[] = Array.from({ length: entryCount }, (_, j) => {
      const category = sampleDailyCategories[(i + j) % sampleDailyCategories.length]
      return {
        dai: category.dai,
        chu: category.chu,
        shou: category.shou,
        notes: sampleNotes[(i + j) % sampleNotes.length] || undefined,
      }
    })

    return {
      id: `sample-ds-${personId}-${i + 1}`,
      kintoneRecordId: undefined, // No real Kintone record
      personId,
      personName,
      companyName,
      supportDate: formatLocalDate(supportDate),
      startTime: `${String(9 + (i % 8)).padStart(2, "0")}:00`,
      endTime: `${String(10 + (i % 8)).padStart(2, "0")}:00`,
      supportStaffName: supportStaff[i % supportStaff.length],
      kintoneStatus: ELIGIBLE_REGULAR_INTERVIEW_KINTONE_STATUS,
      companyConfirmationStatus: confirmationStatuses[i % confirmationStatuses.length],
      dailyEntries,
      createdAt: formatLocalDateTime(supportDate),
      updatedAt: formatLocalDateTime(supportDate),
    }
  })
}
