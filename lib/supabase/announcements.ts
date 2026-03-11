import { createClient } from './client'
import type { Announcement } from '@/lib/models'

/** 公開済みお知らせ一覧を取得 */
export async function getPublishedAnnouncements(): Promise<Announcement[]> {
  const supabase = createClient()

  const { data, error } = await supabase
    .from('announcements')
    .select('*')
    .eq('published', true)
    .order('created_at', { ascending: false })

  if (error) {
    console.error('Error fetching announcements:', error)
    throw error
  }

  return data.map(mapToAnnouncement)
}

/** 全お知らせ一覧を取得（管理者用） */
export async function getAllAnnouncements(): Promise<Announcement[]> {
  const supabase = createClient()

  // admin用 - publishedに関わらず全件取得
  // RLSは published=true のみ許可しているため、service roleが必要
  // ここではclient側で使うので、published=trueのものだけ + 未公開は別途API経由で取得
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

  const { data, error } = await supabase
    .from('announcements')
    .update({
      title: updates.title,
      body: updates.body,
      published: updates.published,
      updated_at: new Date().toISOString(),
    })
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

  return data.map((r: any) => r.announcement_id)
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

function mapToAnnouncement(row: any): Announcement {
  return {
    id: row.id,
    title: row.title,
    body: row.body,
    published: row.published,
    createdBy: row.created_by,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  }
}
