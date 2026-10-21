import type { WorkHistoryEntry } from "@/lib/models"

function record(value: unknown): Record<string, unknown> | null {
  return value !== null && typeof value === "object" && !Array.isArray(value)
    ? value as Record<string, unknown>
    : null
}

function fieldValue(row: Record<string, unknown>, key: string): string | undefined {
  const raw = row[key]
  const wrapped = record(raw)
  const value = wrapped && "value" in wrapped ? wrapped.value : raw
  if (typeof value !== "string" && typeof value !== "number") return undefined
  const trimmed = String(value).trim()
  return trimmed || undefined
}

function year(value: string | undefined): string | undefined {
  return value && /^\d{4}$/.test(value) ? value : undefined
}

function month(value: string | undefined): string | undefined {
  if (!value || !/^\d{1,2}$/.test(value)) return undefined
  const numeric = Number(value)
  return numeric >= 1 && numeric <= 12 ? String(numeric) : undefined
}

function startOrder(entry: WorkHistoryEntry): number {
  if (!entry.startYear) return -1
  return Number(entry.startYear) * 12 + Number(entry.startMonth ?? 0)
}

export function formatWorkHistoryDuration(duration: string | undefined): string {
  if (!duration) return "—"
  return /^\d+(?:\.\d+)?$/.test(duration) ? `${duration}ヶ月` : duration
}

function formatWorkMonth(year?: string, month?: string): string {
  if (year && month) return `${year}年${month}月`
  if (year) return `${year}年`
  if (month) return `${month}月`
  return "未登録"
}

export function formatWorkHistoryPeriod(
  startYear?: string,
  startMonth?: string,
  endYear?: string,
  endMonth?: string,
): string {
  return `${formatWorkMonth(startYear, startMonth)}〜${formatWorkMonth(endYear, endMonth)}`
}

/** Normalize the raw App30 workHistory SUBTABLE without modifying its source data. */
export function parseWorkHistory(raw: unknown): WorkHistoryEntry[] {
  if (!Array.isArray(raw)) return []

  return raw.flatMap((item, index): WorkHistoryEntry[] => {
    const source = record(item)
    const values = source && record(source.value)
    if (!values) return []

    const entry: WorkHistoryEntry = {
      id: source.id === undefined || source.id === null ? String(index) : String(source.id),
      employer: fieldValue(values, "employmentRecord_1"),
      residenceStatus: fieldValue(values, "在留資格_1"),
      startYear: year(fieldValue(values, "workHistoryJoinYear_1")),
      startMonth: month(fieldValue(values, "workHistoryJoinMonth_1")),
      endYear: year(fieldValue(values, "workHistoryLeaveYear_1")),
      endMonth: month(fieldValue(values, "workHistoryLeaveMonth_1")),
      permitDate: fieldValue(values, "許可年月日_1"),
      duration: fieldValue(values, "勤務期間"),
      memo: fieldValue(values, "職歴メモ_1"),
    }

    const hasMeaningfulContent = [
      entry.employer,
      entry.residenceStatus,
      entry.startYear,
      entry.startMonth,
      entry.endYear,
      entry.endMonth,
      entry.permitDate,
      entry.memo,
    ].some((value) => value !== undefined)

    return hasMeaningfulContent ? [entry] : []
  }).sort((a, b) => startOrder(b) - startOrder(a))
}
