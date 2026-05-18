import type { DailySupportRecord, RegularInterview } from "@/lib/models"
import { createClient } from "@/lib/supabase/server"
import {
  isMissingInterviewRecordsTableError,
  mapInterviewRecordToDailySupportRecord,
  mapInterviewRecordToRegularInterview,
  type InterviewRecordRow,
} from "@/lib/interview-record-mapper"

function handleInterviewRecordsFetchError<T>(context: string, error: { code?: string; message?: string }): T[] {
  if (isMissingInterviewRecordsTableError(error)) {
    console.warn(`[interview-records] ${context}: interview_records table is not ready yet`)
    return []
  }

  console.error(`[interview-records] ${context}:`, error)
  throw error
}

export async function getRegularInterviewsByPersonId(personId: string): Promise<RegularInterview[]> {
  const supabase = await createClient()
  const { data, error } = await supabase
    .from("interview_records")
    .select("*")
    .eq("record_type", "regular_interview")
    .eq("person_id", personId)
    .order("interview_date", { ascending: false })
    .order("source_record_id", { ascending: false })

  if (error) {
    return handleInterviewRecordsFetchError("fetch regular interviews by person", error)
  }

  return ((data || []) as InterviewRecordRow[]).map(mapInterviewRecordToRegularInterview)
}

export async function getDailySupportRecordsByPersonId(personId: string): Promise<DailySupportRecord[]> {
  const supabase = await createClient()
  const { data, error } = await supabase
    .from("interview_records")
    .select("*")
    .eq("record_type", "daily_support")
    .eq("person_id", personId)
    .order("interview_date", { ascending: false })
    .order("source_record_id", { ascending: false })

  if (error) {
    return handleInterviewRecordsFetchError("fetch daily support records by person", error)
  }

  return ((data || []) as InterviewRecordRow[]).map(mapInterviewRecordToDailySupportRecord)
}
