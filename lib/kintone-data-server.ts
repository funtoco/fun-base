import type { DailySupportRecord, RegularInterview } from "@/lib/models"
import { FUNBASE_REGULAR_MEETING_START_DATE } from "@/lib/meeting-scope"
import { createClient } from "@/lib/supabase/server"
import {
  INTERVIEW_RECORD_SELECT_COLUMNS_WITH_PERSON,
  isMissingInterviewRecordsTableError,
  mapInterviewRecordRowsToDailySupportRecords,
  mapInterviewRecordToDailySupportRecord,
  mapInterviewRecordToRegularInterview,
  type InterviewRecordRow,
} from "@/lib/interview-record-mapper"

export type InterviewRecordDetail =
  | { recordType: "regular_interview"; record: RegularInterview }
  | { recordType: "daily_support"; record: DailySupportRecord }

function handleInterviewRecordsFetchError<T>(context: string, error: { code?: string; message?: string }): T[] {
  if (isMissingInterviewRecordsTableError(error)) {
    console.warn(`[interview-records] ${context}: interview_records table is not ready yet`)
    return []
  }

  console.error(`[interview-records] ${context}:`, error)
  throw error
}

function handleInterviewRecordFetchError(context: string, error: { code?: string; message?: string }): null {
  if (isMissingInterviewRecordsTableError(error)) {
    console.warn(`[interview-records] ${context}: interview_records table is not ready yet`)
    return null
  }

  console.error(`[interview-records] ${context}:`, error)
  throw error
}

export async function getInterviewRecordDetailById(recordId: string): Promise<InterviewRecordDetail | null> {
  const supabase = await createClient()
  const { data, error } = await supabase
    .from("interview_records")
    .select(INTERVIEW_RECORD_SELECT_COLUMNS_WITH_PERSON)
    .eq("id", recordId)
    .maybeSingle()

  if (error) {
    return handleInterviewRecordFetchError("fetch interview record detail", error)
  }

  if (!data) return null

  const row = data as unknown as InterviewRecordRow
  if (row.record_type === "regular_interview") {
    if (row.interview_date < FUNBASE_REGULAR_MEETING_START_DATE) return null

    return {
      recordType: "regular_interview",
      record: mapInterviewRecordToRegularInterview(row),
    }
  }

  if (row.record_type === "daily_support") {
    const record = mapInterviewRecordToDailySupportRecord(row)
    if (record.dailyEntries.length === 0) return null

    return {
      recordType: "daily_support",
      record,
    }
  }

  console.warn("[interview-records] unknown record type", { recordType: row.record_type, recordId })
  return null
}

export async function getRegularInterviewsByPersonId(personId: string): Promise<RegularInterview[]> {
  const supabase = await createClient()
  console.log("[interview-records] getRegularInterviewsByPersonId fetch start", { personId })
  const { data, error } = await supabase
    .from("interview_records")
    .select(INTERVIEW_RECORD_SELECT_COLUMNS_WITH_PERSON)
    .eq("record_type", "regular_interview")
    .gte("interview_date", FUNBASE_REGULAR_MEETING_START_DATE)
    .eq("person_id", personId)
    .order("interview_date", { ascending: false })
    .order("created_at", { ascending: false })

  if (error) {
    return handleInterviewRecordsFetchError("fetch regular interviews by person", error)
  }

  const records = ((data || []) as unknown as InterviewRecordRow[]).map(mapInterviewRecordToRegularInterview)
  console.log("[interview-records] getRegularInterviewsByPersonId fetch success", { personId, count: records.length })
  return records
}

export async function getDailySupportRecordsByPersonId(personId: string): Promise<DailySupportRecord[]> {
  const supabase = await createClient()
  console.log("[interview-records] getDailySupportRecordsByPersonId fetch start", { personId })
  const { data, error } = await supabase
    .from("interview_records")
    .select(INTERVIEW_RECORD_SELECT_COLUMNS_WITH_PERSON)
    .eq("record_type", "daily_support")
    .eq("person_id", personId)
    .order("interview_date", { ascending: false })
    .order("created_at", { ascending: false })

  if (error) {
    return handleInterviewRecordsFetchError("fetch daily support records by person", error)
  }

  const records = mapInterviewRecordRowsToDailySupportRecords((data || []) as unknown as InterviewRecordRow[])
  console.log("[interview-records] getDailySupportRecordsByPersonId fetch success", { personId, count: records.length })
  return records
}
