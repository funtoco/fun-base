"use client"

import { useState } from "react"
import { Button } from "@/components/ui/button"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { Switch } from "@/components/ui/switch"
import { Copy, Check } from "lucide-react"
import { Alert, AlertDescription } from "@/components/ui/alert"

interface InviteLinkDialogProps {
  tenantId: string
  open: boolean
  onOpenChange: (open: boolean) => void
}

export function InviteLinkDialog({ tenantId, open, onOpenChange }: InviteLinkDialogProps) {
  const [defaultRole, setDefaultRole] = useState<'admin' | 'member' | 'guest'>('member')
  const [hasExpiration, setHasExpiration] = useState(false)
  const [expirationDays, setExpirationDays] = useState(7)
  const [generatedLink, setGeneratedLink] = useState("")
  const [copied, setCopied] = useState(false)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState("")

  const handleCreate = async () => {
    setLoading(true)
    setError("")

    try {
      const response = await fetch(`/api/tenants/${tenantId}/invite-links`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          defaultRole,
          expiresInDays: hasExpiration ? expirationDays : undefined,
        }),
      })

      const data = await response.json()

      if (!response.ok) {
        setError(data.error || "招待リンクの作成に失敗しました")
        return
      }

      setGeneratedLink(data.url)
    } catch (err) {
      console.error("Error creating invite link:", err)
      setError("招待リンクの作成中にエラーが発生しました")
    } finally {
      setLoading(false)
    }
  }

  const copyToClipboard = async () => {
    try {
      await navigator.clipboard.writeText(generatedLink)
      setCopied(true)
      setTimeout(() => setCopied(false), 2000)
    } catch (err) {
      console.error("Failed to copy link:", err)
    }
  }

  const handleClose = () => {
    setGeneratedLink("")
    setCopied(false)
    setError("")
    onOpenChange(false)
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-[500px]">
        <DialogHeader>
          <DialogTitle>招待リンクを作成</DialogTitle>
          <DialogDescription>
            共有可能な招待リンクを作成して、メンバーを簡単に招待できます。
          </DialogDescription>
        </DialogHeader>

        {!generatedLink ? (
          <div className="grid gap-4 py-4">
            {error && (
              <Alert variant="destructive">
                <AlertDescription>{error}</AlertDescription>
              </Alert>
            )}

            <div className="grid gap-2">
              <Label htmlFor="defaultRole">デフォルトロール</Label>
              <Select value={defaultRole} onValueChange={(value: 'admin' | 'member' | 'guest') => setDefaultRole(value)}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="guest">Guest - 閲覧のみ</SelectItem>
                  <SelectItem value="member">Member - 一般権限</SelectItem>
                  <SelectItem value="admin">Admin - 管理権限</SelectItem>
                </SelectContent>
              </Select>
            </div>

            <div className="flex items-center space-x-2">
              <Switch
                id="hasExpiration"
                checked={hasExpiration}
                onCheckedChange={setHasExpiration}
              />
              <Label htmlFor="hasExpiration">有効期限を設定</Label>
            </div>

            {hasExpiration && (
              <div className="grid gap-2">
                <Label htmlFor="expirationDays">有効期限（日数）</Label>
                <Input
                  id="expirationDays"
                  type="number"
                  min="1"
                  max="365"
                  value={expirationDays}
                  onChange={(e) => setExpirationDays(parseInt(e.target.value) || 7)}
                />
              </div>
            )}
          </div>
        ) : (
          <div className="grid gap-4 py-4">
            <div className="grid gap-2">
              <Label>生成された招待リンク</Label>
              <div className="flex items-center space-x-2">
                <Input
                  value={generatedLink}
                  readOnly
                  className="font-mono text-sm"
                />
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  onClick={copyToClipboard}
                >
                  {copied ? (
                    <Check className="h-4 w-4" />
                  ) : (
                    <Copy className="h-4 w-4" />
                  )}
                </Button>
              </div>
              {copied && (
                <p className="text-sm text-green-600">リンクをコピーしました</p>
              )}
            </div>

            <div className="rounded-lg bg-muted p-3">
              <h4 className="font-medium text-sm mb-2">リンクの詳細</h4>
              <div className="space-y-1 text-sm text-muted-foreground">
                <p>デフォルトロール: {defaultRole === 'admin' ? 'Admin' : defaultRole === 'member' ? 'Member' : 'Guest'}</p>
                {hasExpiration && <p>有効期限: {expirationDays}日</p>}
              </div>
            </div>
          </div>
        )}

        <DialogFooter>
          <Button type="button" variant="outline" onClick={handleClose}>
            {generatedLink ? '閉じる' : 'キャンセル'}
          </Button>
          {!generatedLink && (
            <Button type="button" onClick={handleCreate} disabled={loading}>
              {loading ? "作成中..." : "リンクを作成"}
            </Button>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
