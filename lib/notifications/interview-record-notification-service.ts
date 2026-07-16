import type { SupabaseClient } from '@supabase/supabase-js'

import {
  canAccessPersonByCompany,
  getCompanyAccessForUser,
} from '@/lib/supabase/people-access'
import { sendEmail } from './email'
import {
  buildInterviewRecordAnnouncement,
  buildInterviewRecordEmail,
  getInterviewNotificationRecipients,
  INTERVIEW_RECORD_EMAIL_NOTIFICATION_TYPE,
  type InterviewNotificationPreferenceRow,
  type InterviewNotificationRecipient,
  type InterviewNotificationRecipientRow,
} from './interview-record-notifications'

type InterviewRecordNotificationInput = {
  supabase: SupabaseClient<any, any, any>
  tenantId: string
  interviewRecord: {
    id: string
    person_id: string
    person_name?: string | null
    company_name?: string | null
    interview_date?: string | null
    record_type?: string | null
    support_staff_name?: string | null
  }
}

type AnnouncementRow = {
  id: string
  title: string
  body: string
}

type InterviewNotificationRecipients = {
  announcementRecipients: InterviewNotificationRecipient[]
  emailRecipients: InterviewNotificationRecipient[]
}

export async function notifyInterviewRecordCreated({
  supabase,
  tenantId,
  interviewRecord,
}: InterviewRecordNotificationInput): Promise<void> {
  const appBaseUrl = getAppBaseUrl()

  const announcement = buildInterviewRecordAnnouncement({
    id: interviewRecord.id,
    personName: interviewRecord.person_name,
    companyName: interviewRecord.company_name,
    interviewDate: interviewRecord.interview_date,
    recordType: interviewRecord.record_type,
    supportStaffName: interviewRecord.support_staff_name,
    appBaseUrl,
  })

  const eventId = await acquireInterviewNotificationEvent(supabase, tenantId, interviewRecord.id)
  if (!eventId) {
    console.log('[notification] interview-record:duplicate', {
      tenantId,
      interviewRecordId: interviewRecord.id,
    })
    return
  }

  let createdAnnouncement: AnnouncementRow | null = null
  let announcementRecipients: InterviewNotificationRecipient[] = []
  let emailRecipients: InterviewNotificationRecipient[] = []

  try {
    const recipients = await getRecipients(supabase, tenantId, {
      personId: interviewRecord.person_id,
      recordType: interviewRecord.record_type,
    })
    announcementRecipients = recipients.announcementRecipients
    emailRecipients = recipients.emailRecipients

    if (announcementRecipients.length === 0) {
      await markInterviewNotificationEventSent(supabase, eventId)
      console.log('[notification] interview-record:no-recipients', {
        tenantId,
        interviewRecordId: interviewRecord.id,
      })
      return
    }

    const { data: announcementRow, error: announcementError } = await supabase
      .from('announcements')
      .insert({
        title: announcement.title,
        body: announcement.body,
        published: true,
        tenant_id: tenantId,
        created_by: null,
      })
      .select('id, title, body')
      .single()

    if (announcementError) {
      throw announcementError
    }

    createdAnnouncement = announcementRow as AnnouncementRow
    const { error: recipientInsertError } = await supabase
      .from('announcement_recipients')
      .insert(
        announcementRecipients.map((recipient) => ({
          announcement_id: createdAnnouncement!.id,
          user_id: recipient.userId,
        }))
      )

    if (recipientInsertError) {
      throw recipientInsertError
    }
    if (emailRecipients.length > 0 && createdAnnouncement) {
      const announcementUrl = `${appBaseUrl}/announcements?id=${encodeURIComponent(createdAnnouncement.id)}`
      const settingsUrl = `${appBaseUrl}/settings/notifications`
      const email = buildInterviewRecordEmail({
        title: createdAnnouncement.title,
        body: createdAnnouncement.body,
        announcementUrl,
        settingsUrl,
      })

      const emailResults = await Promise.allSettled(
        emailRecipients.map((recipient) =>
          sendEmail({
            to: recipient.email,
            subject: email.subject,
            text: email.text,
            html: email.html,
          })
        )
      )

      const failedEmailCount = emailResults.filter((result) => result.status === 'rejected').length
      if (failedEmailCount > 0) {
        console.warn('[notification] interview-record:email-partial-failure', {
          tenantId,
          interviewRecordId: interviewRecord.id,
          failedEmailCount,
        })
      }
    }
  } catch (error) {
    if (createdAnnouncement) {
      await supabase.from('announcements').delete().eq('id', createdAnnouncement.id)
    }
    await markInterviewNotificationEventFailed(supabase, eventId, error)
    throw error
  }

  await markInterviewNotificationEventSent(supabase, eventId)

  console.log('[notification] interview-record:sent', {
    tenantId,
    interviewRecordId: interviewRecord.id,
    announcementId: createdAnnouncement.id,
    announcementRecipientCount: announcementRecipients.length,
    emailRecipientCount: emailRecipients.length,
  })
}

async function getRecipients(
  supabase: SupabaseClient<any, any, any>,
  tenantId: string,
  record: { personId: string; recordType?: string | null }
): Promise<InterviewNotificationRecipients> {
  const emptyRecipients = { announcementRecipients: [], emailRecipients: [] }
  const { data: members, error: membersError } = await supabase
    .from('user_tenants')
    .select('user_id, email, status, role')
    .eq('tenant_id', tenantId)

  if (membersError) throw membersError

  const memberRows = (members || []) as InterviewNotificationRecipientRow[]
  const userIds = memberRows
    .map((member) => member.user_id)
    .filter((userId): userId is string => Boolean(userId))

  if (userIds.length === 0) return emptyRecipients

  const accessibleUserIds = await getAccessibleUserIdsForInterviewRecord(supabase, userIds, record)
  if (accessibleUserIds.size === 0) return emptyRecipients

  const announcementRecipients = getInterviewNotificationRecipients(
    memberRows,
    [],
    accessibleUserIds
  )

  const { data: preferences, error: preferencesError } = await supabase
    .from('notification_preferences')
    .select('user_id, notification_type, enabled')
    .in('user_id', userIds)
    .eq('notification_type', INTERVIEW_RECORD_EMAIL_NOTIFICATION_TYPE)

  if (preferencesError) throw preferencesError

  const emailRecipients = getInterviewNotificationRecipients(
    memberRows,
    (preferences || []) as InterviewNotificationPreferenceRow[],
    accessibleUserIds,
    { requireOptIn: true, enforceActiveCorporateMember: false }
  )

  return { announcementRecipients, emailRecipients }
}

async function getAccessibleUserIdsForInterviewRecord(
  supabase: SupabaseClient<any, any, any>,
  userIds: string[],
  record: { personId: string; recordType?: string | null }
): Promise<Set<string>> {
  const feature = record.recordType === 'daily_support' ? 'support_actions' : 'meetings'
  const { data: person, error: personError } = await supabase
    .from('people')
    .select('id, tenant_id, company')
    .eq('id', record.personId)
    .maybeSingle()

  if (personError) throw personError
  if (!person) return new Set()

  const results = await Promise.all(
    userIds.map(async (userId) => {
      try {
        const access = await getCompanyAccessForUser(supabase, userId, feature)
        return canAccessPersonByCompany(person, access) ? userId : null
      } catch (error) {
        console.warn('[notification] interview-record:access-check-error', {
          userId,
          personId: record.personId,
          error: error instanceof Error ? error.message : error,
        })
        return null
      }
    })
  )

  return new Set(results.filter((userId): userId is string => Boolean(userId)))
}

async function acquireInterviewNotificationEvent(
  supabase: SupabaseClient<any, any, any>,
  tenantId: string,
  interviewRecordId: string
): Promise<string | null> {
  const eventPayload = {
    tenant_id: tenantId,
    notification_type: INTERVIEW_RECORD_EMAIL_NOTIFICATION_TYPE,
    source_type: 'interview_record',
    source_id: interviewRecordId,
    status: 'pending',
    error_message: null,
    sent_at: null,
  }

  const { data, error } = await supabase
    .from('notification_events')
    .insert(eventPayload)
    .select('id')
    .single()

  if (!error) return (data as { id: string }).id

  if (!('code' in error) || error.code !== '23505') {
    throw error
  }

  const { data: existing, error: existingError } = await supabase
    .from('notification_events')
    .select('id, status')
    .eq('tenant_id', tenantId)
    .eq('notification_type', INTERVIEW_RECORD_EMAIL_NOTIFICATION_TYPE)
    .eq('source_type', 'interview_record')
    .eq('source_id', interviewRecordId)
    .maybeSingle()

  if (existingError) throw existingError
  if (!existing || existing.status !== 'failed') return null

  const { data: retried, error: retryError } = await supabase
    .from('notification_events')
    .update({ status: 'pending', error_message: null, sent_at: null })
    .eq('id', existing.id)
    .eq('status', 'failed')
    .select('id')
    .maybeSingle()

  if (retryError) throw retryError
  return retried ? (retried as { id: string }).id : null
}

async function markInterviewNotificationEventSent(
  supabase: SupabaseClient<any, any, any>,
  eventId: string
): Promise<void> {
  const { error } = await supabase
    .from('notification_events')
    .update({ status: 'sent', sent_at: new Date().toISOString(), error_message: null })
    .eq('id', eventId)

  if (error) throw error
}

async function markInterviewNotificationEventFailed(
  supabase: SupabaseClient<any, any, any>,
  eventId: string,
  error: unknown
): Promise<void> {
  const { error: updateError } = await supabase
    .from('notification_events')
    .update({
      status: 'failed',
      error_message: error instanceof Error ? error.message : String(error),
    })
    .eq('id', eventId)

  if (updateError) {
    console.warn('[notification] interview-record:event-failed-update-error', {
      eventId,
      error: updateError.message,
    })
  }
}

function getAppBaseUrl(): string {
  const explicitUrl = process.env.NEXT_PUBLIC_APP_URL || process.env.APP_BASE_URL
  if (explicitUrl) return trimTrailingSlash(explicitUrl)

  const vercelUrl = process.env.VERCEL_URL
  if (vercelUrl) return trimTrailingSlash(`https://${vercelUrl}`)

  return 'http://localhost:3000'
}

function trimTrailingSlash(value: string): string {
  return value.replace(/\/+$/, '')
}
