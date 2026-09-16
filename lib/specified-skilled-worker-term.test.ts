import { describe, expect, test } from 'vitest'

import { formatSpecifiedSkilledWorkerRemainingTerm } from './specified-skilled-worker-term'

describe('特定技能1号の残り期間表示', () => {
  test('年と月、および5年期限の目安月を表示する', () => {
    expect(formatSpecifiedSkilledWorkerRemainingTerm(27, new Date('2026-09-04T00:00:00+09:00'))).toBe(
      '残り2年3か月（5年期限の目安: 2028年12月）',
    )
  })

  test('1年未満は月数だけを表示する', () => {
    expect(formatSpecifiedSkilledWorkerRemainingTerm(8, new Date('2026-09-04T00:00:00+09:00'))).toBe(
      '残り8か月（5年期限の目安: 2027年5月）',
    )
  })

  test('残り0か月は期限到達として表示する', () => {
    expect(formatSpecifiedSkilledWorkerRemainingTerm(0, new Date('2026-09-04T00:00:00+09:00'))).toBe(
      '通算5年に到達',
    )
  })

  test('負の値は超過月数を表示する', () => {
    expect(formatSpecifiedSkilledWorkerRemainingTerm(-2, new Date('2026-09-04T00:00:00+09:00'))).toBe(
      '通算5年を2か月超過',
    )
  })

  test('未入力や不正な値は表示しない', () => {
    expect(formatSpecifiedSkilledWorkerRemainingTerm(undefined, new Date('2026-09-04T00:00:00+09:00'))).toBeNull()
    expect(formatSpecifiedSkilledWorkerRemainingTerm(Number.NaN, new Date('2026-09-04T00:00:00+09:00'))).toBeNull()
  })
})
