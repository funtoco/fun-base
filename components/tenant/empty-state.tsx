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
        テナントにメンバーを招待して、チームでの作業を始めましょう。
      </p>
      <Button onClick={onAddMember} disabled={!canAddMember}>
        <UserPlus className="h-4 w-4 mr-2" />
        メンバーを招待
      </Button>
    </div>
  )
}
