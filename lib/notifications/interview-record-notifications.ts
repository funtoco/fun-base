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

export type InterviewRecordBatchAnnouncementInput = {
  records: Array<{
    personName?: string | null
    companyName?: string | null
    interviewDate?: string | null
  }>
  appBaseUrl: string
}

export type InterviewRecordEmailInput = {
  title: string
  body: string
  actionUrl: string
  actionLabel?: string
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

export function buildInterviewRecordBatchAnnouncement({
  records,
  appBaseUrl,
}: InterviewRecordBatchAnnouncementInput): {
  title: string
  body: string
  emailBody: string
  actionUrl: string
} {
  if (records.length === 0) {
    throw new Error('At least one interview record is required')
  }

  const count = records.length
  const listUrl = `${trimTrailingSlash(appBaseUrl)}/meetings`
  const summaryLines = count === 1
    ? buildSingleRecordSummary(records[0])
    : buildMultipleRecordSummary(records)
  const emailBody = summaryLines.join('\n')

  return {
    title: `面談記録の追加（${count}件）`,
    body: `${emailBody}\n\n面談一覧：${listUrl}`,
    emailBody,
    actionUrl: listUrl,
  }
}

export function buildInterviewRecordEmail({
  title,
  body,
  actionUrl,
  actionLabel = '面談記録を確認する',
  settingsUrl,
}: InterviewRecordEmailInput): { subject: string; text: string; html: string } {
  const safeTitle = escapeHtml(title)
  const safeActionLabel = escapeHtml(actionLabel)
  const bodyText = `${body}\n\n${actionLabel}：${actionUrl}\n通知設定：${settingsUrl}`
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
          <a href="${escapeAttribute(actionUrl)}" style="display: inline-block; padding: 10px 16px; border-radius: 6px; background: #2563eb; color: #ffffff; text-decoration: none;">${safeActionLabel}</a>
        </p>
        <p style="font-size: 12px; color: #6b7280; margin-top: 24px;">
          このメールはFunBaseの面談通知設定に基づいて送信されています。<br />
          <a href="${escapeAttribute(settingsUrl)}" style="color: #6b7280;">通知設定</a>
        </p>
      </div>
    `.trim(),
  }
}

function buildSingleRecordSummary(record: InterviewRecordBatchAnnouncementInput['records'][number]): string[] {
  return [
    `対象者：${displayValue(record.personName, '対象者名未登録')}`,
    record.interviewDate ? `面談日：${formatInterviewDate(record.interviewDate)}` : null,
    record.companyName ? `法人：${record.companyName}` : null,
  ].filter((line): line is string => line !== null)
}

function buildMultipleRecordSummary(records: InterviewRecordBatchAnnouncementInput['records']): string[] {
  return [
    '対象者：',
    ...records.map((record) => {
      const details = [
        record.interviewDate ? formatInterviewDate(record.interviewDate) : null,
        record.companyName || null,
      ].filter((detail): detail is string => detail !== null)
      const suffix = details.length > 0 ? `（${details.join('・')}）` : ''
      return `・${displayValue(record.personName, '対象者名未登録')}${suffix}`
    }),
  ]
}

function displayValue(value: string | null | undefined, fallback: string): string {
  const trimmed = value?.trim()
  return trimmed || fallback
}

function formatInterviewDate(value: string): string {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value)
  if (!match) return value

  return `${Number(match[1])}年${Number(match[2])}月${Number(match[3])}日`
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
