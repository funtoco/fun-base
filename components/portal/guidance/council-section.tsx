import { ExternalLink } from 'lucide-react'
import { Badge } from '@/components/ui/badge'
import { COUNCIL_INTRO, type CouncilGuide } from '@/lib/portal/guidance'
import { FIELD_LABELS, type Field } from '@/lib/portal/types'

interface CouncilSectionProps {
  councils: CouncilGuide[]
  field: Field | null
}

export function CouncilSection({ councils, field }: CouncilSectionProps) {
  return (
    <div className="space-y-4">
      <p className="text-sm leading-6 text-muted-foreground">{COUNCIL_INTRO}</p>
      {councils.map((council) => {
        const isTarget = field !== null && council.fields.includes(field)
        return (
          <div
            key={council.id}
            className="rounded-xl border border-border bg-card p-5 shadow-sm"
          >
            <div className="flex flex-wrap items-center gap-2">
              <h3 className="text-sm font-medium text-foreground">{council.label}</h3>
              {isTarget && field && (
                <Badge variant="secondary">この案件の分野: {FIELD_LABELS[field]}</Badge>
              )}
            </div>

            {council.description && (
              <p className="mt-2 text-sm leading-6 text-muted-foreground">
                {council.description}
              </p>
            )}

            {council.steps.length > 0 && (
              <div className="mt-4">
                <h4 className="text-xs font-medium text-muted-foreground">申し込み方法</h4>
                <ol className="mt-2 list-decimal space-y-1.5 pl-5">
                  {council.steps.map((step) => (
                    <li key={step} className="text-sm leading-6 text-foreground">
                      {step}
                    </li>
                  ))}
                </ol>
              </div>
            )}

            {council.requiredDocuments.map((group, index) => (
              <div key={group.heading ?? index} className="mt-4">
                <h4 className="text-xs font-medium text-muted-foreground">
                  {group.heading ? `必要書類（${group.heading}）` : '必要書類'}
                </h4>
                <ol className="mt-2 list-decimal space-y-1.5 pl-5">
                  {group.items.map((item) => (
                    <li key={item} className="text-sm leading-6 text-foreground">
                      {item}
                    </li>
                  ))}
                </ol>
              </div>
            ))}

            {council.links.length > 0 && (
              <div className="mt-4 flex flex-wrap gap-3">
                {council.links.map((link) => (
                  <a
                    key={link.url}
                    href={link.url}
                    target="_blank"
                    rel="noreferrer"
                    className="inline-flex items-center gap-1 text-sm text-primary hover:underline"
                  >
                    {link.label}
                    <ExternalLink className="h-3.5 w-3.5" aria-hidden />
                  </a>
                ))}
              </div>
            )}
          </div>
        )
      })}
    </div>
  )
}
