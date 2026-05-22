"use client"

import { useState, useEffect, useCallback, useRef, type FormEvent } from "react"
import { Search, Bell, Settings, User, LogOut, RefreshCw, Cable, Users, ShieldCheck, Megaphone } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu"
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover"
import { ScrollArea } from "@/components/ui/scroll-area"
import { Badge } from "@/components/ui/badge"
import { useAuth } from "@/contexts/auth-context"
import { usePathname, useRouter } from "next/navigation"
import { currentUser } from "@/data/users"
import { formatDate } from "@/lib/utils"
import { buildPeopleSearchHref } from "@/lib/header-search"
import {
  getPublishedAnnouncements,
  getReadAnnouncementIds,
  markAnnouncementAsRead,
  markAllAnnouncementsAsRead,
} from "@/lib/supabase/announcements"
import type { Announcement } from "@/lib/models"

export function Header() {
  const { user, role, signOut, refreshUser } = useAuth()
  const router = useRouter()
  const pathname = usePathname()
  const searchInputRef = useRef<HTMLInputElement>(null)
  const [searchQuery, setSearchQuery] = useState("")
  const [announcements, setAnnouncements] = useState<Announcement[]>([])
  const [readIds, setReadIds] = useState<string[]>([])
  const [announcementsOpen, setAnnouncementsOpen] = useState(false)

  const unreadCount = announcements.filter(a => !readIds.includes(a.id)).length

  const loadAnnouncements = useCallback(async () => {
    try {
      const [items, reads] = await Promise.all([
        getPublishedAnnouncements(),
        getReadAnnouncementIds(),
      ])
      setAnnouncements(items)
      setReadIds(reads)
    } catch (err) {
      console.debug('Failed to load announcements:', err)
    }
  }, [])

  useEffect(() => {
    if (user) {
      loadAnnouncements()
    }
  }, [user, loadAnnouncements])

  useEffect(() => {
    if (typeof window === "undefined") return

    if (pathname === "/people") {
      setSearchQuery(new URLSearchParams(window.location.search).get("search") ?? "")
      return
    }

    setSearchQuery("")
  }, [pathname])

  useEffect(() => {
    const handleSlashFocus = (event: KeyboardEvent) => {
      if (event.key !== "/" || event.metaKey || event.ctrlKey || event.altKey) return

      const target = event.target as HTMLElement | null
      const tagName = target?.tagName
      const isTypingTarget =
        target?.isContentEditable ||
        tagName === "INPUT" ||
        tagName === "TEXTAREA" ||
        tagName === "SELECT"

      if (isTypingTarget) return

      event.preventDefault()
      searchInputRef.current?.focus()
    }

    window.addEventListener("keydown", handleSlashFocus)
    return () => window.removeEventListener("keydown", handleSlashFocus)
  }, [])

  const handleMarkAsRead = async (id: string) => {
    try {
      await markAnnouncementAsRead(id)
      setReadIds(prev => [...prev, id])
    } catch (err) {
      console.error('Failed to mark announcement as read:', err)
    }
  }

  const handleMarkAllAsRead = async () => {
    const unreadIds = announcements.filter(a => !readIds.includes(a.id)).map(a => a.id)
    if (unreadIds.length === 0) return
    try {
      await markAllAnnouncementsAsRead(unreadIds)
      setReadIds(prev => [...prev, ...unreadIds])
    } catch (err) {
      console.error('Failed to mark all announcements as read:', err)
    }
  }

  const handleSignOut = async () => {
    await signOut()
  }

  const handleSearchSubmit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault()

    const currentPathname = typeof window !== "undefined" ? window.location.pathname : pathname
    const currentSearch = typeof window !== "undefined" ? window.location.search : ""
    router.push(buildPeopleSearchHref(searchQuery, currentPathname, currentSearch))
  }

  return (
    <header className="flex h-14 items-center justify-between border-b border-border bg-card px-4 md:px-6">
      {/* Search and Company Switcher */}
      <div className="flex min-w-0 flex-1 items-center gap-4">
        <form className="relative w-full max-w-[28rem]" onSubmit={handleSearchSubmit}>
          <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            ref={searchInputRef}
            aria-label="人材名、会社名で検索"
            placeholder="人材名、会社名で検索... (/ でフォーカス)"
            className="w-full pl-10"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
          />
        </form>

      </div>

      {/* Actions */}
      <div className="flex shrink-0 items-center gap-2">
        <Button variant="ghost" size="icon" onClick={refreshUser} title="ユーザー情報をリフレッシュ">
          <RefreshCw className="h-5 w-5" />
        </Button>

        <Popover open={announcementsOpen} onOpenChange={setAnnouncementsOpen}>
          <PopoverTrigger asChild>
            <button className="relative inline-flex items-center justify-center rounded-md text-sm font-medium transition-colors hover:bg-muted size-9">
              <Bell className="h-5 w-5" />
              {unreadCount > 0 && (
                <span className="absolute -top-0.5 -right-0.5 flex h-4 w-4 items-center justify-center rounded-full bg-red-500 text-[10px] font-bold text-white">
                  {unreadCount > 9 ? "9+" : unreadCount}
                </span>
              )}
            </button>
          </PopoverTrigger>
          <PopoverContent align="end" className="w-96 p-0 z-[100]">
            <div className="flex items-center justify-between border-b px-4 py-3">
              <h3 className="text-sm font-semibold">お知らせ</h3>
              {unreadCount > 0 && (
                <Button
                  variant="ghost"
                  size="sm"
                  className="text-xs text-muted-foreground h-auto py-1"
                  onClick={handleMarkAllAsRead}
                >
                  すべて既読にする
                </Button>
              )}
            </div>
            <ScrollArea className="max-h-80">
              {announcements.length === 0 ? (
                <div className="flex flex-col items-center justify-center py-8 text-muted-foreground">
                  <Megaphone className="h-8 w-8 mb-2 opacity-50" />
                  <p className="text-sm">お知らせはありません</p>
                </div>
              ) : (
                <div className="divide-y">
                  {announcements.map(a => {
                    const isRead = readIds.includes(a.id)
                    return (
                      <button
                        key={a.id}
                        className={`w-full text-left px-4 py-3 hover:bg-muted/50 transition-colors ${
                          !isRead ? "bg-blue-50/50 dark:bg-blue-950/20" : ""
                        }`}
                        onClick={() => {
                          if (!isRead) handleMarkAsRead(a.id)
                          setAnnouncementsOpen(false)
                          router.push(`/announcements?id=${a.id}`)
                        }}
                      >
                        <div className="flex items-start gap-2">
                          {!isRead && (
                            <span className="mt-1.5 h-2 w-2 shrink-0 rounded-full bg-blue-500" />
                          )}
                          <div className={`flex-1 ${isRead ? "pl-4" : ""}`}>
                            <p className={`text-sm ${!isRead ? "font-semibold" : ""}`}>
                              {a.title}
                            </p>
                            <p className="text-xs text-muted-foreground mt-1 line-clamp-2">
                              {a.body}
                            </p>
                            <p className="text-xs text-muted-foreground mt-1">
                              {formatDate(a.createdAt)}
                            </p>
                          </div>
                        </div>
                      </button>
                    )
                  })}
                </div>
              )}
            </ScrollArea>
            {announcements.length > 0 && (
              <div className="border-t px-4 py-2">
                <Button
                  variant="ghost"
                  size="sm"
                  className="w-full text-xs text-muted-foreground"
                  onClick={() => {
                    setAnnouncementsOpen(false)
                    router.push("/announcements")
                  }}
                >
                  すべてのお知らせを見る
                </Button>
              </div>
            )}
          </PopoverContent>
        </Popover>

        {(role === "admin" || currentUser.role === "admin") && (
          <DropdownMenu>
            <DropdownMenuTrigger className="inline-flex items-center justify-center whitespace-nowrap rounded-md text-sm font-medium transition-colors focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring disabled:pointer-events-none disabled:opacity-50 hover:bg-accent hover:text-accent-foreground h-9 w-9">
              <Settings className="h-5 w-5" />
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end" className="w-48">
              <DropdownMenuLabel>管理者設定</DropdownMenuLabel>
              <DropdownMenuSeparator />
              <DropdownMenuItem onClick={() => router.push('/admin/tenants')}>
                <Users className="mr-2 h-4 w-4" />
                テナント管理
              </DropdownMenuItem>
              <DropdownMenuItem onClick={() => router.push('/admin/connectors/dashboard')}>
                <Cable className="mr-2 h-4 w-4" />
                コネクター管理
              </DropdownMenuItem>
              {user?.email?.endsWith("@funtoco.jp") && (
                <DropdownMenuItem onClick={() => router.push('/admin/announcements')}>
                  <Megaphone className="mr-2 h-4 w-4" />
                  お知らせ管理
                </DropdownMenuItem>
              )}
              <DropdownMenuSeparator />
              <DropdownMenuItem onClick={() => router.push('/admin/access-logs')}>
                <ShieldCheck className="mr-2 h-4 w-4" />
                アクセスログ
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        )}

        {user ? (
          <div className="flex min-w-0 items-center gap-2">
            <span className="hidden max-w-[16rem] truncate text-sm text-muted-foreground md:block">{user.email}</span>
            <Button 
              variant="ghost" 
              size="sm"
              onClick={handleSignOut}
              className="text-red-600 hover:text-red-700"
            >
              <LogOut className="mr-2 h-4 w-4" />
              ログアウト
            </Button>
          </div>
        ) : (
          <div className="text-sm text-muted-foreground">ログイン中...</div>
        )}
      </div>
    </header>
  )
}
