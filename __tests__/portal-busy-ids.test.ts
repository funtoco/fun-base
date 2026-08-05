import { describe, it, expect } from 'vitest'
import { NO_BUSY, markBusy, clearBusy, isBusy } from '@/lib/portal/busy-ids'

describe('busy-ids: 行ごとの処理中状態', () => {
  it('複数の行を同時に処理中にできる（連続アップロードで前の行の表示が消えない）', () => {
    const busy = markBusy(markBusy(NO_BUSY, 'r1'), 'r2')
    expect(isBusy(busy, 'r1')).toBe(true)
    expect(isBusy(busy, 'r2')).toBe(true)
  })

  it('完了した行だけ解除し、他の行は処理中のまま残る', () => {
    const busy = clearBusy(markBusy(markBusy(NO_BUSY, 'r1'), 'r2'), 'r1')
    expect(isBusy(busy, 'r1')).toBe(false)
    expect(isBusy(busy, 'r2')).toBe(true)
  })

  it('同じ行を二重に開始しても1件として扱う', () => {
    const busy = markBusy(markBusy(NO_BUSY, 'r1'), 'r1')
    expect(busy.size).toBe(1)
  })

  it('処理中でない行の解除は何も壊さない', () => {
    expect(isBusy(clearBusy(NO_BUSY, 'r1'), 'r1')).toBe(false)
  })

  it('毎回新しい Set を返す（React が再描画できるよう参照を変える）', () => {
    const a = markBusy(NO_BUSY, 'r1')
    expect(a).not.toBe(NO_BUSY)
    expect(clearBusy(a, 'r1')).not.toBe(a)
    // 元の状態は書き換えない
    expect(isBusy(NO_BUSY, 'r1')).toBe(false)
    expect(isBusy(a, 'r1')).toBe(true)
  })
})
