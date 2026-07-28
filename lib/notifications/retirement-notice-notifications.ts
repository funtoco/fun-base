export const RETIREMENT_NOTICE_NOTIFICATION_TYPE = 'retirement_notice'
export const RETIREMENT_NOTICE_NOTIFICATION_SOURCE_TYPE = 'person_retirement'
export const RETIRED_WORKING_STATUS = '退職'

type UserTenantRole = 'owner' | 'admin' | 'member' | 'guest' | 'supporter' | string
type UserTenantStatus = 'active' | 'pending' | 'suspended' | string

export type RetirementNoticeExistingPerson = {
  id: string
  working_status?: string | null
}

export type RetirementNoticeRecipientRow = {
  user_id: string | null
  status: UserTenantStatus
  role: UserTenantRole
}

export type RetirementNoticeRecipient = {
  userId: string
}

export type RetirementNoticeAnnouncementInput = {
  personId: string
  personName?: string | null
  companyName?: string | null
  appBaseUrl: string
}

export function shouldNotifyRetirementStatusChange({
  existingPerson,
  nextWorkingStatus,
}: {
  existingPerson?: RetirementNoticeExistingPerson | null
  nextWorkingStatus?: string | null
}): boolean {
  if (!existingPerson) return false
  if (existingPerson.working_status === RETIRED_WORKING_STATUS) return false
  return nextWorkingStatus === RETIRED_WORKING_STATUS
}

export function getRetirementNoticeNotificationRecipients(
  members: RetirementNoticeRecipientRow[]
): RetirementNoticeRecipient[] {
  const seenUserIds = new Set<string>()

  return members.reduce<RetirementNoticeRecipient[]>((recipients, member) => {
    if (!member.user_id) return recipients
    if (member.status !== 'active') return recipients
    if (member.role === 'supporter') return recipients
    if (seenUserIds.has(member.user_id)) return recipients

    seenUserIds.add(member.user_id)
    recipients.push({ userId: member.user_id })
    return recipients
  }, [])
}

export function buildRetirementNoticeAnnouncement({
  personId,
  personName,
  companyName,
  appBaseUrl,
}: RetirementNoticeAnnouncementInput): { title: string; body: string } {
  const noticeUrl = `${trimTrailingSlash(appBaseUrl)}/people/${encodeURIComponent(personId)}/retirement-notice`
  const lines = [
    '就労ステータスが退職に変更された人材がいます。',
    '',
    `対象者：${displayValue(personName, '対象者名未登録')}`,
    companyName ? `所属先：${companyName}` : null,
    '',
    `退職届出テンプレート：${noticeUrl}`,
  ].filter((line): line is string => line !== null)

  return {
    title: '退職届出が必要な人材がいます',
    body: lines.join('\n'),
  }
}

function displayValue(value: string | null | undefined, fallback: string): string {
  const trimmed = value?.trim()
  return trimmed || fallback
}

function trimTrailingSlash(value: string): string {
  return value.replace(/\/+$/, '')
}
