import { AlertTriangle, Info } from 'lucide-react'
import { cn } from '@/lib/utils'
import { FLOW_LANE_LABELS, type FlowLane, type FlowStep } from '@/lib/portal/guidance'

interface FlowLanesProps {
  flow: Record<FlowLane, FlowStep[]>
}

const LANE_ORDER: FlowLane[] = ['company', 'funtoco', 'candidate']

const LANE_STYLES: Record<FlowLane, string> = {
  company: 'border-emerald-200 bg-emerald-50/60',
  funtoco: 'border-indigo-200 bg-indigo-50/60',
  candidate: 'border-orange-200 bg-orange-50/60',
}

function StepNote({ note }: { note: NonNullable<FlowStep['note']> }) {
  const Icon = note.tone === 'warning' ? AlertTriangle : Info
  return (
    <div
      className={cn(
        'mt-2 flex gap-1.5 rounded-md p-2 text-xs leading-5',
        note.tone === 'warning'
          ? 'bg-red-50 text-red-800'
          : 'bg-background text-muted-foreground'
      )}
    >
      <Icon className="mt-0.5 h-3.5 w-3.5 shrink-0" aria-hidden />
      <span>{note.body}</span>
    </div>
  )
}

export function FlowLanes({ flow }: FlowLanesProps) {
  return (
    <div className="grid gap-4 lg:grid-cols-3">
      {LANE_ORDER.map((lane) => (
        <div key={lane} className={cn('rounded-xl border p-4', LANE_STYLES[lane])}>
          <h3 className="text-sm font-medium text-foreground">
            {FLOW_LANE_LABELS[lane]}
          </h3>
          <ol className="mt-3 space-y-2">
            {flow[lane].map((step, index) => (
              <li
                key={step.id}
                className="rounded-lg border border-border bg-card p-3 shadow-sm"
              >
                <div className="flex items-baseline gap-2">
                  <span className="text-xs text-muted-foreground">{index + 1}</span>
                  <span className="text-sm font-medium text-foreground">
                    {step.title}
                  </span>
                </div>
                {step.description && (
                  <p className="mt-1 text-xs leading-5 text-muted-foreground">
                    {step.description}
                  </p>
                )}
                {step.note && <StepNote note={step.note} />}
              </li>
            ))}
          </ol>
        </div>
      ))}
    </div>
  )
}
