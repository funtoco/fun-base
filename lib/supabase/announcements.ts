import { createClient } from './client'
import type { Announcement } from '@/lib/models'

/** DBのannouncementsテーブルの行型 */
interface AnnouncementRow {
  id: string
  title: string
  body: string
  published: boolean
  created_by: string | null
  created_at: string
  updated_at: string
}

type SupabaseLikeError = {
  code?: string
  message?: string
  details?: string
  hint?: string
}

function isMissingAnnouncementScopeSchemaError(error: SupabaseLikeError | null | undefined): boolean {
  const text = [error?.code, error?.message, error?.details, error?.hint]
    .filter(Boolean)
    .join(' ')
    .toLowerCase()

  return (
    text.includes('tenant_id') ||
    text.includes('announcement_recipients') ||
    text.includes('relationship') ||
    text.includes('schema cache')
  )
}

/** 公開済みお知らせ一覧を取得 */
export async function getPublishedAnnouncements(): Promise<Announcement[]> {
  const supabase = createClient()
  const { data: userData } = await supabase.auth.getUser()

  let { data: globalData, error: globalError } = await supabase
    .from('announcements')
    .select('*')
    .eq('published', true)
    .is('tenant_id', null)
    .order('created_at', { ascending: false })

  if (globalError && isMissingAnnouncementScopeSchemaError(globalError)) {
    console.warn('Announcement recipient schema is not deployed yet; falling back to global announcements only')
    const fallback = await supabase
      .from('announcements')
      .select('*')
      .eq('published', true)
      .order('created_at', { ascending: false })
    globalData = fallback.data
    globalError = fallback.error
  }

  if (globalError) {
    console.error('Error fetching global announcements:', globalError)
    throw globalError
  }

  let targetedData: AnnouncementRow[] = []
  if (userData.user) {
    const { data, error } = await supabase
      .from('announcements')
      .select('*, announcement_recipients!inner(user_id)')
      .eq('published', true)
      .eq('announcement_recipients.user_id', userData.user.id)
      .order('created_at', { ascending: false })

    if (error) {
      if (isMissingAnnouncementScopeSchemaError(error)) {
        console.warn('Announcement recipients are not deployed yet; skipping targeted announcements')
      } else {
        console.error('Error fetching targeted announcements:', error)
        throw error
      }
    } else {
      targetedData = (data || []) as unknown as AnnouncementRow[]
    }
  }

  const byId = new Map<string, Announcement>()
  ;[...(globalData || []), ...targetedData]
    .map((row) => mapToAnnouncement(row as AnnouncementRow))
    .forEach((announcement) => byId.set(announcement.id, announcement))

  return Array.from(byId.values()).sort(
    (a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()
  )
}

/**
 * 全お知らせ一覧を取得（管理者用）
 * NOTE: RLSで published=true のみ許可しているため、
 * ブラウザクライアント経由では公開済みのお知らせのみ返される。
 * 未公開お知らせの取得が必要な場合は、サーバーサイドAPIで createAdminClient() を使用すること。
 */
export async function getAllAnnouncements(): Promise<Announcement[]> {
  const supabase = createClient()

  const { data, error } = await supabase
    .from('announcements')
    .select('*')
    .order('created_at', { ascending: false })

  if (error) {
    console.error('Error fetching all announcements:', error)
    throw error
  }

  return data.map(mapToAnnouncement)
}

/** お知らせを作成 */
export async function createAnnouncement(
  announcement: Pick<Announcement, 'title' | 'body' | 'published'>
): Promise<Announcement> {
  const supabase = createClient()

  const { data: userData } = await supabase.auth.getUser()

  const { data, error } = await supabase
    .from('announcements')
    .insert({
      title: announcement.title,
      body: announcement.body,
      published: announcement.published,
      created_by: userData.user?.id,
    })
    .select()
    .single()

  if (error) {
    console.error('Error creating announcement:', error)
    throw error
  }

  return mapToAnnouncement(data)
}

/** お知らせを更新 */
export async function updateAnnouncement(
  id: string,
  updates: Partial<Pick<Announcement, 'title' | 'body' | 'published'>>
): Promise<Announcement> {
  const supabase = createClient()

  // undefinedのフィールドを除外してNULL上書きを防ぐ
  const updateData: Record<string, unknown> = {
    updated_at: new Date().toISOString(),
  }
  if (updates.title !== undefined) updateData.title = updates.title
  if (updates.body !== undefined) updateData.body = updates.body
  if (updates.published !== undefined) updateData.published = updates.published

  const { data, error } = await supabase
    .from('announcements')
    .update(updateData)
    .eq('id', id)
    .select()
    .single()

  if (error) {
    console.error('Error updating announcement:', error)
    throw error
  }

  return mapToAnnouncement(data)
}

/** お知らせを削除 */
export async function deleteAnnouncement(id: string): Promise<void> {
  const supabase = createClient()

  const { error } = await supabase
    .from('announcements')
    .delete()
    .eq('id', id)

  if (error) {
    console.error('Error deleting announcement:', error)
    throw error
  }
}

/*
 * 既読管理系の関数（getReadAnnouncementIds, markAnnouncementAsRead, markAllAnnouncementsAsRead）は
 * 非クリティカルな機能のため、エラー時はログ出力のみでthrowしない。
 * 失敗しても既読状態が一時的に不整合になるだけでUXへの影響は軽微。
 */

/** ユーザーの既読お知らせIDリストを取得 */
export async function getReadAnnouncementIds(): Promise<string[]> {
  const supabase = createClient()

  const { data, error } = await supabase
    .from('announcement_reads')
    .select('announcement_id')

  if (error) {
    console.error('Error fetching read announcements:', error)
    return []
  }

  return data.map((r: { announcement_id: string }) => r.announcement_id)
}

/** お知らせを既読にする */
export async function markAnnouncementAsRead(announcementId: string): Promise<void> {
  const supabase = createClient()

  const { data: userData } = await supabase.auth.getUser()
  if (!userData.user) return

  const { error } = await supabase
    .from('announcement_reads')
    .upsert(
      {
        announcement_id: announcementId,
        user_id: userData.user.id,
      },
      { onConflict: 'announcement_id,user_id' }
    )

  if (error) {
    console.error('Error marking announcement as read:', error)
  }
}

/** 全お知らせを既読にする */
export async function markAllAnnouncementsAsRead(announcementIds: string[]): Promise<void> {
  const supabase = createClient()

  const { data: userData } = await supabase.auth.getUser()
  if (!userData.user || announcementIds.length === 0) return

  const records = announcementIds.map(id => ({
    announcement_id: id,
    user_id: userData.user!.id,
  }))

  const { error } = await supabase
    .from('announcement_reads')
    .upsert(records, { onConflict: 'announcement_id,user_id' })

  if (error) {
    console.error('Error marking all announcements as read:', error)
  }
}

function mapToAnnouncement(row: AnnouncementRow): Announcement {
  return {
    id: row.id,
    title: row.title,
    body: row.body,
    published: row.published,
    createdBy: row.created_by ?? undefined,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  }
}
