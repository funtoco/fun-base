export const INTERVIEW_RECORD_EMAIL_NOTIFICATION_TYPE = 'interview_record_email'

type UserTenantRole = 'owner' | 'admin' | 'member' | 'guest' | 'supporter' | string
type UserTenantStatus = 'active' | 'pending' | 'suspended' | string

export type InterviewNotificationRecipientRow = {
  user_id: string | null
  email: string | null
  status: UserTenantStatus
  role: UserTenantRole
}

export type InterviewNotificationPreferenceRow = {
  user_id: string | null
  notification_type: string
  enabled: boolean
}

export type InterviewNotificationRecipient = {
  userId: string
  email: string
}

export type InterviewRecordAnnouncementInput = {
  id: string
  personName?: string | null
  companyName?: string | null
  interviewDate?: string | null
  recordType?: string | null
  supportStaffName?: string | null
  appBaseUrl: string
}

export type InterviewRecordEmailInput = {
  title: string
  body: string
  announcementUrl: string
  settingsUrl: string
}

export function shouldNotifyInterviewRecordCreation({
  existingRecordId,
  recordType,
}: {
  existingRecordId?: string | null
  recordType?: string | null
  activityEntries?: unknown[] | null
  previousActivityEntries?: unknown[] | null
}): boolean {
  if (recordType === 'daily_support') return false

  return !existingRecordId
}

export function getInterviewNotificationRecipients(
  members: InterviewNotificationRecipientRow[],
  preferences: InterviewNotificationPreferenceRow[] = [],
  accessibleUserIds?: Set<string>,
  options: { requireOptIn?: boolean; enforceActiveCorporateMember?: boolean } = {}
): InterviewNotificationRecipient[] {
  const enforceActiveCorporateMember = options.enforceActiveCorporateMember ?? true
  const enabledPreferenceUserIds = new Set(
    preferences
      .filter(
        (preference) =>
          preference.notification_type === INTERVIEW_RECORD_EMAIL_NOTIFICATION_TYPE &&
          preference.enabled === true &&
          preference.user_id
      )
      .map((preference) => preference.user_id as string)
  )
  const disabledPreferenceUserIds = new Set(
    preferences
      .filter(
        (preference) =>
          preference.notification_type === INTERVIEW_RECORD_EMAIL_NOTIFICATION_TYPE &&
          preference.enabled === false &&
          preference.user_id
      )
      .map((preference) => preference.user_id as string)
  )

  const seenEmails = new Set<string>()

  return members.reduce<InterviewNotificationRecipient[]>((recipients, member) => {
    if (!member.user_id || !member.email) return recipients
    if (accessibleUserIds && !accessibleUserIds.has(member.user_id)) return recipients
    if (enforceActiveCorporateMember && member.status !== 'active') return recipients
    if (enforceActiveCorporateMember && member.role === 'supporter') return recipients
    if (options.requireOptIn && !enabledPreferenceUserIds.has(member.user_id)) return recipients
    if (!options.requireOptIn && disabledPreferenceUserIds.has(member.user_id)) return recipients

    const normalizedEmail = member.email.trim().toLowerCase()
    if (!normalizedEmail || seenEmails.has(normalizedEmail)) return recipients

    seenEmails.add(normalizedEmail)
    recipients.push({ userId: member.user_id, email: normalizedEmail })
    return recipients
  }, [])
}

export function buildInterviewRecordAnnouncement({
  id,
  personName,
  companyName,
  interviewDate,
  recordType,
  supportStaffName,
  appBaseUrl,
}: InterviewRecordAnnouncementInput): { title: string; body: string } {
  const detailUrl = `${trimTrailingSlash(appBaseUrl)}/interview-records/${encodeURIComponent(id)}`
  const recordTypeLabel = recordType === 'daily_support' ? '日々の面談' : '定期面談'
  const lines = [
    '新しい面談記録がFunBaseに追加されました。',
    '',
    `種別: ${recordTypeLabel}`,
    interviewDate ? `面談日: ${interviewDate}` : null,
    '',
    `詳細: ${detailUrl}`,
  ].filter((line): line is string => line !== null)

  return {
    title: '新しい面談記録が追加されました',
    body: lines.join('\n'),
  }
}

export function buildInterviewRecordEmail({
  title,
  body,
  announcementUrl,
  settingsUrl,
}: InterviewRecordEmailInput): { subject: string; text: string; html: string } {
  const safeTitle = escapeHtml(title)
  const bodyText = `${body}\n\nFunBaseで確認: ${announcementUrl}\n通知設定: ${settingsUrl}`
  const htmlBody = body
    .split('\n')
    .map((line) => escapeHtml(line))
    .join('<br />')

  return {
    subject: `【FunBase】${title}`,
    text: bodyText,
    html: `
      <div style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif; line-height: 1.7; color: #111827;">
        <h2 style="font-size: 18px; margin: 0 0 16px;">${safeTitle}</h2>
        <p>${htmlBody}</p>
        <p style="margin-top: 24px;">
          <a href="${escapeAttribute(announcementUrl)}" style="color: #2563eb;">FunBaseで確認する</a>
        </p>
        <p style="font-size: 12px; color: #6b7280; margin-top: 24px;">
          このメールはFunBaseの面談通知設定に基づいて送信されています。<br />
          <a href="${escapeAttribute(settingsUrl)}" style="color: #6b7280;">通知設定</a>
        </p>
      </div>
    `.trim(),
  }
}

function trimTrailingSlash(value: string): string {
  return value.replace(/\/+$/, '')
}

function escapeHtml(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;')
}

function escapeAttribute(value: string): string {
  return escapeHtml(value)
}
