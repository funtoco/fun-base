import { describe, expect, it } from 'vitest'
import { announceAnnouncementsRead, listenForAnnouncementsRead } from './announcements-read-event'

describe('お知らせ既読の画面間同期', () => {
  it('同じユーザーの成功したIDだけを合流し、新着と同時操作の既読を残す', () => {
    const target = new EventTarget()
    let current = ['already-read', 'concurrent-read']
    const stop = listenForAnnouncementsRead(target, 'user-1', ids => {
      current = [...new Set([...current, ...ids])]
    })
    announceAnnouncementsRead(target, 'user-1', ['a'])
    announceAnnouncementsRead(target, 'user-2', ['secret'])
    expect(current).toEqual(['already-read', 'concurrent-read', 'a'])
    stop()
    announceAnnouncementsRead(target, 'user-1', ['after-cleanup'])
    expect(current).not.toContain('after-cleanup')
  })
})
