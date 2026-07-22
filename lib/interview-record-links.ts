export type InterviewRecordType = "regular_interview" | "daily_support"

export function getInterviewRecordDetailPath(recordId: string): string {
  return `/interview-records/${encodeURIComponent(recordId)}`
}

export function getInterviewRecordListPath(recordType: InterviewRecordType): string {
  return recordType === "regular_interview" ? "/meetings" : "/support"
}
