"use client"

import { useEffect, useState } from "react"
import Link from "next/link"
import Image from "next/image"
import { usePathname } from "next/navigation"
import { Calendar, CheckSquare, Clock, ExternalLink, FileText, FolderOpen, Home, Users, type LucideIcon } from "lucide-react"
import { cn } from "@/lib/utils"
import { getCurrentUserTenants } from "@/lib/supabase/tenants"
import {
  hasAnyTenantFeatureAccess,
  type TenantFeaturePermission,
  type TenantRoleMembership,
} from "@/lib/tenant-access"

type NavigationItem = {
  name: string
  href: string
  icon: LucideIcon
  feature?: TenantFeaturePermission
}

const navigation: NavigationItem[] = [
  {
    name: "ホーム",
    href: "/dashboard",
    icon: Home,
  },
  {
    name: "人材一覧",
    href: "/people",
    icon: Users,
    feature: "people",
  },
  {
    name: "ビザ進捗管理",
    href: "/visas",
    icon: FileText,
    feature: "visas",
  },
  {
    name: "面談一覧",
    href: "/meetings",
    icon: Calendar,
    feature: "meetings",
  },
  {
    name: "サポート記録",
    href: "/support",
    icon: CheckSquare,
    feature: "support_actions",
  },
  {
    name: "タイムライン",
    href: "/timeline",
    icon: Clock,
    feature: "support_actions",
  },
  {
    name: "書類管理",
    href: "/documents",
    icon: FolderOpen,
    feature: "documents",
  },
]

export function Sidebar() {
  const pathname = usePathname()
  const [memberships, setMemberships] = useState<TenantRoleMembership[]>([])

  useEffect(() => {
    let cancelled = false

    getCurrentUserTenants()
      .then((currentMemberships) => {
        if (cancelled) return
        setMemberships(currentMemberships)
      })
      .catch((error) => {
        console.debug("Failed to load sidebar feature scope:", error)
      })

    return () => {
      cancelled = true
    }
  }, [])

  const visibleNavigation = navigation.filter(
    (item) => !item.feature || hasAnyTenantFeatureAccess(memberships, item.feature)
  )
  const canOpenFunEdu = hasAnyTenantFeatureAccess(memberships, "funedu")

  return (
    <div className="flex h-full w-60 shrink-0 flex-col bg-sidebar border-r border-sidebar-border">
      <div className="flex h-14 items-center px-4">
        <div className="flex items-center gap-2">
          <Image src="/funstudio-logo.webp" alt="FunBase" width={120} height={32} className="h-8 w-auto" />
        </div>
      </div>

      <nav className="flex-1 px-3 pt-2">
        <ul className="space-y-1">
          {visibleNavigation.map((item) => {
            const isActive = pathname === item.href || pathname.startsWith(item.href + "/")
            return (
              <li key={item.name}>
                <Link
                  href={item.href}
                  className={cn(
                    "flex items-center gap-3 rounded-xl px-3 py-2.5 text-sm transition-colors",
                    isActive
                      ? "bg-sidebar-accent text-sidebar-accent-foreground font-medium"
                      : "text-foreground hover:bg-muted",
                  )}
                >
                  <item.icon className={cn("h-5 w-5 shrink-0", isActive ? "text-primary" : "text-muted-foreground")} />
                  {item.name}
                </Link>
              </li>
            )
          })}
        </ul>
      </nav>

      <div className="border-t border-sidebar-border p-4">
        {canOpenFunEdu && (
          <a
            href="/api/funedu/sso/start"
            target="_blank"
            rel="noreferrer"
            className="mb-3 flex items-center gap-3 rounded-lg border border-sidebar-border bg-background px-3 py-2.5 text-sm transition-colors hover:bg-muted"
          >
            <Image
              src="/funedu_logo_symbol.svg"
              alt=""
              width={32}
              height={32}
              className="h-8 w-8 shrink-0 rounded-md object-contain"
            />
            <span className="min-w-0 flex-1">
              <span className="block font-medium leading-5">FunEdu</span>
              <span className="block truncate text-xs text-muted-foreground">ログイン連携で開く</span>
            </span>
            <ExternalLink className="h-4 w-4 shrink-0 text-muted-foreground" />
          </a>
        )}
        <div className="text-xs text-muted-foreground">FunBase v1.0</div>
      </div>
    </div>
  )
}
