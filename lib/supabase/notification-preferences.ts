import { createClient } from './client'
import { INTERVIEW_RECORD_EMAIL_NOTIFICATION_TYPE } from '@/lib/notifications/interview-record-notifications'

export type NotificationPreference = {
  notificationType: string
  enabled: boolean
}

type NotificationPreferenceRow = {
  notification_type: string
  enabled: boolean
}

const DEFAULT_PREFERENCES: NotificationPreference[] = [
  {
    notificationType: INTERVIEW_RECORD_EMAIL_NOTIFICATION_TYPE,
    enabled: false,
  },
]

export async function getNotificationPreferences(): Promise<NotificationPreference[]> {
  const supabase = createClient()
  const { data: userData } = await supabase.auth.getUser()
  if (!userData.user) return DEFAULT_PREFERENCES

  const { data, error } = await supabase
    .from('notification_preferences')
    .select('notification_type, enabled')
    .eq('user_id', userData.user.id)

  if (error) {
    console.error('Error fetching notification preferences:', error)
    return DEFAULT_PREFERENCES
  }

  const rows = (data || []) as NotificationPreferenceRow[]
  const rowByType = new Map(rows.map((row) => [row.notification_type, row]))

  return DEFAULT_PREFERENCES.map((preference) => ({
    ...preference,
    enabled: rowByType.get(preference.notificationType)?.enabled ?? preference.enabled,
  }))
}

export async function updateNotificationPreference(
  notificationType: string,
  enabled: boolean
): Promise<void> {
  const supabase = createClient()
  const { data: userData } = await supabase.auth.getUser()
  if (!userData.user) throw new Error('ログインが必要です')

  const { error } = await supabase
    .from('notification_preferences')
    .upsert(
      {
        user_id: userData.user.id,
        notification_type: notificationType,
        enabled,
        updated_at: new Date().toISOString(),
      },
      { onConflict: 'user_id,notification_type' }
    )

  if (error) {
    console.error('Error updating notification preference:', error)
    throw error
  }
}
