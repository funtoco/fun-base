"use client"

import { useEffect, useMemo, useState } from "react"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
import { Button } from "@/components/ui/button"
import { Checkbox } from "@/components/ui/checkbox"
import { Label } from "@/components/ui/label"
import type { TenantOffice, UserTenant } from "@/lib/supabase/tenants"

interface MemberOfficesDialogProps {
  member: UserTenant | null
  offices: TenantOffice[]
  open: boolean
  onOpenChange: (open: boolean) => void
  onSave: (memberId: string, officeIds: string[]) => Promise<void>
}

export function MemberOfficesDialog({
  member,
  offices,
  open,
  onOpenChange,
  onSave,
}: MemberOfficesDialogProps) {
  const [selectedOfficeIds, setSelectedOfficeIds] = useState<string[]>([])
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    if (!member || !open) {
      setSelectedOfficeIds([])
      setError(null)
      return
    }

    setSelectedOfficeIds((member.offices || []).map((office) => office.id))
    setError(null)
  }, [member, open])

  const selectedOfficeIdSet = useMemo(
    () => new Set(selectedOfficeIds),
    [selectedOfficeIds]
  )

  const toggleOffice = (officeId: string, checked: boolean) => {
    setSelectedOfficeIds((currentOfficeIds) =>
      checked
        ? Array.from(new Set([...currentOfficeIds, officeId]))
        : currentOfficeIds.filter((id) => id !== officeId)
    )
  }

  const handleSave = async () => {
    if (!member) {
      return
    }

    setLoading(true)
    setError(null)

    try {
      await onSave(member.id, selectedOfficeIds)
      onOpenChange(false)
    } catch (saveError) {
      console.error("Error updating member offices:", saveError)
      setError(saveError instanceof Error ? saveError.message : "所属先の更新に失敗しました")
    } finally {
      setLoading(false)
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-[480px]">
        <DialogHeader>
          <DialogTitle>所属先スコープ</DialogTitle>
          <DialogDescription>{member?.email || "メンバー"} の担当所属先を管理します。</DialogDescription>
        </DialogHeader>

        <div className="space-y-3 py-2">
          <div className="rounded-md border px-3 py-2 text-sm text-muted-foreground">
            未選択の場合は全所属先を対象にします
          </div>

          {offices.length === 0 ? (
            <div className="rounded-md border px-3 py-6 text-center text-sm text-muted-foreground">
              所属先が見つかりません
            </div>
          ) : (
            <div className="max-h-64 space-y-2 overflow-y-auto rounded-md border p-3">
              {offices.map((office) => (
                <Label
                  key={office.id}
                  htmlFor={`office-${office.id}`}
                  className="flex cursor-pointer items-center gap-3 rounded-md px-2 py-2 hover:bg-muted"
                >
                  <Checkbox
                    id={`office-${office.id}`}
                    checked={selectedOfficeIdSet.has(office.id)}
                    onCheckedChange={(checked) => toggleOffice(office.id, checked === true)}
                  />
                  <span className="text-sm font-medium">{office.name}</span>
                </Label>
              ))}
            </div>
          )}

          {error && <p className="text-sm text-destructive">{error}</p>}
        </div>

        <DialogFooter>
          <Button type="button" variant="outline" onClick={() => onOpenChange(false)} disabled={loading}>
            キャンセル
          </Button>
          <Button type="button" onClick={handleSave} disabled={loading}>
            {loading ? "保存中..." : "保存"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
