"use client"

import { Button } from "@/components/ui/button"
import { UserPlus, Users } from "lucide-react"

interface EmptyStateProps {
  onAddMember: () => void
  canAddMember?: boolean
}

export function EmptyState({ onAddMember, canAddMember = true }: EmptyStateProps) {
  return (
    <div className="text-center py-12">
      <div className="mx-auto w-24 h-24 bg-muted rounded-full flex items-center justify-center mb-4">
        <Users className="h-12 w-12 text-muted-foreground" />
      </div>
      <h3 className="text-lg font-semibold mb-2">メンバーがいません</h3>
      <p className="text-muted-foreground mb-6 max-w-sm mx-auto">
        メール招待を送信して、社内メンバーや企業担当者の追加を始めましょう。
      </p>
      <Button onClick={onAddMember} disabled={!canAddMember}>
        <UserPlus className="h-4 w-4 mr-2" />
        メールで招待
      </Button>
    </div>
  )
}
