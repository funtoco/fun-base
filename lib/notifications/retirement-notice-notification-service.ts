import type { SupabaseClient } from '@supabase/supabase-js'

import {
  canAccessPersonByCompany,
  getCompanyAccessForUser,
} from '@/lib/supabase/people-access'
import {
  RETIREMENT_NOTICE_NOTIFICATION_SOURCE_TYPE,
  RETIREMENT_NOTICE_NOTIFICATION_TYPE,
  buildRetirementNoticeAnnouncement,
  getRetirementNoticeNotificationRecipients,
  type RetirementNoticeRecipient,
  type RetirementNoticeRecipientRow,
} from './retirement-notice-notifications'

type RetirementNoticeNotificationInput = {
  supabase: SupabaseClient<any, any, any>
  tenantId: string
  reopenSentIfBefore?: string | null
  person: {
    id: string
    name?: string | null
    company?: string | null
    tenantOfficeId?: string | null
  }
}

type AnnouncementRow = {
  id: string
  title: string
  body: string
}

const PENDING_RETIREMENT_NOTICE_RETRY_AFTER_MS = 15 * 60 * 1000

function createRetirementNoticeClaimToken(): string {
  return `retirement-claim:${Date.now()}:${Math.random().toString(36).slice(2)}`
}

export async function hasRetryableRetirementNoticeNotificationEvent(
  supabase: SupabaseClient<any, any, any>,
  tenantId: string,
  personId: string
): Promise<boolean> {
  const { data, error } = await supabase
    .from('notification_events')
    .select('status, created_at, error_message')
    .eq('tenant_id', tenantId)
    .eq('notification_type', RETIREMENT_NOTICE_NOTIFICATION_TYPE)
    .eq('source_type', RETIREMENT_NOTICE_NOTIFICATION_SOURCE_TYPE)
    .eq('source_id', personId)
    .maybeSingle()

  if (error) throw error
  if (!data) return false
  if (data.status === 'failed') return true
  return data.status === 'pending' && isClaimablePendingRetirementNoticeEvent(data)
}

export async function notifyRetirementNoticeRequired({
  supabase,
  tenantId,
  reopenSentIfBefore,
  person,
}: RetirementNoticeNotificationInput): Promise<void> {
  const eventId = await acquireRetirementNoticeNotificationEvent(
    supabase,
    tenantId,
    person.id,
    createRetirementNoticeClaimToken(),
    reopenSentIfBefore
  )
  if (!eventId) {
    console.log('[notification] retirement-notice:duplicate', {
      tenantId,
      personId: person.id,
    })
    return
  }

  let createdAnnouncement: AnnouncementRow | null = null

  try {
    const recipients = await getRecipients(supabase, tenantId, person.company, person.tenantOfficeId)
    if (recipients.length === 0) {
      await markRetirementNoticeNotificationEventSent(supabase, eventId)
      console.log('[notification] retirement-notice:no-recipients', {
        tenantId,
        personId: person.id,
      })
      return
    }

    const announcement = buildRetirementNoticeAnnouncement({
      personId: person.id,
      personName: person.name,
      companyName: person.company,
      appBaseUrl: getAppBaseUrl(),
    })

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
        recipients.map((recipient) => ({
          announcement_id: createdAnnouncement!.id,
          user_id: recipient.userId,
        }))
      )

    if (recipientInsertError) throw recipientInsertError

    await markRetirementNoticeNotificationEventSent(supabase, eventId)
  } catch (error) {
    if (createdAnnouncement) {
      await supabase.from('announcements').delete().eq('id', createdAnnouncement.id)
    }
    await markRetirementNoticeNotificationEventFailed(supabase, eventId, error)
    throw error
  }

  console.log('[notification] retirement-notice:sent', {
    tenantId,
    personId: person.id,
    announcementId: createdAnnouncement.id,
  })
}

async function getRecipients(
  supabase: SupabaseClient<any, any, any>,
  tenantId: string,
  companyName?: string | null,
  tenantOfficeId?: string | null
): Promise<RetirementNoticeRecipient[]> {
  const { data: members, error: membersError } = await supabase
    .from('user_tenants')
    .select('user_id, status, role')
    .eq('tenant_id', tenantId)

  if (membersError) throw membersError

  const candidates = getRetirementNoticeNotificationRecipients((members || []) as RetirementNoticeRecipientRow[])
  const recipients: RetirementNoticeRecipient[] = []

  for (const candidate of candidates) {
    const access = await getCompanyAccessForUser(supabase, candidate.userId, 'people')
    if (canAccessPersonByCompany({ tenant_id: tenantId, tenant_office_id: tenantOfficeId, company: companyName }, access)) {
      recipients.push(candidate)
    }
  }

  return recipients
}

async function acquireRetirementNoticeNotificationEvent(
  supabase: SupabaseClient<any, any, any>,
  tenantId: string,
  personId: string,
  claimToken: string,
  reopenSentIfBefore?: string | null
): Promise<string | null> {
  const { data, error } = await insertRetirementNoticeNotificationEvent(
    supabase,
    tenantId,
    personId,
    claimToken
  )

  if (!error) return (data as { id: string }).id

  if (!('code' in error) || error.code !== '23505') {
    throw error
  }

  const { data: existing, error: existingError } = await supabase
    .from('notification_events')
    .select('id, status, created_at, error_message, sent_at')
    .eq('tenant_id', tenantId)
    .eq('notification_type', RETIREMENT_NOTICE_NOTIFICATION_TYPE)
    .eq('source_type', RETIREMENT_NOTICE_NOTIFICATION_SOURCE_TYPE)
    .eq('source_id', personId)
    .maybeSingle()

  if (existingError) throw existingError
  if (!existing) return null
  if (existing.status === 'pending') {
    if (!isClaimablePendingRetirementNoticeEvent(existing)) return null

    let claimQuery = supabase
      .from('notification_events')
      .update({ error_message: claimToken })
      .eq('id', existing.id)
      .eq('status', 'pending')
      .lt('created_at', new Date(Date.now() - PENDING_RETIREMENT_NOTICE_RETRY_AFTER_MS).toISOString())

    claimQuery = existing.error_message
      ? claimQuery.eq('error_message', existing.error_message)
      : claimQuery.is('error_message', null)

    const { data: claimedPending, error: claimPendingError } = await claimQuery
      .select('id')
      .maybeSingle()

    if (claimPendingError) throw claimPendingError
    return claimedPending ? (claimedPending as { id: string }).id : null
  }
  if (existing.status === 'sent') {
    if (!reopenSentIfBefore || !existing.sent_at) return null

    const { data: reopenedEvent, error: reopenError } = await supabase
      .from('notification_events')
      .update({ status: 'pending', error_message: claimToken, sent_at: null })
      .eq('id', existing.id)
      .eq('status', 'sent')
      .lt('sent_at', reopenSentIfBefore)
      .select('id')
      .maybeSingle()

    if (reopenError) throw reopenError
    return reopenedEvent ? (reopenedEvent as { id: string }).id : null
  }

  if (existing.status !== 'failed') return null

  const { data: retryEvent, error: retryError } = await supabase
    .from('notification_events')
    .update({ status: 'pending', error_message: claimToken, sent_at: null })
    .eq('id', existing.id)
    .eq('status', 'failed')
    .select('id')
    .maybeSingle()

  if (retryError) throw retryError
  return retryEvent ? (retryEvent as { id: string }).id : null
}

function insertRetirementNoticeNotificationEvent(
  supabase: SupabaseClient<any, any, any>,
  tenantId: string,
  sourceId: string,
  claimToken: string
) {
  return supabase
    .from('notification_events')
    .insert({
      tenant_id: tenantId,
      notification_type: RETIREMENT_NOTICE_NOTIFICATION_TYPE,
      source_type: RETIREMENT_NOTICE_NOTIFICATION_SOURCE_TYPE,
      source_id: sourceId,
      status: 'pending',
      error_message: claimToken,
      sent_at: null,
    })
    .select('id')
    .single()
}

function isClaimablePendingRetirementNoticeEvent({
  created_at: createdAt,
  error_message: errorMessage,
}: {
  created_at?: string | null
  error_message?: string | null
}): boolean {
  if (!createdAt) return false
  const createdAtMs = Date.parse(createdAt)
  if (!Number.isFinite(createdAtMs)) return false
  if (Date.now() - createdAtMs < PENDING_RETIREMENT_NOTICE_RETRY_AFTER_MS) return false
  if (!errorMessage) return true

  const claimParts = errorMessage.split(':')
  if (claimParts[0] !== 'retirement-claim' || !claimParts[1]) return false
  const claimedAtMs = Number(claimParts[1])
  if (!Number.isFinite(claimedAtMs)) return false
  return Date.now() - claimedAtMs >= PENDING_RETIREMENT_NOTICE_RETRY_AFTER_MS
}

async function markRetirementNoticeNotificationEventSent(
  supabase: SupabaseClient<any, any, any>,
  eventId: string
): Promise<void> {
  const { error } = await supabase
    .from('notification_events')
    .update({ status: 'sent', sent_at: new Date().toISOString(), error_message: null })
    .eq('id', eventId)

  if (error) throw error
}

async function markRetirementNoticeNotificationEventFailed(
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
    console.warn('[notification] retirement-notice:event-failed-update-error', {
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

  return 'https://funbase.funtoco.jp'
}

function trimTrailingSlash(value: string): string {
  return value.replace(/\/+$/, '')
}
