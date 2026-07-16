import { describe, expect, test } from 'vitest'

import {
  buildInterviewRecordAnnouncement,
  buildInterviewRecordEmail,
  getInterviewNotificationRecipients,
  shouldNotifyInterviewRecordCreation,
  type InterviewNotificationPreferenceRow,
  type InterviewNotificationRecipientRow,
} from './interview-record-notifications'

describe('interview record notifications', () => {
  test('notifies only when a regular interview record is newly created', () => {
    expect(shouldNotifyInterviewRecordCreation({ existingRecordId: null })).toBe(true)
    expect(shouldNotifyInterviewRecordCreation({ existingRecordId: 'existing-id' })).toBe(false)
    expect(
      shouldNotifyInterviewRecordCreation({
        existingRecordId: null,
        recordType: 'daily_support',
        activityEntries: [{ dai: '生活支援', funbaseVisibility: 'visible' }],
      })
    ).toBe(false)
  })

  test('selects active corporate tenant members and respects opt-out preferences', () => {
    const members: InterviewNotificationRecipientRow[] = [
      { user_id: 'user-1', email: 'owner@example.com', status: 'active', role: 'owner' },
      { user_id: 'user-2', email: 'member@example.com', status: 'active', role: 'member' },
      { user_id: 'user-3', email: 'supporter@funtoco.jp', status: 'active', role: 'supporter' },
      { user_id: 'user-4', email: 'pending@example.com', status: 'pending', role: 'member' },
      { user_id: 'user-5', email: null, status: 'active', role: 'member' },
      { user_id: 'user-6', email: 'restricted@example.com', status: 'active', role: 'member' },
    ]
    const preferences: InterviewNotificationPreferenceRow[] = [
      { user_id: 'user-2', notification_type: 'interview_record_email', enabled: false },
    ]

    expect(getInterviewNotificationRecipients(members, preferences, new Set(['user-1', 'user-2']))).toEqual([
      { userId: 'user-1', email: 'owner@example.com' },
    ])
  })

  test('requires explicit opt-in for email recipients when configured', () => {
    const members: InterviewNotificationRecipientRow[] = [
      { user_id: 'user-1', email: 'owner@example.com', status: 'active', role: 'owner' },
      { user_id: 'user-2', email: 'member@example.com', status: 'active', role: 'member' },
      { user_id: 'user-3', email: 'supporter@example.com', status: 'active', role: 'supporter' },
      { user_id: 'user-4', email: 'suspended@example.com', status: 'suspended', role: 'member' },
    ]
    const preferences: InterviewNotificationPreferenceRow[] = [
      { user_id: 'user-2', notification_type: 'interview_record_email', enabled: true },
      { user_id: 'user-3', notification_type: 'interview_record_email', enabled: true },
      { user_id: 'user-4', notification_type: 'interview_record_email', enabled: true },
    ]

    expect(
      getInterviewNotificationRecipients(members, preferences, new Set(['user-1', 'user-2', 'user-3', 'user-4']), {
        requireOptIn: true,
        enforceActiveCorporateMember: false,
      })
    ).toEqual([
      { userId: 'user-2', email: 'member@example.com' },
      { userId: 'user-3', email: 'supporter@example.com' },
      { userId: 'user-4', email: 'suspended@example.com' },
    ])
  })

  test('builds announcement content with an interview detail link', () => {
    const announcement = buildInterviewRecordAnnouncement({
      id: 'record-1',
      personName: '山田 太郎',
      companyName: '株式会社サンプル',
      interviewDate: '2026-07-15',
      recordType: 'regular_interview',
      supportStaffName: '佐藤',
      appBaseUrl: 'https://funbase.example.com',
    })

    expect(announcement.title).toBe('新しい面談記録が追加されました')
    expect(announcement.body).toContain('面談日: 2026-07-15')
    expect(announcement.body).not.toContain('山田 太郎')
    expect(announcement.body).not.toContain('株式会社サンプル')
    expect(announcement.body).toContain('https://funbase.example.com/interview-records/record-1')
  })

  test('builds email body with notification settings link', () => {
    const email = buildInterviewRecordEmail({
      title: '新しい面談記録が追加されました',
      body: '本文',
      announcementUrl: 'https://funbase.example.com/announcements?id=announcement-1',
      settingsUrl: 'https://funbase.example.com/settings/notifications',
    })

    expect(email.subject).toBe('【FunBase】新しい面談記録が追加されました')
    expect(email.text).toContain('https://funbase.example.com/announcements?id=announcement-1')
    expect(email.text).toContain('通知設定: https://funbase.example.com/settings/notifications')
    expect(email.html).toContain('通知設定')
  })
})
