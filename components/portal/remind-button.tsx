'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { Bell } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { useToast } from '@/lib/hooks/use-toast'

/**
 * 案件のリマインドを記録するボタン（writer=OP向け）。押下で 'reminded' イベントを記録し、
 * トーストで結果を表示する。メール送信は今後対応（nodemailer 未導入）。
 */
export function RemindButton({ caseId }: { caseId: string }) {
  const router = useRouter()
  const { toast } = useToast()
  const [submitting, setSubmitting] = useState(false)

  async function handleRemind() {
    setSubmitting(true)
    try {
      const res = await fetch(`/api/applications/${caseId}/remind`, { method: 'POST' })
      const result = await res.json().catch(() => ({}))
      if (!res.ok) {
        toast({
          variant: 'destructive',
          title: 'リマインドに失敗しました',
          description: result.error || '時間をおいて再度お試しください。',
        })
        return
      }
      toast({
        title: 'リマインドを記録しました',
        description: result.message || undefined,
      })
      router.refresh()
    } catch {
      toast({ variant: 'destructive', title: 'リマインドに失敗しました' })
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <Button variant="outline" onClick={handleRemind} disabled={submitting} className="gap-1">
      <Bell className="h-4 w-4" />
      {submitting ? '記録中...' : 'リマインド'}
    </Button>
  )
}
