'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { MessageSquare, Send } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Textarea } from '@/components/ui/textarea'
import { useToast } from '@/lib/hooks/use-toast'
import type { CaseComment } from '@/lib/portal/types'

function formatTimestamp(iso: string): string {
  const d = new Date(iso)
  if (Number.isNaN(d.getTime())) {
    return iso
  }
  return d.toLocaleString('ja-JP', {
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
  })
}

/**
 * 案件のコメント一覧＋投稿フォーム。会社とファントコのやり取りをメール代わりに残す。
 */
export function CommentThread({
  caseId,
  comments,
}: {
  caseId: string
  comments: CaseComment[]
}) {
  const router = useRouter()
  const { toast } = useToast()
  const [body, setBody] = useState('')
  const [submitting, setSubmitting] = useState(false)

  const canSubmit = body.trim().length > 0 && !submitting

  async function handleSubmit() {
    if (!canSubmit) return
    setSubmitting(true)
    try {
      const res = await fetch(`/api/applications/${caseId}/comments`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ body }),
      })
      const result = await res.json().catch(() => ({}))
      if (!res.ok) {
        toast({
          variant: 'destructive',
          title: 'コメントを投稿できませんでした',
          description: result.error || '時間をおいて再度お試しください。',
        })
        return
      }
      setBody('')
      router.refresh()
    } catch {
      toast({ variant: 'destructive', title: 'コメントを投稿できませんでした' })
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <div className="rounded-xl border border-border bg-card shadow-sm">
      <div className="flex items-center gap-2 border-b border-border px-4 py-3">
        <MessageSquare className="h-4 w-4 text-muted-foreground" />
        <h4 className="text-sm font-semibold text-foreground">コメント</h4>
        <span className="text-xs text-muted-foreground">（{comments.length}件）</span>
      </div>

      <div className="space-y-4 px-4 py-4">
        {comments.length === 0 ? (
          <p className="text-center text-sm text-muted-foreground">
            まだコメントはありません。書類のやり取りや連絡事項をここに残せます。
          </p>
        ) : (
          <ul className="space-y-3">
            {comments.map((comment) => (
              <li
                key={comment.id}
                className="rounded-lg border border-border bg-background px-3 py-2"
              >
                <div className="flex items-center justify-between gap-2">
                  <span className="text-xs font-medium text-foreground">
                    {comment.authorLabel ?? '担当者'}
                  </span>
                  <span className="text-xs text-muted-foreground">
                    {formatTimestamp(comment.createdAt)}
                  </span>
                </div>
                <p className="mt-1 whitespace-pre-wrap text-sm text-foreground">
                  {comment.body}
                </p>
              </li>
            ))}
          </ul>
        )}

        <div className="space-y-2 border-t border-border pt-4">
          <Textarea
            value={body}
            onChange={(e) => setBody(e.target.value)}
            placeholder="連絡事項や書類についてのやり取りを入力..."
            rows={3}
          />
          <div className="flex justify-end">
            <Button onClick={handleSubmit} disabled={!canSubmit} className="gap-1">
              <Send className="h-3.5 w-3.5" />
              {submitting ? '投稿中...' : '投稿'}
            </Button>
          </div>
        </div>
      </div>
    </div>
  )
}
