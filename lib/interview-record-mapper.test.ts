import assert from "node:assert/strict"
import { test } from "vitest"

import {
  INTERVIEW_RECORD_SELECT_COLUMNS,
  INTERVIEW_RECORD_SELECT_COLUMNS_WITH_PERSON,
  isMissingInterviewRecordsTableError,
  mapInterviewRecordToDailySupportRecord,
  mapInterviewRecordRowsToDailySupportRecords,
  mapInterviewRecordToRegularInterview,
  type InterviewRecordRow,
} from "@/lib/interview-record-mapper"

const baseRow: InterviewRecordRow = {
  id: "record-1",
  person_id: "person-1",
  source_person_id: "3505",
  source_system: "kintone",
  source_app_id: "98",
  source_record_id: "9559",
  record_type: "regular_interview",
  source_status: "完了",
  interview_date: "2026-05-14",
  start_time: "14:00:00",
  end_time: "15:00:00",
  company_id: "3222",
  company_name: "株式会社ABC製造",
  support_staff_name: "田中",
  external_confirmation_status: "確認待ち",
  created_at: "2026-05-15T00:00:00Z",
  updated_at: "2026-05-15T00:00:00Z",
  person: { id: "person-1", name: "RENO MAULY ADINUGRAHA", kana: "レノ" },
}

test("mapInterviewRecordToRegularInterview maps DB row into UI model", () => {
  const mapped = mapInterviewRecordToRegularInterview({
    ...baseRow,
    target_quarter: "2026年第2四半期",
    interview_duration_minutes: 60,
    interview_method: "対面",
    interview_place: "本社会議室",
    sales_staff_name: "佐藤",
    internal_staff_name: "山田",
    external_report_body: "本人の勤務状況は良好です。",
  })

  assert.equal(mapped.id, "record-1")
  assert.equal(mapped.kintoneRecordId, "9559")
  assert.equal(mapped.personName, "RENO MAULY ADINUGRAHA")
  assert.equal(mapped.nickName, "レノ")
  assert.equal(mapped.interviewDate, "2026-05-14")
  assert.equal(mapped.startTime, "14:00")
  assert.equal(mapped.endTime, "15:00")
  assert.equal(mapped.companyReport, "本人の勤務状況は良好です。")
})

test("mapInterviewRecordToDailySupportRecord normalizes activity entries", () => {
  const mapped = mapInterviewRecordToDailySupportRecord({
    ...baseRow,
    record_type: "daily_support",
    activity_entries: [
      {
        dai: "生活支援",
        chu: "銀行・送金",
        shou: ["口座開設", "海外送金"],
        notes: "案内済み",
        funbaseVisibility: "visible",
      },
    ],
  })

  assert.equal(mapped.supportDate, "2026-05-14")
  assert.deepEqual(mapped.dailyEntries, [
    {
      dai: "生活支援",
      chu: "銀行・送金",
      shou: "口座開設, 海外送金",
      notes: "案内済み",
    },
  ])
})

test("mapInterviewRecordToDailySupportRecord returns only visible daily support entries", () => {
  const mapped = mapInterviewRecordToDailySupportRecord({
    ...baseRow,
    record_type: "daily_support",
    activity_entries: [
      { dai: "生活支援", chu: "銀行・送金", shou: ["口座開設"], funbaseVisibility: "visible" },
      { dai: "就労支援", chu: "退職相談", shou: ["退職日確認"], funbaseVisibility: "pending" },
      { dai: "就労支援", chu: "給与相談", shou: ["給与確認"], funbaseVisibility: "hidden" },
      { dai: "生活支援", chu: "住居", shou: ["入居案内"] },
    ],
  })

  assert.deepEqual(mapped.dailyEntries, [
    {
      dai: "生活支援",
      chu: "銀行・送金",
      shou: "口座開設",
    },
  ])
})

test("mapInterviewRecordRowsToDailySupportRecords drops records without visible entries", () => {
  const records = mapInterviewRecordRowsToDailySupportRecords([
    {
      ...baseRow,
      id: "record-visible",
      record_type: "daily_support",
      activity_entries: [
        { dai: "生活支援", chu: "銀行・送金", shou: ["口座開設"], funbaseVisibility: "visible" },
      ],
    },
    {
      ...baseRow,
      id: "record-pending",
      record_type: "daily_support",
      activity_entries: [
        { dai: "就労支援", chu: "退職相談", shou: ["退職日確認"], funbaseVisibility: "pending" },
      ],
    },
  ])

  assert.deepEqual(records.map((record) => record.id), ["record-visible"])
})

test("mapInterviewRecordToRegularInterview falls back for unknown enum-like values", () => {
  const mapped = mapInterviewRecordToRegularInterview({
    ...baseRow,
    source_status: "社内確認中",
    external_confirmation_status: "差戻し",
    interview_method: "チャット",
    target_quarter: "2026年第2四半期",
    external_report_body: "本人の勤務状況は良好です。",
  })

  assert.equal(mapped.kintoneStatus, undefined)
  assert.equal(mapped.companyConfirmationStatus, "確認待ち")
  assert.equal(mapped.interviewMethod, undefined)
})

test("isMissingInterviewRecordsTableError only matches missing interview_records table errors", () => {
  assert.equal(isMissingInterviewRecordsTableError({ code: "42P01", message: "relation does not exist" }), true)
  assert.equal(
    isMissingInterviewRecordsTableError({ message: "Could not find the table 'interview_records' in the schema cache" }),
    true
  )
  assert.equal(isMissingInterviewRecordsTableError({ code: "42501", message: "permission denied" }), false)
})

test("interview record select columns exclude internal and raw sync fields", () => {
  assert.equal(INTERVIEW_RECORD_SELECT_COLUMNS.includes("raw_record_json"), false)
  assert.equal(INTERVIEW_RECORD_SELECT_COLUMNS.includes("internal_notes"), false)
  assert.equal(INTERVIEW_RECORD_SELECT_COLUMNS_WITH_PERSON.includes("person:people(id, name, kana)"), true)
})
