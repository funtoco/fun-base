"use client"

import Link from "next/link"
import { ArrowRight, CalendarClock } from "lucide-react"
import { Card, CardContent } from "@/components/ui/card"
import { cn } from "@/lib/utils"
import { statusTone, type PortalCase } from "@/lib/portal-data"

export function Chip({ label, className }: { label: string; className?: string }) {
  return <span className={cn("inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-medium", statusTone[label] ?? "bg-muted text-muted-foreground", className)}>{label}</span>
}

export function KpiCard({ label, value, hint }: { label: string; value: string; hint?: string }) {
  return <Card><CardContent className="flex flex-col gap-1 py-1"><p className="text-sm text-muted-foreground">{label}</p><p className="text-3xl font-semibold tracking-tight">{value}</p>{hint && <p className="text-xs text-muted-foreground">{hint}</p>}</CardContent></Card>
}

export function ProgressBar({ value }: { value: number }) {
  return <div className="h-2 w-full overflow-hidden rounded-full bg-muted"><div className="h-full rounded-full bg-primary transition-all" style={{ width: `${value}%` }} /></div>
}

export function CaseRow({ item, basePath }: { item: PortalCase; basePath: string }) {
  return (
    <Link href={`${basePath}/${item.id}`} className="block">
      <Card className="transition-colors hover:border-primary/40">
        <CardContent className="flex flex-col gap-3 py-1">
          <div className="flex items-start justify-between gap-3">
            <div className="min-w-0">
              <div className="flex flex-wrap items-center gap-2"><p className="font-semibold">{item.person}</p><Chip label={item.status} /><Chip label={item.responsibility} /></div>
              <p className="mt-1 truncate text-sm text-muted-foreground">{item.company} ・ {item.visa}</p>
            </div>
            <ArrowRight className="mt-1 size-4 shrink-0 text-muted-foreground" />
          </div>
          <ProgressBar value={item.progress} />
          <div className="flex items-center justify-between text-xs text-muted-foreground">
            <span>案件番号 {item.id}</span>
            <span className="inline-flex items-center gap-1"><CalendarClock className="size-3.5" />期限 {item.deadline}</span>
          </div>
        </CardContent>
      </Card>
    </Link>
  )
}
