'use client'

import { useEffect, useState } from 'react'
import { Button } from '@/components/ui/button'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'

export interface RejectReasonDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  documentName?: string | null
  submitting?: boolean
  onSubmit: (reason: string) => void
}

/**
 * 差戻し理由を入力するダイアログ。理由は必須。
 */
export function RejectReasonDialog({
  open,
  onOpenChange,
  documentName,
  submitting = false,
  onSubmit,
}: RejectReasonDialogProps) {
  const [reason, setReason] = useState('')

  // ダイアログを開くたびに入力をリセット
  useEffect(() => {
    if (open) {
      setReason('')
    }
  }, [open])

  const trimmed = reason.trim()

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>書類を差し戻す</DialogTitle>
          <DialogDescription>
            {documentName ? `「${documentName}」を差し戻します。` : '書類を差し戻します。'}
            会社の担当者に伝わるよう、修正してほしい点を具体的に書いてください。
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-2">
          <Label htmlFor="reject-reason">差戻しの理由 *</Label>
          <Textarea
            id="reject-reason"
            value={reason}
            onChange={(e) => setReason(e.target.value)}
            placeholder="例：登記事項証明書が3ヶ月以内のものではありません。再取得をお願いします。"
            rows={4}
          />
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)} disabled={submitting}>
            キャンセル
          </Button>
          <Button
            variant="destructive"
            onClick={() => onSubmit(trimmed)}
            disabled={!trimmed || submitting}
          >
            {submitting ? '差戻し中...' : '差し戻す'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
