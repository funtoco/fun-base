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
import { useToast } from "@/lib/hooks/use-toast"

interface InviteMemberDialogProps {
  tenantId: string
  open: boolean
  onOpenChange: (open: boolean) => void
  onInviteSent: () => void
  canChooseRole?: boolean
}

export function InviteMemberDialog({ 
  tenantId, 
  open, 
  onOpenChange, 
  onInviteSent,
  canChooseRole = true,
}: InviteMemberDialogProps) {
  const [name, setName] = useState("")
  const [email, setEmail] = useState("")
  const [role, setRole] = useState<'admin' | 'member' | 'guest'>('member')
  const [errors, setErrors] = useState<Record<string, string>>({})
  const [loading, setLoading] = useState(false)
  const { toast } = useToast()

  const validateForm = () => {
    const newErrors: Record<string, string> = {}

    if (!email.trim()) {
      newErrors.email = "メールアドレスを入力してください"
    } else if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
      newErrors.email = "有効なメールアドレスを入力してください"
    }

    setErrors(newErrors)
    return Object.keys(newErrors).length === 0
  }

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()

    if (!validateForm()) {
      return
    }

    setLoading(true)
    try {
      const inviteRole = canChooseRole ? role : "member"

      const response = await fetch(`/api/tenants/${tenantId}/members/invite`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          email: email.toLowerCase().trim(),
          role: inviteRole
        })
      })

      const result = await response.json()

      if (!response.ok) {
        throw new Error(result.error || 'Failed to send invitation')
      }

      toast({
        title: "招待を送信しました",
        description: `${name || email}さんに招待メールを送信しました`
      })

      // Reset form
      setName("")
      setEmail("")
      setRole('member')
      setErrors({})
      onOpenChange(false)
      onInviteSent()
    } catch (error) {
      console.error('Error sending invitation:', error)
      toast({
        title: "エラー",
        description: error instanceof Error ? error.message : "招待の送信に失敗しました",
        variant: "destructive"
      })
    } finally {
      setLoading(false)
    }
  }

  const handleCancel = () => {
    setName("")
    setEmail("")
    setRole('member')
    setErrors({})
    onOpenChange(false)
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-[425px]">
        <DialogHeader>
          <DialogTitle>メンバーを招待</DialogTitle>
          <DialogDescription>
            新しいメンバーをテナントに招待します。招待メールが送信されます。
          </DialogDescription>
        </DialogHeader>
        <form onSubmit={handleSubmit}>
          <div className="grid gap-4 py-4">
            <div className="grid gap-2">
              <Label htmlFor="name">名前（任意）</Label>
              <Input 
                id="name" 
                value={name} 
                onChange={(e) => setName(e.target.value)} 
                placeholder="田中太郎" 
              />
            </div>
            <div className="grid gap-2">
              <Label htmlFor="email">メールアドレス</Label>
              <Input
                id="email"
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="tanaka@example.com"
              />
              {errors.email && <p className="text-sm text-destructive">{errors.email}</p>}
            </div>
            {canChooseRole ? (
              <div className="grid gap-2">
                <Label htmlFor="role">ロール</Label>
                <Select value={role} onValueChange={(value: 'admin' | 'member' | 'guest') => setRole(value)}>
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
            ) : (
              <div className="grid gap-2">
                <Label>ロール</Label>
                <div className="rounded-md border px-3 py-2 text-sm text-muted-foreground">
                  Member - 企業担当者は Member として招待されます
                </div>
              </div>
            )}
          </div>
          <DialogFooter>
            <Button type="button" variant="outline" onClick={handleCancel} disabled={loading}>
              キャンセル
            </Button>
            <Button type="submit" disabled={loading}>
              {loading ? '送信中...' : '招待を送信'}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  )
}
