import Link from 'next/link'
import { ArrowRight, ChevronRight } from 'lucide-react'
import type { FlowStep } from '@/lib/portal/guidance'

interface FlowSummaryProps {
  steps: FlowStep[]
  guideHref: string
}

// 一覧ページの上部に置く「貴社にご対応いただくこと」の横並び表示。
export function FlowSummary({ steps, guideHref }: FlowSummaryProps) {
  return (
    <section className="rounded-xl border border-border bg-card p-6 shadow-sm">
      <div className="mb-4 flex flex-wrap items-center justify-between gap-2">
        <h2 className="text-sm font-medium text-foreground">
          申請の流れ（貴社にご対応いただくこと）
        </h2>
        <Link
          href={guideHref}
          className="inline-flex items-center gap-1 text-sm text-primary hover:underline"
        >
          くわしい流れを見る
          <ArrowRight className="h-3.5 w-3.5" />
        </Link>
      </div>
      <ol className="flex flex-wrap items-stretch gap-2">
        {steps.map((step, index) => (
          <li key={step.id} className="flex items-stretch gap-2">
            <div className="flex min-w-[120px] flex-col rounded-lg bg-muted/60 px-3 py-2">
              <span className="text-xs text-muted-foreground">STEP {index + 1}</span>
              <span className="mt-0.5 text-sm font-medium text-foreground">
                {step.shortTitle ?? step.title}
              </span>
            </div>
            {index < steps.length - 1 && (
              <ChevronRight
                aria-hidden
                className="h-4 w-4 shrink-0 self-center text-muted-foreground"
              />
            )}
          </li>
        ))}
      </ol>
    </section>
  )
}
