"use client"

import Link from "next/link"
import { usePathname, useRouter } from "next/navigation"
import { Bell, BriefcaseBusiness, Building2, ChevronDown, FileCheck2, LayoutDashboard, Menu, ShieldCheck, Users, X } from "lucide-react"
import { useState } from "react"
import { Button } from "@/components/ui/button"
import { cn } from "@/lib/utils"
import { PortalProvider } from "./portal-provider"

const companyNav = [
  { href: "/company", label: "ホーム", icon: LayoutDashboard },
  { href: "/company/cases", label: "申請案件", icon: BriefcaseBusiness },
]
const opsNav = [
  { href: "/ops", label: "確認ダッシュボード", icon: LayoutDashboard },
  { href: "/ops/cases", label: "案件一覧", icon: FileCheck2 },
]

function ShellContent({ children }: { children: React.ReactNode }) {
  const pathname = usePathname()
  const router = useRouter()
  const role = pathname.startsWith("/ops") ? "ops" : "company"
  const nav = role === "ops" ? opsNav : companyNav
  const [mobileOpen, setMobileOpen] = useState(false)

  const switchRole = () => router.push(role === "ops" ? "/company" : "/ops")

  const navigation = (
    <>
      <div className="flex h-16 items-center gap-3 border-b border-sidebar-border px-5">
        <div className="flex size-9 items-center justify-center rounded-lg bg-sidebar-primary text-sidebar-primary-foreground"><ShieldCheck className="size-5" /></div>
        <div><p className="font-semibold tracking-tight">FunBase Visa</p><p className="text-xs text-muted-foreground">申請管理ポータル</p></div>
      </div>
      <div className="flex flex-1 flex-col gap-2 p-3">
        <p className="px-3 py-2 text-xs font-medium text-muted-foreground">{role === "ops" ? "運営メニュー" : "企業メニュー"}</p>
        {nav.map((item) => {
          const active = pathname === item.href || (item.href.includes("cases") && pathname.startsWith(item.href))
          return <Link key={item.href} href={item.href} onClick={() => setMobileOpen(false)} className={cn("flex items-center gap-3 rounded-lg px-3 py-2.5 text-sm font-medium transition-colors", active ? "bg-sidebar-primary text-sidebar-primary-foreground" : "text-sidebar-foreground hover:bg-sidebar-accent")}><item.icon className="size-4" />{item.label}</Link>
        })}
      </div>
      <div className="border-t border-sidebar-border p-3">
        <button onClick={switchRole} className="flex w-full items-center gap-3 rounded-lg p-3 text-left hover:bg-sidebar-accent">
          <div className="flex size-9 items-center justify-center rounded-full bg-secondary text-secondary-foreground">{role === "ops" ? <Users className="size-4" /> : <Building2 className="size-4" />}</div>
          <div className="min-w-0 flex-1"><p className="truncate text-sm font-medium">{role === "ops" ? "運営事務局" : "株式会社青葉フーズ"}</p><p className="text-xs text-muted-foreground">{role === "ops" ? "企業画面へ切替" : "運営画面へ切替"}</p></div>
          <ChevronDown className="size-4 text-muted-foreground" />
        </button>
      </div>
    </>
  )

  return <div className="flex min-h-screen bg-background text-foreground">
    <aside className="hidden w-64 shrink-0 flex-col border-r border-sidebar-border bg-sidebar lg:flex">{navigation}</aside>
    {mobileOpen && <div className="fixed inset-0 z-50 flex lg:hidden"><button aria-label="メニューを閉じる" className="flex-1 bg-foreground/25" onClick={() => setMobileOpen(false)} /><aside className="order-first flex w-72 flex-col bg-sidebar shadow-xl">{navigation}</aside></div>}
    <div className="flex min-w-0 flex-1 flex-col">
      <header className="sticky top-0 z-20 flex h-16 items-center justify-between border-b bg-card/95 px-4 backdrop-blur md:px-8">
        <div className="flex items-center gap-3"><Button variant="ghost" size="icon" className="lg:hidden" onClick={() => setMobileOpen(!mobileOpen)} aria-label="メニューを開く">{mobileOpen ? <X /> : <Menu />}</Button><div><p className="text-sm font-semibold">{role === "ops" ? "運営管理ワークスペース" : "企業申請ワークスペース"}</p><p className="hidden text-xs text-muted-foreground sm:block">2026年7月23日（木）</p></div></div>
        <div className="flex items-center gap-2"><Button variant="ghost" size="icon" aria-label="通知"><Bell /></Button><div className="hidden border-l pl-4 text-right sm:block"><p className="text-sm font-medium">{role === "ops" ? "佐藤 美咲" : "田中 健一"}</p><p className="text-xs text-muted-foreground">{role === "ops" ? "審査担当" : "企業担当者"}</p></div></div>
      </header>
      <main className="flex-1 p-4 md:p-8">{children}</main>
    </div>
  </div>
}

export function PortalShell({ children }: { children: React.ReactNode }) {
  return <PortalProvider><ShellContent>{children}</ShellContent></PortalProvider>
}
