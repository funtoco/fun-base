"use client"

import { Search } from "lucide-react"
import { useState } from "react"
import { Input } from "@/components/ui/input"
import { CaseRow } from "@/components/portal/portal-widgets"
import { usePortal } from "@/components/portal/portal-provider"

export function CaseListPage({ role }: { role: "company" | "ops" }) {
  const { cases } = usePortal()
  const [query, setQuery] = useState("")
  const [status, setStatus] = useState("すべて")
  const filtered = cases.filter((item) => (item.person + item.company + item.id).toLowerCase().includes(query.toLowerCase()) && (status === "すべて" || item.status === status))

  return <div className="mx-auto flex max-w-6xl flex-col gap-6">
    <div><p className="text-sm font-medium text-primary">{role === "ops" ? "運営ワークスペース" : "企業ポータル"}</p><h1 className="mt-1 text-2xl font-semibold tracking-tight">案件一覧</h1><p className="mt-2 text-sm text-muted-foreground">在留資格申請の進捗と次の対応を確認できます。</p></div>
    <div className="flex flex-col gap-3 rounded-xl border bg-card p-4 sm:flex-row">
      <label className="relative flex-1"><span className="sr-only">案件を検索</span><Search className="absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" /><Input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="氏名・企業名・案件番号で検索" className="pl-9" /></label>
      <label><span className="sr-only">ステータスで絞り込み</span><select value={status} onChange={(event) => setStatus(event.target.value)} className="h-9 w-full rounded-md border bg-background px-3 text-sm sm:w-44"><option>すべて</option><option>書類準備中</option><option>審査中</option><option>修正対応中</option></select></label>
    </div>
    <p className="text-sm text-muted-foreground">{filtered.length}件の案件</p>
    <div className="grid gap-4 lg:grid-cols-2">{filtered.map((item) => <CaseRow key={item.id} item={item} basePath={role === "ops" ? "/ops/cases" : "/company/cases"} />)}</div>
    {filtered.length === 0 && <div className="rounded-xl border border-dashed p-12 text-center"><p className="font-medium">該当する案件がありません</p><p className="mt-1 text-sm text-muted-foreground">検索条件を変更してください。</p></div>}
  </div>
}
