import type { CompanyConfirmationStatus, KintoneInterviewStatus } from "@/lib/models"

export const ELIGIBLE_REGULAR_INTERVIEW_KINTONE_STATUS: KintoneInterviewStatus = "完了"
export const DEFAULT_COMPANY_CONFIRMATION_STATUS: CompanyConfirmationStatus = "確認待ち"

export function getCompanyConfirmationStatusColor(status: string): string {
  const statusColors: Record<string, string> = {
    確認待ち: "bg-amber-50 text-amber-700 ring-1 ring-inset ring-amber-200",
    確認完了: "bg-emerald-50 text-emerald-700 ring-1 ring-inset ring-emerald-200",
  }

  return statusColors[status] || "bg-slate-100 text-slate-700 ring-1 ring-inset ring-slate-200"
}

export function getCategoryColor(dai: string): string {
  const categoryColors: Record<string, string> = {
    日々の対応報告: "bg-teal-50 text-teal-700 ring-1 ring-inset ring-teal-200",
    ビザ更新対応: "bg-blue-50 text-blue-700 ring-1 ring-inset ring-blue-200",
    ライフライン対応: "bg-cyan-50 text-cyan-700 ring-1 ring-inset ring-cyan-200",
    "SIMカード・インターネット対応": "bg-purple-50 text-purple-700 ring-1 ring-inset ring-purple-200",
    パスポート更新案内: "bg-amber-50 text-amber-700 ring-1 ring-inset ring-amber-200",
    生活支援: "bg-sky-50 text-sky-700 ring-1 ring-inset ring-sky-200",
    就労支援: "bg-violet-50 text-violet-700 ring-1 ring-inset ring-violet-200",
    ビザ関連: "bg-emerald-50 text-emerald-700 ring-1 ring-inset ring-emerald-200",
    その他: "bg-slate-100 text-slate-700 ring-1 ring-inset ring-slate-200",
  }

  return categoryColors[dai] || "bg-slate-100 text-slate-700 ring-1 ring-inset ring-slate-200"
}

export function getKintoneInterviewRecordUrl(recordId: string | number): string {
  const baseUrl = (process.env.NEXT_PUBLIC_KINTONE_BASE_URL ?? "https://funtoco.cybozu.com").replace(/\/$/, "")
  const appId = process.env.NEXT_PUBLIC_KINTONE_INTERVIEW_APP_ID ?? "98"

  return `${baseUrl}/k/${appId}/show#record=${encodeURIComponent(String(recordId))}`
}

export function formatLocalDate(date: Date): string {
  const year = date.getFullYear()
  const month = String(date.getMonth() + 1).padStart(2, "0")
  const day = String(date.getDate()).padStart(2, "0")

  return `${year}-${month}-${day}`
}

export function formatLocalDateTime(date: Date): string {
  const hours = String(date.getHours()).padStart(2, "0")
  const minutes = String(date.getMinutes()).padStart(2, "0")
  const seconds = String(date.getSeconds()).padStart(2, "0")

  return `${formatLocalDate(date)}T${hours}:${minutes}:${seconds}`
}
