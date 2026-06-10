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
import { Checkbox } from "@/components/ui/checkbox"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { useToast } from "@/lib/hooks/use-toast"
import type { TenantOffice } from "@/lib/supabase/tenants"

interface InviteMemberDialogProps {
  tenantId: string
  open: boolean
  onOpenChange: (open: boolean) => void
  onInviteSent: () => void
  canChooseRole?: boolean
  offices?: TenantOffice[]
}

export function InviteMemberDialog({ 
  tenantId, 
  open, 
  onOpenChange, 
  onInviteSent,
  canChooseRole = true,
  offices = [],
}: InviteMemberDialogProps) {
  const [name, setName] = useState("")
  const [email, setEmail] = useState("")
  const [role, setRole] = useState<'admin' | 'member' | 'guest'>('member')
  const [selectedOfficeIds, setSelectedOfficeIds] = useState<string[]>([])
  const [errors, setErrors] = useState<Record<string, string>>({})
  const [loading, setLoading] = useState(false)
  const { toast } = useToast()
  const dialogTitle = canChooseRole ? "メンバーをメールで招待" : "企業担当者を招待"
  const dialogDescription = canChooseRole
    ? "新しいメンバーをメールでテナントに招待します。"
    : "企業担当者へ招待メールを送信します。招待完了までは招待中として表示されます。"
  const submitLabel = loading ? "送信中..." : "招待メールを送信"

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
          role: inviteRole,
          officeIds: selectedOfficeIds,
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
      setSelectedOfficeIds([])
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
    setSelectedOfficeIds([])
    setErrors({})
    onOpenChange(false)
  }

  const toggleOffice = (officeId: string, checked: boolean) => {
    setSelectedOfficeIds((currentOfficeIds) =>
      checked
        ? Array.from(new Set([...currentOfficeIds, officeId]))
        : currentOfficeIds.filter((id) => id !== officeId)
    )
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-[425px]">
        <DialogHeader>
          <DialogTitle>{dialogTitle}</DialogTitle>
          <DialogDescription>{dialogDescription}</DialogDescription>
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
                  member - 企業担当者は member として招待されます
                </div>
              </div>
            )}
            {offices.length > 0 && (
              <div className="grid gap-2">
                <Label>所属先</Label>
                <div className="max-h-48 space-y-2 overflow-y-auto rounded-md border p-3">
                  {offices.map((office) => (
                    <Label
                      key={office.id}
                      htmlFor={`invite-office-${office.id}`}
                      className="flex cursor-pointer items-center gap-3 rounded-md px-2 py-2 hover:bg-muted"
                    >
                      <Checkbox
                        id={`invite-office-${office.id}`}
                        checked={selectedOfficeIds.includes(office.id)}
                        onCheckedChange={(checked) => toggleOffice(office.id, checked === true)}
                      />
                      <span className="text-sm font-medium">{office.name}</span>
                    </Label>
                  ))}
                </div>
              </div>
            )}
          </div>
          <DialogFooter>
            <Button type="button" variant="outline" onClick={handleCancel} disabled={loading}>
              キャンセル
            </Button>
            <Button type="submit" disabled={loading}>
              {submitLabel}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  )
}
