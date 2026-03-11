"use client"

import { useState, useEffect } from "react"
import { useRouter } from "next/navigation"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import { Input } from "@/components/ui/input"
import { Textarea } from "@/components/ui/textarea"
import { Label } from "@/components/ui/label"
import { Switch } from "@/components/ui/switch"
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table"
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog"
import { ArrowLeft, Plus, Pencil, Trash2, Megaphone } from "lucide-react"
import { useAuth } from "@/contexts/auth-context"
import { useToast } from "@/lib/hooks/use-toast"
import { formatDateTime } from "@/lib/utils"
import {
  getAllAnnouncements,
  createAnnouncement,
  updateAnnouncement,
  deleteAnnouncement,
} from "@/lib/supabase/announcements"
import type { Announcement } from "@/lib/models"

export default function AdminAnnouncementsPage() {
  const router = useRouter()
  const { user, loading: authLoading } = useAuth()
  const { toast } = useToast()
  const [announcements, setAnnouncements] = useState<Announcement[]>([])
  const [loading, setLoading] = useState(true)
  const [dialogOpen, setDialogOpen] = useState(false)
  const [editing, setEditing] = useState<Announcement | null>(null)
  const [title, setTitle] = useState("")
  const [body, setBody] = useState("")
  const [published, setPublished] = useState(true)
  const [saving, setSaving] = useState(false)

  const isFuntocoUser = user?.email?.endsWith("@funtoco.jp") ?? false

  useEffect(() => {
    if (authLoading) return
    if (!isFuntocoUser) {
      router.replace("/people")
      return
    }
    loadAnnouncements()
  }, [authLoading, isFuntocoUser])

  const loadAnnouncements = async () => {
    try {
      const data = await getAllAnnouncements()
      setAnnouncements(data)
    } catch (error) {
      console.error("Failed to load announcements:", error)
    } finally {
      setLoading(false)
    }
  }

  const openCreateDialog = () => {
    setEditing(null)
    setTitle("")
    setBody("")
    setPublished(true)
    setDialogOpen(true)
  }

  const openEditDialog = (announcement: Announcement) => {
    setEditing(announcement)
    setTitle(announcement.title)
    setBody(announcement.body)
    setPublished(announcement.published)
    setDialogOpen(true)
  }

  const handleSave = async () => {
    if (!title.trim() || !body.trim()) {
      toast({ title: "タイトルと本文を入力してください", variant: "destructive" })
      return
    }

    setSaving(true)
    try {
      if (editing) {
        await updateAnnouncement(editing.id, { title, body, published })
        toast({ title: "お知らせを更新しました" })
      } else {
        await createAnnouncement({ title, body, published })
        toast({ title: "お知らせを作成しました" })
      }
      setDialogOpen(false)
      await loadAnnouncements()
    } catch (error) {
      console.error("Failed to save announcement:", error)
      toast({ title: "保存に失敗しました", variant: "destructive" })
    } finally {
      setSaving(false)
    }
  }

  const handleDelete = async (id: string) => {
    if (!window.confirm("このお知らせを削除しますか？")) return
    try {
      await deleteAnnouncement(id)
      toast({ title: "お知らせを削除しました" })
      await loadAnnouncements()
    } catch (error) {
      console.error("Failed to delete announcement:", error)
      toast({ title: "削除に失敗しました", variant: "destructive" })
    }
  }

  return (
    <div className="container mx-auto py-6 px-4 max-w-5xl">
      <div className="flex items-center gap-4 mb-6">
        <Button variant="ghost" size="icon" onClick={() => router.back()}>
          <ArrowLeft className="h-5 w-5" />
        </Button>
        <div className="flex-1">
          <h1 className="text-2xl font-bold flex items-center gap-2">
            <Megaphone className="h-6 w-6" />
            お知らせ管理
          </h1>
          <p className="text-sm text-muted-foreground mt-1">
            ユーザーに表示するお知らせを管理します
          </p>
        </div>
        <Button onClick={openCreateDialog}>
          <Plus className="h-4 w-4 mr-2" />
          新しいお知らせ
        </Button>
      </div>

      <Card>
        <CardContent className="p-0">
          {loading ? (
            <div className="flex items-center justify-center py-12 text-muted-foreground">
              読み込み中...
            </div>
          ) : announcements.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-12 text-muted-foreground">
              <Megaphone className="h-10 w-10 mb-3 opacity-50" />
              <p>お知らせがありません</p>
              <Button variant="outline" className="mt-4" onClick={openCreateDialog}>
                <Plus className="h-4 w-4 mr-2" />
                最初のお知らせを作成
              </Button>
            </div>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>ステータス</TableHead>
                  <TableHead>タイトル</TableHead>
                  <TableHead>作成日</TableHead>
                  <TableHead className="w-24">操作</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {announcements.map(a => (
                  <TableRow key={a.id}>
                    <TableCell>
                      <Badge variant={a.published ? "default" : "secondary"}>
                        {a.published ? "公開中" : "下書き"}
                      </Badge>
                    </TableCell>
                    <TableCell>
                      <div>
                        <p className="font-medium">{a.title}</p>
                        <p className="text-xs text-muted-foreground line-clamp-1 mt-0.5">{a.body}</p>
                      </div>
                    </TableCell>
                    <TableCell className="text-sm text-muted-foreground">
                      {formatDateTime(a.createdAt)}
                    </TableCell>
                    <TableCell>
                      <div className="flex items-center gap-1">
                        <Button variant="ghost" size="icon" onClick={() => openEditDialog(a)}>
                          <Pencil className="h-4 w-4" />
                        </Button>
                        <Button
                          variant="ghost"
                          size="icon"
                          className="text-red-600 hover:text-red-700"
                          onClick={() => handleDelete(a.id)}
                        >
                          <Trash2 className="h-4 w-4" />
                        </Button>
                      </div>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>

      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent className="sm:max-w-lg">
          <DialogHeader>
            <DialogTitle>{editing ? "お知らせを編集" : "新しいお知らせ"}</DialogTitle>
          </DialogHeader>
          <div className="space-y-4 py-4">
            <div className="space-y-2">
              <Label htmlFor="title">タイトル</Label>
              <Input
                id="title"
                value={title}
                onChange={(e) => setTitle(e.target.value)}
                placeholder="例: 書類管理機能を追加しました"
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="body">本文</Label>
              <Textarea
                id="body"
                value={body}
                onChange={(e) => setBody(e.target.value)}
                placeholder="お知らせの詳細を入力..."
                rows={5}
              />
            </div>
            <div className="flex items-center gap-3">
              <Switch
                id="published"
                checked={published}
                onCheckedChange={setPublished}
              />
              <Label htmlFor="published">公開する</Label>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setDialogOpen(false)}>
              キャンセル
            </Button>
            <Button onClick={handleSave} disabled={saving}>
              {saving ? "保存中..." : editing ? "更新" : "作成"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  )
}
