import { beforeEach, describe, expect, it, vi } from 'vitest'

const { getUser, upsert } = vi.hoisted(() => ({
  getUser: vi.fn(),
  upsert: vi.fn(),
}))

vi.mock('./client', () => ({
  createClient: () => ({ auth: { getUser }, from: () => ({ upsert }) }),
}))

import { markAllAnnouncementsAsRead, markAnnouncementAsRead } from './announcements'

describe('お知らせの既読保存', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    getUser.mockResolvedValue({ data: { user: { id: 'user-1' } }, error: null })
    upsert.mockResolvedValue({ error: null })
  })

  it('一括既読を現在のユーザーにだけ保存する', async () => {
    await markAllAnnouncementsAsRead(['a', 'b'])
    expect(upsert).toHaveBeenCalledExactlyOnceWith([
      { announcement_id: 'a', user_id: 'user-1' },
      { announcement_id: 'b', user_id: 'user-1' },
    ], { onConflict: 'announcement_id,user_id' })
  })

  it('未読がない場合は認証も書き込みも行わない', async () => {
    await markAllAnnouncementsAsRead([])
    expect(getUser).not.toHaveBeenCalled()
    expect(upsert).not.toHaveBeenCalled()
  })

  it('ログアウト済みの場合は保存しない', async () => {
    getUser.mockResolvedValue({ data: { user: null }, error: null })
    await expect(markAllAnnouncementsAsRead(['a'])).rejects.toThrow('ログインが必要です')
    expect(upsert).not.toHaveBeenCalled()
  })

  it('認証できない一括既読は失敗として通知する', async () => {
    getUser.mockResolvedValue({ data: { user: null }, error: new Error('auth failed') })
    await expect(markAllAnnouncementsAsRead(['a'])).rejects.toThrow('auth failed')
    expect(upsert).not.toHaveBeenCalled()
  })

  it('一括既読の書き込み失敗を呼び出し元へ伝える', async () => {
    upsert.mockResolvedValue({ error: new Error('write failed') })
    await expect(markAllAnnouncementsAsRead(['a', 'b'])).rejects.toThrow('write failed')
  })

  it('個別既読の書き込み失敗を呼び出し元へ伝える', async () => {
    upsert.mockResolvedValue({ error: new Error('single failed') })
    await expect(markAnnouncementAsRead('a')).rejects.toThrow('single failed')
  })
})
