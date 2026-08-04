import { describe, expect, test } from 'vitest'

import {
  RETIREMENT_NOTICE_NOTIFICATION_SOURCE_TYPE,
  buildRetirementNoticeAnnouncement,
  getRetirementNoticeNotificationRecipients,
  shouldNotifyRetirementStatusChange,
  type RetirementNoticeRecipientRow,
} from './retirement-notice-notifications'

describe('retirement notice notifications', () => {
  test('triggers only when an existing person transitions to retired', () => {
    expect(
      shouldNotifyRetirementStatusChange({
        existingPerson: { id: 'person-1', working_status: '在籍中' },
        nextWorkingStatus: '退職',
      })
    ).toBe(true)

    expect(
      shouldNotifyRetirementStatusChange({
        existingPerson: null,
        nextWorkingStatus: '退職',
      })
    ).toBe(false)
    expect(
      shouldNotifyRetirementStatusChange({
        existingPerson: { id: 'person-1', working_status: '退職' },
        nextWorkingStatus: '退職',
      })
    ).toBe(false)
    expect(
      shouldNotifyRetirementStatusChange({
        existingPerson: { id: 'person-1', working_status: '在籍中' },
        nextWorkingStatus: '在籍中',
      })
    ).toBe(false)
  })

  test('selects active corporate tenant members for in-app announcements', () => {
    const members: RetirementNoticeRecipientRow[] = [
      { user_id: 'owner-1', status: 'active', role: 'owner' },
      { user_id: 'member-1', status: 'active', role: 'member' },
      { user_id: 'supporter-1', status: 'active', role: 'supporter' },
      { user_id: 'pending-1', status: 'pending', role: 'member' },
      { user_id: null, status: 'active', role: 'member' },
    ]

    expect(getRetirementNoticeNotificationRecipients(members)).toEqual([
      { userId: 'owner-1' },
      { userId: 'member-1' },
    ])
  })

  test('builds an announcement pointing to the person retirement notice entrypoint', () => {
    const announcement = buildRetirementNoticeAnnouncement({
      personId: 'person 1',
      personName: '山田 太郎',
      companyName: '株式会社サンプル',
      appBaseUrl: 'https://funbase.example.com/',
    })

    expect(RETIREMENT_NOTICE_NOTIFICATION_SOURCE_TYPE).toBe('person_retirement')
    expect(announcement.title).toBe('退職届出が必要な人材がいます')
    expect(announcement.body).toContain('対象者：山田 太郎')
    expect(announcement.body).toContain('所属先：株式会社サンプル')
    expect(announcement.body).toContain('https://funbase.example.com/people/person%201/retirement-notice')
  })
})
