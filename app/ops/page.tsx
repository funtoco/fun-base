"use client"

import Link from "next/link"
import { ArrowRight, Clock3, FileCheck2, Flame, Inbox } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Chip, KpiCard, ProgressBar } from "@/components/portal/portal-widgets"
import { usePortal } from "@/components/portal/portal-provider"

export default function OpsDashboard() {
  const { cases } = usePortal()
  const ordered = [...cases].sort((a, b) => ({ 高: 0, 中: 1, 低: 2 }[a.priority] - { 高: 0, 中: 1, 低: 2 }[b.priority]))
  return <div className="mx-auto flex max-w-7xl flex-col gap-8">
    <div className="flex flex-col justify-between gap-4 sm:flex-row sm:items-end"><div><p className="text-sm font-medium text-primary">運営ダッシュボード</p><h1 className="mt-1 text-2xl font-semibold tracking-tight md:text-3xl">今日の確認キュー</h1><p className="mt-2 text-sm text-muted-foreground">優先度と期限をもとに、先に確認すべき案件を並べています。</p></div><Button asChild variant="outline"><Link href="/ops/cases">全案件を表示<ArrowRight data-icon="inline-end" /></Link></Button></div>
    <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4"><KpiCard label="今日確認" value="5件" hint="昨日比 +2件" /><KpiCard label="新規提出" value="3件" hint="未確認の書類" /><KpiCard label="修正待ち" value="1件" hint="企業側が対応中" /><KpiCard label="今週の完了" value="8件" hint="平均 4.2日" /></div>
    <div className="grid gap-6 xl:grid-cols-[1.35fr_.65fr]">
      <section className="flex flex-col gap-4"><div><h2 className="text-lg font-semibold">今日確認する案件</h2><p className="text-sm text-muted-foreground">緊急度の高い順</p></div><div className="flex flex-col gap-3">{ordered.map((item, index) => <Link key={item.id} href={`/ops/cases/${item.id}`} className="group rounded-xl border bg-card p-5 hover:border-primary/40"><div className="flex items-start gap-4"><div className={`flex size-10 shrink-0 items-center justify-center rounded-lg font-semibold ${index === 0 ? "bg-amber-100 text-amber-900" : "bg-muted text-muted-foreground"}`}>{index + 1}</div><div className="min-w-0 flex-1"><div className="flex flex-wrap items-center gap-2"><p className="font-semibold">{item.person}</p><Chip label={item.status} /><span className="text-xs text-muted-foreground">優先度 {item.priority}</span></div><p className="mt-1 text-sm text-muted-foreground">{item.company} ・ {item.visa}</p><div className="mt-3 flex items-start gap-2 rounded-md bg-muted p-2.5"><Flame className="mt-0.5 size-4 shrink-0 text-amber-900" /><p className="text-xs">{item.reason}</p></div><div className="mt-3"><ProgressBar value={item.progress} /></div></div><ArrowRight className="mt-2 size-4 text-muted-foreground transition-transform group-hover:translate-x-1" /></div></Link>)}</div></section>
      <aside className="flex flex-col gap-4"><Card><CardHeader><CardTitle className="text-base">今日の状況</CardTitle><CardDescription>運営チーム全体</CardDescription></CardHeader><CardContent className="flex flex-col gap-5 py-1">{[{ icon: Inbox, label: "未確認書類", value: "7件" }, { icon: Clock3, label: "24時間以内の期限", value: "2件" }, { icon: FileCheck2, label: "承認済み", value: "12件" }].map((metric) => <div key={metric.label} className="flex items-center gap-3"><div className="flex size-9 items-center justify-center rounded-lg bg-secondary text-secondary-foreground"><metric.icon className="size-4" /></div><p className="flex-1 text-sm">{metric.label}</p><p className="font-semibold">{metric.value}</p></div>)}</CardContent></Card><Card><CardHeader><CardTitle className="text-base">最近の提出</CardTitle></CardHeader><CardContent className="flex flex-col gap-4 py-1">{cases[1].documents.map((doc) => <div key={doc.id}><p className="text-sm font-medium">{doc.name}</p><p className="text-xs text-muted-foreground">{cases[1].person} ・ {doc.updatedAt}</p></div>)}</CardContent></Card></aside>
    </div>
  </div>
}
