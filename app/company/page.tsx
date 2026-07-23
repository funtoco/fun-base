"use client"

import Link from "next/link"
import { ArrowRight, BellRing, CheckCircle2, Clock3, FileWarning } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { CaseRow, KpiCard } from "@/components/portal/portal-widgets"
import { usePortal } from "@/components/portal/portal-provider"

export default function CompanyDashboard() {
  const { cases } = usePortal()
  const nextCase = cases.find((item) => item.responsibility === "企業") ?? cases[0]
  const openTasks = cases.flatMap((item) => item.tasks.map((task) => ({ ...task, caseId: item.id, person: item.person }))).filter((task) => task.assignee === "企業" && !task.done)

  return <div className="mx-auto flex max-w-7xl flex-col gap-8">
    <div><p className="text-sm font-medium text-primary">企業ポータル</p><h1 className="mt-1 text-balance text-2xl font-semibold tracking-tight md:text-3xl">おはようございます、田中さん</h1><p className="mt-2 text-sm text-muted-foreground">申請を止めないために、優先度の高い対応から確認しましょう。</p></div>
    <div className="grid gap-4 sm:grid-cols-3"><KpiCard label="進行中の案件" value={`${cases.length}件`} hint="今月の申請予定" /><KpiCard label="企業の対応待ち" value={`${openTasks.length}件`} hint="期限間近 1件" /><KpiCard label="運営が確認中" value={`${cases.filter((item) => item.responsibility === "運営").length}件`} hint="提出済み書類" /></div>

    <Card className="border-primary/30 bg-primary text-primary-foreground">
      <CardHeader><div className="flex items-start justify-between gap-4"><div><p className="text-xs font-medium opacity-80">次に対応すること</p><CardTitle className="mt-2 text-xl">{nextCase.tasks.find((task) => !task.done && task.assignee === "企業")?.title}</CardTitle><CardDescription className="mt-2 text-primary-foreground/80">{nextCase.person}さんの申請 ・ 期限 7月23日 17:00</CardDescription></div><FileWarning className="size-6 shrink-0" /></div></CardHeader>
      <CardContent className="flex flex-col items-start justify-between gap-4 md:flex-row md:items-end"><p className="max-w-2xl text-sm leading-6 text-primary-foreground/80">運営からコメントが届いています。修正内容を確認し、更新した雇用理由書をアップロードしてください。</p><Button asChild variant="secondary"><Link href={`/company/cases/${nextCase.id}`}>対応内容を確認<ArrowRight data-icon="inline-end" /></Link></Button></CardContent>
    </Card>

    <div className="grid gap-6 xl:grid-cols-[1.15fr_.85fr]">
      <section className="flex flex-col gap-4"><div className="flex items-end justify-between"><div><h2 className="text-lg font-semibold">対応が必要なタスク</h2><p className="text-sm text-muted-foreground">期限順に表示しています</p></div></div>
        <div className="flex flex-col gap-3">{openTasks.map((task) => <Link key={task.id} href={`/company/cases/${task.caseId}`} className="flex items-center gap-3 rounded-xl border bg-card p-4 hover:border-primary/40"><div className="flex size-9 items-center justify-center rounded-full bg-amber-100 text-amber-900"><Clock3 className="size-4" /></div><div className="min-w-0 flex-1"><p className="font-medium">{task.title}</p><p className="truncate text-sm text-muted-foreground">{task.person} ・ 期限 {task.due}</p></div><ArrowRight className="size-4 text-muted-foreground" /></Link>)}</div>
      </section>
      <section className="flex flex-col gap-4"><div><h2 className="text-lg font-semibold">最近の更新</h2><p className="text-sm text-muted-foreground">申請に関する最新のお知らせ</p></div><Card><CardContent className="flex flex-col gap-5 py-1">{[{icon: BellRing, title:"書類の修正依頼が届きました", detail:"雇用理由書 ・ 7月22日 16:42"},{icon: CheckCircle2,title:"書類が承認されました",detail:"パスポート写し ・ 7月21日 13:05"}].map((update) => <div key={update.title} className="flex gap-3"><update.icon className="mt-0.5 size-4 text-primary" /><div><p className="text-sm font-medium">{update.title}</p><p className="text-xs text-muted-foreground">{update.detail}</p></div></div>)}</CardContent></Card></section>
    </div>
    <section className="flex flex-col gap-4"><div className="flex items-end justify-between"><div><h2 className="text-lg font-semibold">進行中の申請</h2><p className="text-sm text-muted-foreground">担当企業の全案件</p></div><Button asChild variant="ghost" size="sm"><Link href="/company/cases">すべて見る<ArrowRight data-icon="inline-end" /></Link></Button></div><div className="grid gap-4 lg:grid-cols-2">{cases.slice(0,2).map((item) => <CaseRow key={item.id} item={item} basePath="/company/cases" />)}</div></section>
  </div>
}
