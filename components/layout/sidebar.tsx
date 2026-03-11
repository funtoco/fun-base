"use client"

import Link from "next/link"
import Image from "next/image"
import { usePathname } from "next/navigation"
import { cn } from "@/lib/utils"
import { LayoutDashboard, Users, FileText, FolderOpen, Calendar, Clock, CheckSquare } from "lucide-react"

const navigation = [
  // {
  //   name: "ダッシュボード",
  //   href: "/dashboard",
  //   icon: LayoutDashboard,
  // },
  {
    name: "人材一覧",
    href: "/people",
    icon: Users,
  },
  {
    name: "ビザ進捗管理",
    href: "/visas",
    icon: FileText,
  },
  {
    name: "書類管理",
    href: "/documents",
    icon: FolderOpen,
  },
  // {
  //   name: "面談記録",
  //   href: "/meetings",
  //   icon: Calendar,
  // },
  // {
  //   name: "タイムライン",
  //   href: "/timeline",
  //   icon: Clock,
  // },
  // {
  //   name: "サポート記録",
  //   href: "/actions",
  //   icon: CheckSquare,
  // },
]

export function Sidebar() {
  const pathname = usePathname()

  return (
    <div className="flex h-full w-64 flex-col bg-sidebar border-r border-sidebar-border">
      {/* Logo */}
      <div className="flex h-16 items-center px-6 border-b border-sidebar-border">
        <div className="flex items-center gap-2">
          <Image src="/funstudio-logo.webp" alt="FunBase" width={120} height={32} className="h-8 w-auto" />
        </div>
      </div>

      {/* Navigation */}
      <nav className="flex-1 px-4 py-6">
        <ul className="space-y-2">
          {navigation.map((item) => {
            const isActive = pathname === item.href || pathname.startsWith(item.href + "/")
            return (
              <li key={item.name}>
                <Link
                  href={item.href}
                  className={cn(
                    "flex items-center gap-3 rounded-lg px-3 py-2 text-sm font-medium transition-colors",
                    isActive
                      ? "bg-sidebar-accent text-sidebar-accent-foreground"
                      : "text-sidebar-foreground hover:bg-sidebar-accent hover:text-sidebar-accent-foreground",
                  )}
                >
                  <item.icon className="h-5 w-5" />
                  {item.name}
                </Link>
              </li>
            )
          })}
        </ul>
      </nav>

      {/* Footer */}
      <div className="border-t border-sidebar-border p-4">
        <div className="text-xs text-sidebar-foreground/60">FunBase</div>
      </div>
    </div>
  )
}
