import React from 'react'
import { Button } from '@/components/ui/button'

export function MarkAllReadButton({ unreadCount, saving, onClick }: {
  unreadCount: number
  saving: boolean
  onClick: () => void
}) {
  return (
    <Button variant="outline" onClick={onClick} disabled={unreadCount === 0 || saving}>
      {saving ? '既読にしています...' : 'すべて既読にする'}
    </Button>
  )
}
