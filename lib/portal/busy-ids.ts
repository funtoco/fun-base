// チェックリストの「処理中」状態を行ごとに保持する不変ヘルパ。
// 単一の busyId を共有していると、2件目のアップロードを始めた時点で1件目の表示が消え、
// 1件目が終わった時点で2件目の表示まで消える。行ごとに独立させるための最小の道具。

export type BusyIds = ReadonlySet<string>

/** 処理中の行が無い初期状態。 */
export const NO_BUSY: BusyIds = new Set<string>()

/** 行を処理中にする（元の状態は変更せず、新しい Set を返す）。 */
export function markBusy(prev: BusyIds, id: string): BusyIds {
  const next = new Set(prev)
  next.add(id)
  return next
}

/** 行の処理中を解除する（他の行はそのまま）。 */
export function clearBusy(prev: BusyIds, id: string): BusyIds {
  const next = new Set(prev)
  next.delete(id)
  return next
}

/** その行が処理中か。 */
export function isBusy(busy: BusyIds, id: string): boolean {
  return busy.has(id)
}
