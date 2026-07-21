import type { SupabaseClient } from '@supabase/supabase-js'

import {
  canAccessPersonByCompany,
  getCompanyAccessForUser,
} from '@/lib/supabase/people-access'
import { sendEmail } from './email'
import {
  buildInterviewRecordAnnouncement,
  buildInterviewRecordBatchAnnouncement,
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

const NOTIFICATION_EVENT_UPDATE_CHUNK_SIZE = 100
const PENDING_NOTIFICATION_RETRY_AFTER_MS = 365 * 24 * 60 * 60 * 1000

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

  const eventId = await acquireInterviewNotificationEvent(
    supabase,
    tenantId,
    interviewRecord.id,
    createInterviewNotificationClaimToken()
  )
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

export type InterviewRecordNotificationBatchItem = {
  eventId: string
  claimToken: string
  interviewRecord: InterviewRecordNotificationInput['interviewRecord']
}

export async function prepareInterviewRecordNotificationEvent({
  supabase,
  tenantId,
  interviewRecord,
}: {
  supabase: SupabaseClient<any, any, any>
  tenantId: string
  interviewRecord: InterviewRecordNotificationInput['interviewRecord']
}): Promise<InterviewRecordNotificationBatchItem | null> {
  const claimToken = createInterviewNotificationClaimToken()
  const eventId = await acquireInterviewNotificationEvent(supabase, tenantId, interviewRecord.id, claimToken)
  if (!eventId) {
    console.log('[notification] interview-record:duplicate', {
      tenantId,
      interviewRecordId: interviewRecord.id,
    })
    return null
  }

  return { eventId, claimToken, interviewRecord }
}

export async function notifyInterviewRecordsCreatedBatch({
  supabase,
  tenantId,
  notificationEvents,
}: {
  supabase: SupabaseClient<any, any, any>
  tenantId: string
  notificationEvents: InterviewRecordNotificationBatchItem[]
}): Promise<void> {
  const appBaseUrl = getAppBaseUrl()
  const acquiredEvents = notificationEvents.map(({ eventId, claimToken, interviewRecord }) => ({
    eventId,
    claimToken,
    record: interviewRecord,
  }))

  if (acquiredEvents.length === 0) return

  const noRecipientEventIds: string[] = []
  const undeliveredEventIds = new Set(acquiredEvents.map(({ eventId }) => eventId))
  const groups = new Map<
    string,
    {
      events: Array<{ eventId: string; claimToken: string; record: InterviewRecordNotificationInput['interviewRecord'] }>
      announcementRecipients: InterviewNotificationRecipient[]
      emailRecipients: InterviewNotificationRecipient[]
    }
  >()

  try {
    for (const acquiredEvent of acquiredEvents) {
      const recipients = await getRecipients(supabase, tenantId, {
        personId: acquiredEvent.record.person_id,
        recordType: acquiredEvent.record.record_type,
      })

      if (recipients.announcementRecipients.length === 0) {
        noRecipientEventIds.push(acquiredEvent.eventId)
        continue
      }

      const announcementRecipientKey = recipients.announcementRecipients
        .map((recipient) => recipient.userId)
        .sort()
        .join(',')
      const emailRecipientKey = recipients.emailRecipients
        .map((recipient) => recipient.userId)
        .sort()
        .join(',')
      const key = `${announcementRecipientKey}|${emailRecipientKey}`

      const existingGroup = groups.get(key)
      if (existingGroup) {
        existingGroup.events.push(acquiredEvent)
        mergeRecipients(existingGroup.emailRecipients, recipients.emailRecipients)
      } else {
        groups.set(key, {
          events: [acquiredEvent],
          announcementRecipients: recipients.announcementRecipients,
          emailRecipients: [...recipients.emailRecipients],
        })
      }
    }

    await markInterviewNotificationEventsSent(supabase, noRecipientEventIds)
    for (const eventId of noRecipientEventIds) undeliveredEventIds.delete(eventId)

    if (groups.size === 0) {
      console.log('[notification] interview-record:no-recipients', {
        tenantId,
        interviewRecordCount: acquiredEvents.length,
      })
      return
    }

    for (const group of Array.from(groups.values())) {
      const claimedEvents = await filterClaimedInterviewNotificationEvents(supabase, group.events)
      if (claimedEvents.length === 0) continue

      const announcement = buildInterviewRecordBatchAnnouncement({
        count: claimedEvents.length,
        appBaseUrl,
      })

      let createdAnnouncement: AnnouncementRow | null = null
      try {
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

        if (announcementError) throw announcementError

        createdAnnouncement = announcementRow as AnnouncementRow
        const { error: recipientInsertError } = await supabase
          .from('announcement_recipients')
          .insert(
            group.announcementRecipients.map((recipient) => ({
              announcement_id: createdAnnouncement!.id,
              user_id: recipient.userId,
            }))
          )

        if (recipientInsertError) throw recipientInsertError

        if (group.emailRecipients.length > 0) {
          const announcementUrl = `${appBaseUrl}/announcements?id=${encodeURIComponent(createdAnnouncement.id)}`
          const settingsUrl = `${appBaseUrl}/settings/notifications`
          const email = buildInterviewRecordEmail({
            title: createdAnnouncement.title,
            body: createdAnnouncement.body,
            announcementUrl,
            settingsUrl,
          })

          const emailResults = await Promise.allSettled(
            group.emailRecipients.map((recipient) =>
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
              interviewRecordCount: claimedEvents.length,
              failedEmailCount,
            })
          }
        }
      } catch (error) {
        if (createdAnnouncement) {
          await supabase.from('announcements').delete().eq('id', createdAnnouncement.id)
        }
        await markInterviewNotificationEventsFailed(supabase, claimedEvents.map(({ eventId }) => eventId), error)
        for (const { eventId } of claimedEvents) undeliveredEventIds.delete(eventId)
        continue
      }

      try {
        await markInterviewNotificationEventsSent(supabase, claimedEvents.map(({ eventId }) => eventId))
      } catch (sentUpdateError) {
        console.warn('[notification] interview-record:events-sent-update-error', {
          eventIds: claimedEvents.map(({ eventId }) => eventId),
          error: sentUpdateError instanceof Error ? sentUpdateError.message : String(sentUpdateError),
        })
      }
      for (const { eventId } of claimedEvents) undeliveredEventIds.delete(eventId)

      console.log('[notification] interview-record:batch-sent', {
        tenantId,
        interviewRecordCount: claimedEvents.length,
        announcementRecipientCount: group.announcementRecipients.length,
        emailRecipientCount: group.emailRecipients.length,
      })
    }
  } catch (error) {
    await markInterviewNotificationEventsFailed(supabase, Array.from(undeliveredEventIds), error)
    throw error
  }
}

function mergeRecipients(
  target: InterviewNotificationRecipient[],
  additions: InterviewNotificationRecipient[]
): void {
  const existingUserIds = new Set(target.map((recipient) => recipient.userId))
  for (const recipient of additions) {
    if (existingUserIds.has(recipient.userId)) continue
    target.push(recipient)
    existingUserIds.add(recipient.userId)
  }
}

function createInterviewNotificationClaimToken(): string {
  return `batch-claim:${Date.now()}:${Math.random().toString(36).slice(2)}`
}

async function filterClaimedInterviewNotificationEvents<T extends { eventId: string; claimToken: string }>(
  supabase: SupabaseClient<any, any, any>,
  events: T[]
): Promise<T[]> {
  if (events.length === 0) return []

  const eventsById = new Map(events.map((event) => [event.eventId, event]))
  const claimedEvents: T[] = []

  for (let index = 0; index < events.length; index += NOTIFICATION_EVENT_UPDATE_CHUNK_SIZE) {
    const chunk = events.slice(index, index + NOTIFICATION_EVENT_UPDATE_CHUNK_SIZE)
    const { data, error } = await supabase
      .from('notification_events')
      .select('id, error_message')
      .in('id', chunk.map(({ eventId }) => eventId))

    if (error) throw error

    for (const row of (data || []) as Array<{ id: string; error_message: string | null }>) {
      const event = eventsById.get(row.id)
      if (event && row.error_message === event.claimToken) {
        claimedEvents.push(event)
      }
    }
  }

  return claimedEvents
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
  interviewRecordId: string,
  claimToken: string
): Promise<string | null> {
  const eventPayload = {
    tenant_id: tenantId,
    notification_type: INTERVIEW_RECORD_EMAIL_NOTIFICATION_TYPE,
    source_type: 'interview_record',
    source_id: interviewRecordId,
    status: 'pending',
    error_message: claimToken,
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
    .select('id, status, created_at, error_message')
    .eq('tenant_id', tenantId)
    .eq('notification_type', INTERVIEW_RECORD_EMAIL_NOTIFICATION_TYPE)
    .eq('source_type', 'interview_record')
    .eq('source_id', interviewRecordId)
    .maybeSingle()

  if (existingError) throw existingError
  if (!existing) return null
  if (existing.status === 'pending') {
    const pendingEvent = existing as { id: string; created_at?: string | null; error_message?: string | null }
    if (!isClaimablePendingNotificationEvent(pendingEvent)) return null

    let claimQuery = supabase
      .from('notification_events')
      .update({ error_message: claimToken })
      .eq('id', pendingEvent.id)
      .eq('status', 'pending')
      .lt('created_at', new Date(Date.now() - PENDING_NOTIFICATION_RETRY_AFTER_MS).toISOString())

    claimQuery = pendingEvent.error_message
      ? claimQuery.eq('error_message', pendingEvent.error_message)
      : claimQuery.is('error_message', null)

    const { data: claimedPending, error: claimPendingError } = await claimQuery
      .select('id')
      .maybeSingle()

    if (claimPendingError) throw claimPendingError
    return claimedPending ? (claimedPending as { id: string }).id : null
  }
  if (existing.status !== 'failed') return null

  const { data: retried, error: retryError } = await supabase
    .from('notification_events')
    .update({ status: 'pending', error_message: claimToken, sent_at: null })
    .eq('id', existing.id)
    .eq('status', 'failed')
    .select('id')
    .maybeSingle()

  if (retryError) throw retryError
  return retried ? (retried as { id: string }).id : null
}

function isClaimablePendingNotificationEvent({
  created_at: createdAt,
  error_message: errorMessage,
}: {
  created_at?: string | null
  error_message?: string | null
}): boolean {
  if (!createdAt) return false
  const createdAtMs = Date.parse(createdAt)
  if (!Number.isFinite(createdAtMs)) return false
  if (Date.now() - createdAtMs < PENDING_NOTIFICATION_RETRY_AFTER_MS) return false
  if (!errorMessage) return true

  const claimParts = errorMessage.split(':')
  if (claimParts[0] !== 'batch-claim' || !claimParts[1]) return false
  const claimedAtMs = Number(claimParts[1])
  if (!Number.isFinite(claimedAtMs)) return false
  return Date.now() - claimedAtMs >= PENDING_NOTIFICATION_RETRY_AFTER_MS
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

async function markInterviewNotificationEventsSent(
  supabase: SupabaseClient<any, any, any>,
  eventIds: string[]
): Promise<void> {
  await updateInterviewNotificationEventsInChunks(supabase, eventIds, {
    status: 'sent',
    sent_at: new Date().toISOString(),
    error_message: null,
  })
}

async function markInterviewNotificationEventsFailed(
  supabase: SupabaseClient<any, any, any>,
  eventIds: string[],
  error: unknown
): Promise<void> {
  try {
    await updateInterviewNotificationEventsInChunks(supabase, eventIds, {
      status: 'failed',
      error_message: error instanceof Error ? error.message : String(error),
    })
  } catch (updateError) {
    console.warn('[notification] interview-record:events-failed-update-error', {
      eventIds,
      error: updateError instanceof Error ? updateError.message : String(updateError),
    })
  }
}

async function updateInterviewNotificationEventsInChunks(
  supabase: SupabaseClient<any, any, any>,
  eventIds: string[],
  values: Record<string, unknown>
): Promise<void> {
  if (eventIds.length === 0) return

  for (let index = 0; index < eventIds.length; index += NOTIFICATION_EVENT_UPDATE_CHUNK_SIZE) {
    const chunk = eventIds.slice(index, index + NOTIFICATION_EVENT_UPDATE_CHUNK_SIZE)
    const { error } = await supabase
      .from('notification_events')
      .update(values)
      .in('id', chunk)

    if (error) throw error
  }
}

function getAppBaseUrl(): string {
  const explicitUrl = process.env.NEXT_PUBLIC_APP_URL || process.env.APP_BASE_URL
  if (explicitUrl) return trimTrailingSlash(explicitUrl)

  const vercelUrl = process.env.VERCEL_URL
  if (vercelUrl) return trimTrailingSlash(`https://${vercelUrl}`)

  return 'https://funbase.funtoco.jp'
}

function trimTrailingSlash(value: string): string {
  return value.replace(/\/+$/, '')
}
