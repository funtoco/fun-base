"use client"

import { useState, useEffect, useCallback, useMemo } from "react"
import { Search, Bell, Settings, LogOut, RefreshCw, Cable, Users, ShieldCheck, Megaphone, Building2, ArrowRight, History } from "lucide-react"
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
import { useRouter } from "next/navigation"
import { currentUser } from "@/data/users"
import { cn, formatDate } from "@/lib/utils"
import {
  getPublishedAnnouncements,
  getReadAnnouncementIds,
  markAnnouncementAsRead,
  markAllAnnouncementsAsRead,
} from "@/lib/supabase/announcements"
import { getPeople } from "@/lib/supabase/people"
import { matchesPersonSearch, normalizePersonSearchText as normalizeSearchText } from "@/lib/person-search"
import type { Announcement, Person } from "@/lib/models"

type OfficeSuggestion = {
  name: string
  count: number
}

type LegalEntitySuggestion = {
  name: string
  count: number
}

type SearchHistoryItem = {
  id: string
  label: string
  href: string
  kind: "person" | "legalEntity" | "office" | "query"
  description?: string
}

const SEARCH_HISTORY_STORAGE_KEY = "funbase:global-search-history"
const MAX_SEARCH_HISTORY_ITEMS = 8

export function Header() {
  const { user, role, signOut, refreshUser } = useAuth()
  const router = useRouter()
  const [searchQuery, setSearchQuery] = useState("")
  const [people, setPeople] = useState<Person[]>([])
  const [searchOpen, setSearchOpen] = useState(false)
  const [searchHistory, setSearchHistory] = useState<SearchHistoryItem[]>([])
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
    try {
      const storedHistory = window.localStorage.getItem(SEARCH_HISTORY_STORAGE_KEY)
      if (!storedHistory) return

      const parsedHistory = JSON.parse(storedHistory)
      if (Array.isArray(parsedHistory)) {
        setSearchHistory(parsedHistory.slice(0, MAX_SEARCH_HISTORY_ITEMS))
      }
    } catch (err) {
      console.debug("Failed to load search history:", err)
    }
  }, [])

  useEffect(() => {
    if (!user) return

    let cancelled = false

    getPeople()
      .then((items) => {
        if (!cancelled) setPeople(items)
      })
      .catch((err) => {
        console.debug("Failed to load search suggestions:", err)
      })

    return () => {
      cancelled = true
    }
  }, [user])

  useEffect(() => {
    const handleKeyDown = (event: KeyboardEvent) => {
      const target = event.target as HTMLElement | null
      const isTyping =
        target?.tagName === "INPUT" ||
        target?.tagName === "TEXTAREA" ||
        target?.isContentEditable

      if (event.key === "/" && !isTyping) {
        event.preventDefault()
        document.getElementById("global-search-input")?.focus()
        setSearchOpen(true)
      }
    }

    window.addEventListener("keydown", handleKeyDown)
    return () => window.removeEventListener("keydown", handleKeyDown)
  }, [])

  const searchText = normalizeSearchText(searchQuery)

  const saveSearchHistory = (item: SearchHistoryItem) => {
    setSearchHistory((current) => {
      const next = [
        item,
        ...current.filter((historyItem) => historyItem.id !== item.id),
      ].slice(0, MAX_SEARCH_HISTORY_ITEMS)

      try {
        window.localStorage.setItem(SEARCH_HISTORY_STORAGE_KEY, JSON.stringify(next))
      } catch (err) {
        console.debug("Failed to save search history:", err)
      }

      return next
    })
  }

  const historySuggestions = useMemo(() => {
    return searchHistory
      .filter((item) => {
        if (!searchText) return true

        return [item.label, item.description]
          .filter(Boolean)
          .some((value) => normalizeSearchText(value).includes(searchText))
      })
      .slice(0, 5)
  }, [searchHistory, searchText])

  const personSuggestions = useMemo(() => {
    const source = searchText
      ? people.filter((person) => {
          return matchesPersonSearch(person, searchText)
        })
      : people.filter((person) => ["入社待ち", "在籍中"].includes(person.workingStatus ?? ""))

    return source
      .slice()
      .sort((a, b) => {
        if (!searchText) {
          return new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime()
        }

        const aNameStarts = normalizeSearchText(a.name).startsWith(searchText) ? 1 : 0
        const bNameStarts = normalizeSearchText(b.name).startsWith(searchText) ? 1 : 0
        return bNameStarts - aNameStarts
      })
      .slice(0, 5)
  }, [people, searchText])

  const legalEntitySuggestions = useMemo(() => {
    const counts = new Map<string, LegalEntitySuggestion>()

    people.forEach((person) => {
      const name = person.tenantName
      if (!name) return
      if (searchText && !normalizeSearchText(name).includes(searchText)) return

      const current = counts.get(name)
      counts.set(name, {
        name,
        count: (current?.count ?? 0) + 1,
      })
    })

    return Array.from(counts.values())
      .sort((a, b) => b.count - a.count || a.name.localeCompare(b.name, "ja"))
      .slice(0, searchText ? 4 : 3)
  }, [people, searchText])

  const companySuggestions = useMemo(() => {
    const counts = new Map<string, OfficeSuggestion>()

    people.forEach((person) => {
      const name = person.company
      if (!name) return
      if (searchText && !normalizeSearchText(name).includes(searchText)) return

      const current = counts.get(name)
      counts.set(name, {
        name,
        count: (current?.count ?? 0) + 1,
      })
    })

    return Array.from(counts.values())
      .sort((a, b) => b.count - a.count || a.name.localeCompare(b.name, "ja"))
      .slice(0, searchText ? 4 : 3)
  }, [people, searchText])

  const goToPeopleSearch = (query = searchQuery) => {
    const trimmed = query.trim()
    setSearchOpen(false)
    if (trimmed) {
      saveSearchHistory({
        id: `query:${trimmed}`,
        label: trimmed,
        href: `/people?search=${encodeURIComponent(trimmed)}`,
        kind: "query",
        description: "人材一覧を検索",
      })
    }
    router.push(trimmed ? `/people?search=${encodeURIComponent(trimmed)}` : "/people")
  }

  const goToPerson = (person: Person) => {
    setSearchOpen(false)
    saveSearchHistory({
      id: `person:${person.id}`,
      label: person.name,
      href: `/people/${person.id}`,
      kind: "person",
      description: [person.kana, person.tenantName, person.company].filter(Boolean).join(" / ") || undefined,
    })
    router.push(`/people/${person.id}`)
  }

  const goToLegalEntity = (suggestion: LegalEntitySuggestion) => {
    setSearchOpen(false)
    saveSearchHistory({
      id: `legalEntity:${suggestion.name}`,
      label: suggestion.name,
      href: `/people?tenantName=${encodeURIComponent(suggestion.name)}`,
      kind: "legalEntity",
      description: `${suggestion.count}名`,
    })
    router.push(`/people?tenantName=${encodeURIComponent(suggestion.name)}`)
  }

  const goToCompany = (suggestion: OfficeSuggestion) => {
    setSearchOpen(false)
    saveSearchHistory({
      id: `office:${suggestion.name}`,
      label: suggestion.name,
      href: `/people?company=${encodeURIComponent(suggestion.name)}`,
      kind: "office",
      description: `${suggestion.count}名`,
    })
    router.push(`/people?company=${encodeURIComponent(suggestion.name)}`)
  }

  const goToHistoryItem = (item: SearchHistoryItem) => {
    setSearchOpen(false)
    saveSearchHistory(item)
    router.push(item.href)
  }

  const hasSuggestions =
    historySuggestions.length > 0 ||
    personSuggestions.length > 0 ||
    legalEntitySuggestions.length > 0 ||
    companySuggestions.length > 0

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

  return (
    <header className="flex h-14 items-center justify-between border-b border-border bg-card px-4 md:px-6">
      {/* Search and Company Switcher */}
      <div className="flex items-center gap-4 flex-1">
        <div className="relative max-w-md">
          <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            id="global-search-input"
            placeholder="人材名、法人名、事業所名で検索... (/ でフォーカス)"
            className="pl-10 pr-3 w-80"
            value={searchQuery}
            onFocus={() => setSearchOpen(true)}
            onBlur={() => window.setTimeout(() => setSearchOpen(false), 120)}
            onChange={(e) => {
              setSearchQuery(e.target.value)
              setSearchOpen(true)
            }}
            onKeyDown={(e) => {
              if (e.key === "Enter") {
                e.preventDefault()
                const firstPerson = personSuggestions[0]
                if (firstPerson && searchQuery.trim()) {
                  goToPerson(firstPerson)
                  return
                }
                goToPeopleSearch()
              }
              if (e.key === "Escape") {
                setSearchOpen(false)
              }
            }}
          />
          {searchOpen && (
            <div className="absolute left-0 top-full z-50 mt-2 w-[28rem] overflow-hidden rounded-md border border-border bg-popover text-popover-foreground shadow-lg">
              <div className="border-b px-3 py-2 text-xs font-medium text-muted-foreground">
                {searchQuery.trim() ? "検索候補" : "レコメンド"}
              </div>
              {hasSuggestions ? (
                <div className="max-h-96 overflow-y-auto py-1">
                  {historySuggestions.length > 0 && (
                    <div className="py-1">
                      <div className="px-3 py-1 text-[11px] font-medium text-muted-foreground">最近の検索</div>
                      {historySuggestions.map((item) => (
                        <button
                          key={item.id}
                          type="button"
                          className="flex w-full items-center justify-between gap-3 px-3 py-2 text-left hover:bg-muted"
                          onMouseDown={(e) => e.preventDefault()}
                          onClick={() => goToHistoryItem(item)}
                        >
                          <div className="flex min-w-0 items-center gap-2">
                            <History className="h-4 w-4 shrink-0 text-muted-foreground" />
                            <div className="min-w-0">
                              <div className="truncate text-sm font-medium">{item.label}</div>
                              {item.description && (
                                <div className="truncate text-xs text-muted-foreground">{item.description}</div>
                              )}
                            </div>
                          </div>
                        </button>
                      ))}
                    </div>
                  )}
                  {personSuggestions.length > 0 && (
                    <div className={cn("py-1", historySuggestions.length > 0 && "border-t")}>
                      <div className="px-3 py-1 text-[11px] font-medium text-muted-foreground">人材</div>
                      {personSuggestions.map((person) => (
                        <button
                          key={person.id}
                          type="button"
                          className="flex w-full items-center justify-between gap-3 px-3 py-2 text-left hover:bg-muted"
                          onMouseDown={(e) => e.preventDefault()}
                          onClick={() => goToPerson(person)}
                        >
                          <div className="min-w-0">
                            <div className="truncate text-sm font-medium">{person.name}</div>
                            <div className="truncate text-xs text-muted-foreground">
                              {[person.kana, person.tenantName, person.company].filter(Boolean).join(" / ") || "法人・事業所情報なし"}
                            </div>
                          </div>
                          {person.workingStatus && (
                            <span className="shrink-0 rounded border px-2 py-0.5 text-xs text-muted-foreground">
                              {person.workingStatus}
                            </span>
                          )}
                        </button>
                      ))}
                    </div>
                  )}
                  {legalEntitySuggestions.length > 0 && (
                    <div className={cn("py-1", (historySuggestions.length > 0 || personSuggestions.length > 0) && "border-t")}>
                      <div className="px-3 py-1 text-[11px] font-medium text-muted-foreground">法人</div>
                      {legalEntitySuggestions.map((legalEntity) => (
                        <button
                          key={legalEntity.name}
                          type="button"
                          className="flex w-full items-center justify-between gap-3 px-3 py-2 text-left hover:bg-muted"
                          onMouseDown={(e) => e.preventDefault()}
                          onClick={() => goToLegalEntity(legalEntity)}
                        >
                          <div className="flex min-w-0 items-center gap-2">
                            <Building2 className="h-4 w-4 shrink-0 text-muted-foreground" />
                            <span className="truncate text-sm font-medium">{legalEntity.name}</span>
                          </div>
                          <span className="shrink-0 text-xs text-muted-foreground">{legalEntity.count}名</span>
                        </button>
                      ))}
                    </div>
                  )}
                  {companySuggestions.length > 0 && (
                    <div className={cn("py-1", (historySuggestions.length > 0 || personSuggestions.length > 0 || legalEntitySuggestions.length > 0) && "border-t")}>
                      <div className="px-3 py-1 text-[11px] font-medium text-muted-foreground">事業所</div>
                      {companySuggestions.map((company) => (
                        <button
                          key={company.name}
                          type="button"
                          className="flex w-full items-center justify-between gap-3 px-3 py-2 text-left hover:bg-muted"
                          onMouseDown={(e) => e.preventDefault()}
                          onClick={() => goToCompany(company)}
                        >
                          <div className="flex min-w-0 items-center gap-2">
                            <Building2 className="h-4 w-4 shrink-0 text-muted-foreground" />
                            <span className="truncate text-sm font-medium">{company.name}</span>
                          </div>
                          <span className="shrink-0 text-xs text-muted-foreground">{company.count}名</span>
                        </button>
                      ))}
                    </div>
                  )}
                </div>
              ) : (
                <div className="px-3 py-6 text-center text-sm text-muted-foreground">
                  一致する候補がありません
                </div>
              )}
              <button
                type="button"
                className="flex w-full items-center justify-between border-t px-3 py-2 text-sm hover:bg-muted"
                onMouseDown={(e) => e.preventDefault()}
                onClick={() => goToPeopleSearch()}
              >
                <span>{searchQuery.trim() ? `「${searchQuery.trim()}」で人材一覧を検索` : "人材一覧を開く"}</span>
                <ArrowRight className="h-4 w-4 text-muted-foreground" />
              </button>
            </div>
          )}
        </div>

      </div>

      {/* Actions */}
      <div className="flex items-center gap-2">
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
          <div className="flex items-center gap-2">
            <span className="text-sm text-muted-foreground">{user.email}</span>
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
