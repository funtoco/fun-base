import { Stepper } from '@/components/ui/stepper'
import {
  CASE_FLOW_STEPS,
  CASE_STATUS_LABELS,
  type CaseStatus,
} from '@/lib/portal/types'

interface CaseProgressHeaderProps {
  status: CaseStatus
}

// 申請の流れ（draft → collecting → reviewing → ready → synced → completed）を Stepper 風に表示。
export function CaseProgressHeader({ status }: CaseProgressHeaderProps) {
  const labels = CASE_FLOW_STEPS.map((s) => CASE_STATUS_LABELS[s])

  // archived は途中経路に無いため、最終段扱い（全ステップ完了）で描画する
  const flowIndex = CASE_FLOW_STEPS.indexOf(status)
  const currentStep =
    flowIndex >= 0 ? flowIndex + 1 : CASE_FLOW_STEPS.length + 1

  return (
    <div className="rounded-xl border border-border bg-card p-6 shadow-sm">
      <div className="mb-4 flex items-center justify-between">
        <h3 className="text-sm font-medium text-muted-foreground">申請の流れ</h3>
        <span className="text-xs text-muted-foreground">
          現在のステータス：{CASE_STATUS_LABELS[status]}
        </span>
      </div>
      <div className="overflow-x-auto">
        <div className="min-w-[640px]">
          <Stepper steps={labels} currentStep={currentStep} />
        </div>
      </div>
    </div>
  )
}
