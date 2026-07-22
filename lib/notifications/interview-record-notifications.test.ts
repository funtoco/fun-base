import { describe, expect, test } from 'vitest'

import {
  buildInterviewRecordAnnouncement,
  buildInterviewRecordBatchAnnouncement,
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

  test('builds a concise notification with the person for a single interview record', () => {
    const announcement = buildInterviewRecordBatchAnnouncement({
      records: [{
        personName: '山田 太郎',
        companyName: '株式会社サンプル',
        interviewDate: '2026-07-15',
      }],
      appBaseUrl: 'https://funbase.example.com/',
    })

    expect(announcement.title).toBe('面談記録の追加（1件）')
    expect(announcement.emailBody).toBe([
      '対象者：山田 太郎',
      '面談日：2026年7月15日',
      '法人：株式会社サンプル',
    ].join('\n'))
    expect(announcement.body).toContain('面談一覧：https://funbase.example.com/meetings')
    expect(announcement.emailBody).not.toContain('新しい面談記録')
    expect(announcement.emailBody).not.toContain('https://')
    expect(announcement.body).not.toContain('interview-records/')
  })

  test('lists every person for a multi-record notification', () => {
    const announcement = buildInterviewRecordBatchAnnouncement({
      records: Array.from({ length: 7 }, (_, index) => ({
        personName: `対象者 ${index + 1}`,
        companyName: '株式会社サンプル',
        interviewDate: `2026-07-${String(index + 1).padStart(2, '0')}`,
      })),
      appBaseUrl: 'https://funbase.example.com',
    })

    expect(announcement.title).toBe('面談記録の追加（7件）')
    expect(announcement.emailBody).toContain('・対象者 1（2026年7月1日・株式会社サンプル）')
    expect(announcement.emailBody).toContain('・対象者 5（2026年7月5日・株式会社サンプル）')
    expect(announcement.emailBody).toContain('・対象者 6（2026年7月6日・株式会社サンプル）')
    expect(announcement.emailBody).toContain('・対象者 7（2026年7月7日・株式会社サンプル）')
    expect(announcement.emailBody).not.toContain('ほか')
  })

  test('builds email body with notification settings link', () => {
    const email = buildInterviewRecordEmail({
      title: '面談記録の追加（1件）',
      body: '対象者：山田 太郎\n面談日：2026年7月15日',
      actionUrl: 'https://funbase.example.com/meetings',
      settingsUrl: 'https://funbase.example.com/settings/notifications',
    })

    expect(email.subject).toBe('【FunBase】面談記録の追加（1件）')
    expect(email.text).toContain('対象者：山田 太郎')
    expect(email.text).toContain('面談記録を確認する：https://funbase.example.com/meetings')
    expect(email.text).toContain('通知設定：https://funbase.example.com/settings/notifications')
    expect(email.html).toContain('対象者：山田 太郎')
    expect(email.html).toContain('background: #2563eb')
    expect(email.html).toContain('通知設定')
  })
})
