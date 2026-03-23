import { clsx, type ClassValue } from "clsx"
import { twMerge } from "tailwind-merge"
import type { Person, Visa, Meeting, SupportAction, ActivityItem } from "./models"

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs))
}

// Slugify function for creating URL-friendly strings
export function slugify(text: string): string {
  return text
    .toLowerCase()
    .replace(/[^a-z0-9\s-]/g, '')
    .replace(/\s+/g, '-')
    .replace(/-+/g, '-')
    .trim()
}

// Date formatting utilities for Japanese locale
export function formatDate(date: string | Date, options?: Intl.DateTimeFormatOptions): string {
  const dateObj = typeof date === "string" ? new Date(date) : date
  return dateObj.toLocaleDateString("ja-JP", {
    timeZone: "Asia/Tokyo",
    ...options,
  })
}

export function formatDateTime(date: string | Date): string {
  const dateObj = typeof date === "string" ? new Date(date) : date
  return dateObj.toLocaleString("ja-JP", {
    timeZone: "Asia/Tokyo",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  })
}

// Calculate days until expiry
export function getDaysUntilExpiry(expiryDate: string): number {
  const today = new Date()
  const expiry = new Date(expiryDate)
  const diffTime = expiry.getTime() - today.getTime()
  return Math.ceil(diffTime / (1000 * 60 * 60 * 24))
}

// Check if visa is expiring soon (within 30 days)
export function isExpiringSoon(expiryDate: string, days = 30): boolean {
  return getDaysUntilExpiry(expiryDate) <= days
}

// Get visa status color
export function getVisaStatusColor(status: string): string {
  const statusColors: Record<string, string> = {
    書類準備中: "bg-slate-100 text-slate-700 ring-1 ring-inset ring-slate-200",
    書類作成中: "bg-blue-50 text-blue-700 ring-1 ring-inset ring-blue-200",
    書類確認中: "bg-amber-50 text-amber-700 ring-1 ring-inset ring-amber-200",
    申請準備中: "bg-orange-50 text-orange-700 ring-1 ring-inset ring-orange-200",
    ビザ申請準備中: "bg-violet-50 text-violet-700 ring-1 ring-inset ring-violet-200",
    申請中: "bg-indigo-50 text-indigo-700 ring-1 ring-inset ring-indigo-200",
    ビザ取得済み: "bg-emerald-50 text-emerald-700 ring-1 ring-inset ring-emerald-200",
  }
  return statusColors[status] || "bg-slate-100 text-slate-700 ring-1 ring-inset ring-slate-200"
}

// Get support action status color
export function getSupportStatusColor(status: string): string {
  const statusColors: Record<string, string> = {
    open: "bg-red-50 text-red-700 ring-1 ring-inset ring-red-200",
    in_progress: "bg-amber-50 text-amber-700 ring-1 ring-inset ring-amber-200",
    done: "bg-emerald-50 text-emerald-700 ring-1 ring-inset ring-emerald-200",
  }
  return statusColors[status] || "bg-slate-100 text-slate-600 ring-1 ring-inset ring-slate-200"
}

// Get working status color
export function getWorkingStatusColor(status: string): string {
  const statusColors: Record<string, string> = {
    入社待ち: "bg-sky-50 text-sky-700 ring-1 ring-inset ring-sky-200",
    在籍中: "bg-emerald-50 text-emerald-700 ring-1 ring-inset ring-emerald-200",
    退職: "bg-red-50 text-red-700 ring-1 ring-inset ring-red-200",
    内定取消: "bg-red-50 text-red-700 ring-1 ring-inset ring-red-200",
    内定辞退: "bg-orange-50 text-orange-700 ring-1 ring-inset ring-orange-200",
    支援終了: "bg-slate-100 text-slate-600 ring-1 ring-inset ring-slate-200",
  }
  return statusColors[status] || "bg-slate-100 text-slate-600 ring-1 ring-inset ring-slate-200"
}

// Generate activity timeline from various data sources
export function generateActivityTimeline(
  people: Person[],
  visas: Visa[],
  meetings: Meeting[],
  supportActions: SupportAction[],
): ActivityItem[] {
  const activities: ActivityItem[] = []

  // Add meeting activities
  meetings.forEach((meeting) => {
    const person = people.find((p) => p.id === meeting.personId)
    if (person) {
      activities.push({
        id: meeting.id,
        type: "meeting",
        title: meeting.title,
        personName: person.name,
        datetime: meeting.datetime,
        link: `/people/${person.id}?tab=meetings`,
      })
    }
  })

  // Add visa activities from status history dates
  visas.forEach((visa) => {
    const person = people.find((p) => p.id === visa.personId)
    if (!person) return

    // Create activity items for each status date that exists
    const statusDates = [
      { date: visa.documentPreparationDate, status: "書類準備中" },
      { date: visa.documentCreationDate, status: "書類作成中" },
      { date: visa.documentConfirmationDate, status: "書類確認中" },
      { date: visa.applicationPreparationDate, status: "申請準備中" },
      { date: visa.visaApplicationPreparationDate, status: "ビザ申請準備中" },
      { date: visa.applicationDate, status: "申請中" },
      { date: visa.additionalDocumentsDate, status: "追加書類" },
      { date: visa.visaAcquiredDate, status: "ビザ取得済み" },
    ]

    statusDates.forEach(({ date, status }) => {
      if (date) {
        activities.push({
          id: `${visa.id}-${status}`,
          type: "visa",
          title: `ビザ状況: ${status}`,
          personName: person.name,
          datetime: date,
          status: status,
          link: `/visas`,
        })
      }
    })
  })

  // Add support action activities
  supportActions.forEach((action) => {
    const person = people.find((p) => p.id === action.personId)
    if (person) {
      activities.push({
        id: action.id,
        type: "support",
        title: action.title,
        personName: person.name,
        datetime: action.updatedAt,
        status: action.status,
        link: `/actions`,
      })
    }
  })

  // Sort by datetime (newest first)
  return activities.sort((a, b) => new Date(b.datetime).getTime() - new Date(a.datetime).getTime())
}
