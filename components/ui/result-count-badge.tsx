import { Badge } from "@/components/ui/badge"
import { formatResultCountLabel } from "@/lib/result-count-label"
import { cn } from "@/lib/utils"

interface ResultCountBadgeProps {
  count: number
  total?: number
  className?: string
}

export function ResultCountBadge({ count, total, className }: ResultCountBadgeProps) {
  return (
    <Badge
      variant="secondary"
      className={cn("h-9 px-3 text-sm font-medium", className)}
    >
      {formatResultCountLabel(count, total)}
    </Badge>
  )
}
