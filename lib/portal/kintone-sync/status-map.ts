import { CASE_STATUS_LABELS, type CaseStatus } from '@/lib/portal/types'

// FunBase の CaseStatus ⇄ kintone「就労_ビザ案件管理」(app296) プロセス管理ラベルの対応。
// app296 の6状態ラベルは CASE_STATUS_LABELS の6状態と完全一致（下書き/書類収集中/確認中/
// 申請準備完了/連携済み/完了）。archived は kintone 側に対応状態が無い（FunBase 内部専用）。

/** kintone に対応するラベルへ変換。archived や未対応は null。 */
export function caseStatusToKintoneLabel(status: CaseStatus): string | null {
  if (status === 'archived') {
    return null
  }
  return CASE_STATUS_LABELS[status] ?? null
}

// ラベル → CaseStatus の逆引き（archived を除く6状態）。
const LABEL_TO_STATUS: Record<string, CaseStatus> = (
  Object.entries(CASE_STATUS_LABELS) as [CaseStatus, string][]
).reduce<Record<string, CaseStatus>>((acc, [status, label]) => {
  if (status !== 'archived') {
    acc[label] = status
  }
  return acc
}, {})

/** kintone プロセス管理ラベル → CaseStatus。未知ラベルは null。 */
export function kintoneLabelToCaseStatus(label: string): CaseStatus | null {
  return LABEL_TO_STATUS[label] ?? null
}

// app296 プロセス管理の「実行アクション名」（Phase1 でアプリ作成時に設定済み）。
// kintone のステータス遷移はターゲット状態ではなくアクション名で行う。
const STATUS_ACTIONS: { from: CaseStatus; to: CaseStatus; action: string }[] = [
  { from: 'draft', to: 'collecting', action: '提出開始' },
  { from: 'collecting', to: 'reviewing', action: '確認へ' },
  { from: 'reviewing', to: 'ready', action: '準備完了へ' },
  { from: 'ready', to: 'synced', action: 'kintone連携' },
  { from: 'synced', to: 'completed', action: '完了' },
]

/** 隣接する前進遷移のアクション名を返す。非隣接/後退/未対応は null。 */
export function resolveStatusAction(
  from: CaseStatus,
  to: CaseStatus
): string | null {
  return STATUS_ACTIONS.find((a) => a.from === from && a.to === to)?.action ?? null
}

/**
 * from → to（前進）を1手ずつ辿るアクション名の列を返す。
 * to が from より前 / どちらかが archived / 経路が無い場合は空配列。
 * 例: reviewing → completed = ['準備完了へ','kintone連携','完了']
 */
export function resolveStatusActionPath(
  from: CaseStatus,
  to: CaseStatus
): string[] {
  const order: CaseStatus[] = [
    'draft',
    'collecting',
    'reviewing',
    'ready',
    'synced',
    'completed',
  ]
  const fromIdx = order.indexOf(from)
  const toIdx = order.indexOf(to)
  if (fromIdx < 0 || toIdx < 0 || toIdx <= fromIdx) {
    return []
  }
  const actions: string[] = []
  for (let i = fromIdx; i < toIdx; i++) {
    const action = resolveStatusAction(order[i], order[i + 1])
    if (!action) {
      return []
    }
    actions.push(action)
  }
  return actions
}
