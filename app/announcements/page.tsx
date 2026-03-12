"use client"

import { useState, useEffect } from "react"
import { useRouter, useSearchParams } from "next/navigation"
import { Card, CardContent } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import { ArrowLeft, Megaphone } from "lucide-react"
import { useAuth } from "@/contexts/auth-context"
import { formatDate } from "@/lib/utils"
import {
  getPublishedAnnouncements,
  getReadAnnouncementIds,
  markAnnouncementAsRead,
} from "@/lib/supabase/announcements"
import type { Announcement } from "@/lib/models"

export default function AnnouncementsPage() {
  const router = useRouter()
  const searchParams = useSearchParams()
  const { user } = useAuth()
  const [announcements, setAnnouncements] = useState<Announcement[]>([])
  const [readIds, setReadIds] = useState<string[]>([])
  const [loading, setLoading] = useState(true)
  const [selectedId, setSelectedId] = useState<string | null>(null)

  useEffect(() => {
    const load = async () => {
      try {
        const [items, reads] = await Promise.all([
          getPublishedAnnouncements(),
          getReadAnnouncementIds(),
        ])
        setAnnouncements(items)
        setReadIds(reads)

        // URLパラメータでお知らせIDが指定されていたら選択
        const idParam = searchParams.get("id")
        if (idParam && items.some(a => a.id === idParam)) {
          setSelectedId(idParam)
          // 既読にする
          if (!reads.includes(idParam)) {
            await markAnnouncementAsRead(idParam)
            setReadIds(prev => [...prev, idParam])
          }
        }
      } catch (err) {
        console.error('Failed to load announcements:', err)
      } finally {
        setLoading(false)
      }
    }
    if (user) load()
  }, [user, searchParams])

  const selected = announcements.find(a => a.id === selectedId)

  const handleSelect = async (id: string) => {
    setSelectedId(id)
    if (!readIds.includes(id)) {
      try {
        await markAnnouncementAsRead(id)
        setReadIds(prev => [...prev, id])
      } catch (err) {
        console.error('Failed to mark announcement as read:', err)
      }
    }
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center py-20">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary" />
      </div>
    )
  }

  return (
    <div className="container mx-auto py-6 px-4 max-w-5xl">
      <div className="flex items-center gap-4 mb-6">
        <Button variant="ghost" size="icon" onClick={() => router.back()}>
          <ArrowLeft className="h-5 w-5" />
        </Button>
        <h1 className="text-2xl font-bold flex items-center gap-2">
          <Megaphone className="h-6 w-6" />
          お知らせ
        </h1>
      </div>

      {announcements.length === 0 ? (
        <Card>
          <CardContent className="flex flex-col items-center justify-center py-12 text-muted-foreground">
            <Megaphone className="h-10 w-10 mb-3 opacity-50" />
            <p>お知らせはありません</p>
          </CardContent>
        </Card>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-[320px_1fr] gap-4">
          {/* 一覧 */}
          <div className="space-y-1">
            {announcements.map(a => {
              const isRead = readIds.includes(a.id)
              const isSelected = selectedId === a.id
              return (
                <button
                  key={a.id}
                  onClick={() => handleSelect(a.id)}
                  className={`w-full text-left rounded-lg px-4 py-3 transition-colors ${
                    isSelected
                      ? "bg-primary/10 border border-primary/20"
                      : "hover:bg-muted/50 border border-transparent"
                  }`}
                >
                  <div className="flex items-start gap-2">
                    {!isRead && (
                      <span className="mt-1.5 h-2 w-2 shrink-0 rounded-full bg-blue-500" />
                    )}
                    <div className={`flex-1 min-w-0 ${isRead && !isSelected ? "" : ""}`}>
                      <p className={`text-sm truncate ${!isRead ? "font-semibold" : ""}`}>
                        {a.title}
                      </p>
                      <p className="text-xs text-muted-foreground mt-0.5">
                        {formatDate(a.createdAt)}
                      </p>
                    </div>
                  </div>
                </button>
              )
            })}
          </div>

          {/* 詳細 */}
          <Card>
            <CardContent className="p-6">
              {selected ? (
                <div>
                  <div className="mb-4">
                    <h2 className="text-xl font-bold">{selected.title}</h2>
                    <p className="text-sm text-muted-foreground mt-1">
                      {formatDate(selected.createdAt)}
                    </p>
                  </div>
                  <div className="prose prose-sm max-w-none whitespace-pre-wrap text-foreground">
                    {selected.body}
                  </div>
                </div>
              ) : (
                <div className="flex flex-col items-center justify-center py-12 text-muted-foreground">
                  <Megaphone className="h-8 w-8 mb-2 opacity-50" />
                  <p className="text-sm">お知らせを選択してください</p>
                </div>
              )}
            </CardContent>
          </Card>
        </div>
      )}
    </div>
  )
}
