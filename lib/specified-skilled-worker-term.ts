const TOKYO_TIME_ZONE = 'Asia/Tokyo'

type YearMonth = {
  year: number
  month: number
}

function getTokyoYearMonth(date: Date): YearMonth {
  const parts = new Intl.DateTimeFormat('ja-JP', {
    timeZone: TOKYO_TIME_ZONE,
    year: 'numeric',
    month: 'numeric',
  }).formatToParts(date)

  const year = Number(parts.find((part) => part.type === 'year')?.value)
  const month = Number(parts.find((part) => part.type === 'month')?.value)

  return { year, month }
}

function addMonths({ year, month }: YearMonth, months: number): YearMonth {
  const monthIndex = year * 12 + (month - 1) + months
  return {
    year: Math.floor(monthIndex / 12),
    month: (monthIndex % 12) + 1,
  }
}

export function formatSpecifiedSkilledWorkerRemainingTerm(
  remainingMonths: number | undefined,
  now = new Date(),
): string | null {
  if (remainingMonths === undefined || !Number.isFinite(remainingMonths)) return null

  const normalizedMonths = Math.trunc(remainingMonths)
  if (normalizedMonths === 0) return '通算5年に到達'
  if (normalizedMonths < 0) return `通算5年を${Math.abs(normalizedMonths)}か月超過`

  const years = Math.floor(normalizedMonths / 12)
  const months = normalizedMonths % 12
  const duration = [years > 0 ? `${years}年` : '', months > 0 ? `${months}か月` : ''].join('')
  const estimatedLimit = addMonths(getTokyoYearMonth(now), normalizedMonths)

  return `残り${duration}（5年期限の目安: ${estimatedLimit.year}年${estimatedLimit.month}月）`
}
