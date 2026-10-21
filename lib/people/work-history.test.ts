import { describe, expect, test } from "vitest"
import {
  formatWorkHistoryDuration,
  formatWorkHistoryPeriod,
  parseWorkHistory,
} from "./work-history"

const field = (value: unknown) => ({ type: "SINGLE_LINE_TEXT", value })

describe("職歴パーサー", () => {
  test("Kintoneの職歴行を正規化し、開始年月の新しい順に並べる", () => {
    const rows = [
      { id: "old", value: {
        employmentRecord_1: field(" 前の勤務先 "), 在留資格_1: field("技能実習"),
        workHistoryJoinYear_1: field("2020"), workHistoryJoinMonth_1: field("4"),
        workHistoryLeaveYear_1: field("2022"), workHistoryLeaveMonth_1: field("12"),
        許可年月日_1: field("2020-04-01"), 職歴メモ_1: field("担当業務"), 勤務期間: field("2年8か月"),
        nextWorkGapReason: field("転職"), nextWorkGapMemo: field("補足"),
        nextWorkGapHandling: field("算入"), nextWorkGapMonths: field("3"), nextWorkGapCountedMonths: field("2"),
      } },
      { id: "new", value: { employmentRecord_1: field("現在の勤務先"), workHistoryJoinYear_1: field("2023"), workHistoryJoinMonth_1: field("1") } },
    ]

    expect(parseWorkHistory(rows)).toEqual([
      {
        id: "new", employer: "現在の勤務先", residenceStatus: undefined,
        startYear: "2023", startMonth: "1", endYear: undefined, endMonth: undefined,
        permitDate: undefined, duration: undefined, memo: undefined,
      },
      {
        id: "old", employer: "前の勤務先", residenceStatus: "技能実習",
        startYear: "2020", startMonth: "4", endYear: "2022", endMonth: "12",
        permitDate: "2020-04-01", duration: "2年8か月", memo: "担当業務",
      },
    ])
  })

  test("Kintoneの勤務期間数値に月の単位を付ける", () => {
    expect(formatWorkHistoryDuration("29")).toBe("29ヶ月")
    expect(formatWorkHistoryDuration("2年8か月")).toBe("2年8か月")
    expect(formatWorkHistoryDuration(undefined)).toBe("—")
  })

  test("退社年月が未登録の場合は現在勤務中と断定しない", () => {
    expect(formatWorkHistoryPeriod("2023", "1", undefined, undefined)).toBe("2023年1月〜未登録")
    expect(formatWorkHistoryPeriod("2020", "4", "2022", "12")).toBe("2020年4月〜2022年12月")
  })

  test("不正な入力と空行を除外し、部分的な行の有用な情報を残す", () => {
    expect(parseWorkHistory(null)).toEqual([])
    expect(parseWorkHistory({ value: [] })).toEqual([])
    expect(parseWorkHistory([
      null, "invalid", {}, { id: "empty", value: { employmentRecord_1: field("  ") } },
      {
        id: "kintone-defaults-only",
        value: {
          nextWorkGapHandling: field("対象外"),
          nextWorkGapMonths: field("0"),
          nextWorkGapCountedMonths: field("0"),
          勤務期間: field("0"),
        },
      },
      {
        id: "gap-only",
        value: {
          nextWorkGapHandling: field("通算に含める"),
          nextWorkGapMonths: field("3"),
          nextWorkGapReason: field("転職活動中"),
        },
      },
      { id: 42, value: { 職歴メモ_1: field(" メモのみ "), workHistoryJoinYear_1: field("invalid"), workHistoryJoinMonth_1: field("13") } },
      { id: "flat", value: { employmentRecord_1: "直接値" } },
    ])).toEqual([
      {
        id: "42", employer: undefined, residenceStatus: undefined,
        startYear: undefined, startMonth: undefined, endYear: undefined, endMonth: undefined,
        permitDate: undefined, duration: undefined, memo: "メモのみ",
      },
      {
        id: "flat", employer: "直接値", residenceStatus: undefined,
        startYear: undefined, startMonth: undefined, endYear: undefined, endMonth: undefined,
        permitDate: undefined, duration: undefined, memo: undefined,
      },
    ])
  })
})
