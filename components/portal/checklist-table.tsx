'use client'

import { useRef, useState } from 'react'
import { useRouter } from 'next/navigation'
import { Building2, CheckCircle2, Eye, Undo2, Upload, User, XCircle } from 'lucide-react'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table'
import { useToast } from '@/lib/hooks/use-toast'
import { cn } from '@/lib/utils'
import {
  COPY_TYPE_LABELS,
  REQUIREMENT_STATUS_LABELS,
  type CaseDocumentRequirement,
  type DocumentKind,
  type GroupedRequirements,
  type RequirementStatus,
} from '@/lib/portal/types'
import { RejectReasonDialog } from './reject-reason-dialog'

// ステータスbadge色分け：未提出=グレー / 確認中=青 / 承認済み=緑 / 要修正=赤
const STATUS_STYLES: Record<RequirementStatus, string> = {
  not_submitted: 'bg-muted text-muted-foreground border border-border',
  reviewing:
    'bg-blue-100 text-blue-700 border border-blue-200 dark:bg-blue-950 dark:text-blue-300 dark:border-blue-900',
  approved:
    'bg-green-100 text-green-700 border border-green-200 dark:bg-green-950 dark:text-green-300 dark:border-green-900',
  needs_fix:
    'bg-red-100 text-red-700 border border-red-200 dark:bg-red-950 dark:text-red-300 dark:border-red-900',
}

function StatusBadge({ status }: { status: RequirementStatus }) {
  return (
    <span
      className={cn(
        'inline-flex w-fit items-center rounded-md px-2 py-0.5 text-xs font-medium whitespace-nowrap',
        STATUS_STYLES[status]
      )}
    >
      {REQUIREMENT_STATUS_LABELS[status]}
    </span>
  )
}

function requirementDoc(
  item: CaseDocumentRequirement
): { kind: DocumentKind; docId: string } | null {
  if (item.officeDocumentId) {
    return { kind: 'office', docId: item.officeDocumentId }
  }
  if (item.personDocumentId) {
    return { kind: 'person', docId: item.personDocumentId }
  }
  return null
}

interface RowActionsState {
  busyId: string | null
  reject: { requirementId: string; name: string } | null
}

function RequirementRow({
  caseId,
  item,
  canReview,
  actions,
  setActions,
}: {
  caseId: string
  item: CaseDocumentRequirement
  canReview: boolean
  actions: RowActionsState
  setActions: React.Dispatch<React.SetStateAction<RowActionsState>>
}) {
  const router = useRouter()
  const { toast } = useToast()
  const fileInputRef = useRef<HTMLInputElement>(null)

  const busy = actions.busyId === item.id
  const doc = requirementDoc(item)
  const canUpload = item.status === 'not_submitted' || item.status === 'needs_fix'

  function setBusy(on: boolean) {
    setActions((prev) => ({ ...prev, busyId: on ? item.id : null }))
  }

  async function handleUpload(file: File) {
    setBusy(true)
    try {
      const form = new FormData()
      form.append('file', file)
      const res = await fetch(
        `/api/applications/${caseId}/requirements/${item.id}/documents`,
        { method: 'POST', body: form }
      )
      const result = await res.json().catch(() => ({}))
      if (!res.ok) {
        toast({
          variant: 'destructive',
          title: 'アップロードに失敗しました',
          description: result.error || '時間をおいて再度お試しください。',
        })
        return
      }
      toast({ title: '提出しました', description: `「${item.name}」を提出しました（確認中）。` })
      router.refresh()
    } catch {
      toast({
        variant: 'destructive',
        title: 'アップロードに失敗しました',
        description: 'ネットワークエラーが発生しました。',
      })
    } finally {
      setBusy(false)
    }
  }

  async function handleView() {
    if (!doc) return
    setBusy(true)
    try {
      const res = await fetch(`/api/documents/${doc.kind}/${doc.docId}/url`)
      const result = await res.json().catch(() => ({}))
      if (!res.ok || !result.url) {
        toast({
          variant: 'destructive',
          title: '表示できませんでした',
          description: result.error || '時間をおいて再度お試しください。',
        })
        return
      }
      window.open(result.url, '_blank', 'noopener,noreferrer')
    } catch {
      toast({ variant: 'destructive', title: '表示できませんでした' })
    } finally {
      setBusy(false)
    }
  }

  async function handleReview(action: 'approve' | 'reset') {
    setBusy(true)
    try {
      const res = await fetch(
        `/api/applications/${caseId}/requirements/${item.id}`,
        {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ action }),
        }
      )
      const result = await res.json().catch(() => ({}))
      if (!res.ok) {
        toast({
          variant: 'destructive',
          title: '操作に失敗しました',
          description: result.error || '時間をおいて再度お試しください。',
        })
        return
      }
      toast({
        title: action === 'approve' ? '承認しました' : '未提出に戻しました',
        description: `「${item.name}」`,
      })
      router.refresh()
    } catch {
      toast({ variant: 'destructive', title: '操作に失敗しました' })
    } finally {
      setBusy(false)
    }
  }

  return (
    <TableRow>
      <TableCell className="font-medium align-top">
        {item.name}
        {item.status === 'needs_fix' && item.rejectionReason && (
          <p className="mt-1 text-xs text-red-600 dark:text-red-400">
            差戻し理由：{item.rejectionReason}
          </p>
        )}
      </TableCell>
      <TableCell className="align-top">
        {item.isRequired ? (
          <Badge variant="outline" className="border-primary/30 text-primary">
            必須
          </Badge>
        ) : (
          <span className="text-sm text-muted-foreground">任意</span>
        )}
      </TableCell>
      <TableCell className="align-top">
        {item.copyType ? (
          <span className="text-sm">{COPY_TYPE_LABELS[item.copyType]}</span>
        ) : (
          <span className="text-muted-foreground">-</span>
        )}
      </TableCell>
      <TableCell className="align-top">
        <StatusBadge status={item.status} />
      </TableCell>
      <TableCell className="align-top">
        <div className="flex flex-wrap items-center gap-2">
          <input
            ref={fileInputRef}
            type="file"
            className="hidden"
            accept="image/png,image/jpeg,image/webp,image/heic,image/heif,application/pdf"
            onChange={(e) => {
              const file = e.target.files?.[0]
              if (file) {
                void handleUpload(file)
              }
              e.target.value = ''
            }}
          />
          {canUpload && (
            <Button
              size="sm"
              variant="outline"
              disabled={busy}
              onClick={() => fileInputRef.current?.click()}
              className="gap-1"
            >
              <Upload className="h-3.5 w-3.5" />
              {item.status === 'needs_fix' ? '再提出' : 'アップロード'}
            </Button>
          )}
          {doc && (
            <Button
              size="sm"
              variant="ghost"
              disabled={busy}
              onClick={handleView}
              className="gap-1"
            >
              <Eye className="h-3.5 w-3.5" />
              表示
            </Button>
          )}
          {canReview && item.status === 'reviewing' && (
            <>
              <Button
                size="sm"
                variant="outline"
                disabled={busy}
                onClick={() => handleReview('approve')}
                className="gap-1 border-green-300 text-green-700 hover:bg-green-50 dark:border-green-900 dark:text-green-300 dark:hover:bg-green-950"
              >
                <CheckCircle2 className="h-3.5 w-3.5" />
                承認
              </Button>
              <Button
                size="sm"
                variant="outline"
                disabled={busy}
                onClick={() =>
                  setActions((prev) => ({
                    ...prev,
                    reject: { requirementId: item.id, name: item.name },
                  }))
                }
                className="gap-1 border-red-300 text-red-700 hover:bg-red-50 dark:border-red-900 dark:text-red-300 dark:hover:bg-red-950"
              >
                <XCircle className="h-3.5 w-3.5" />
                差戻し
              </Button>
            </>
          )}
          {canReview && item.status === 'approved' && (
            <Button
              size="sm"
              variant="ghost"
              disabled={busy}
              onClick={() => handleReview('reset')}
              className="gap-1 text-muted-foreground"
            >
              <Undo2 className="h-3.5 w-3.5" />
              取消
            </Button>
          )}
        </div>
      </TableCell>
    </TableRow>
  )
}

function ChecklistSection({
  caseId,
  title,
  icon,
  items,
  emptyLabel,
  canReview,
  actions,
  setActions,
}: {
  caseId: string
  title: string
  icon: React.ReactNode
  items: CaseDocumentRequirement[]
  emptyLabel: string
  canReview: boolean
  actions: RowActionsState
  setActions: React.Dispatch<React.SetStateAction<RowActionsState>>
}) {
  return (
    <div className="rounded-xl border border-border bg-card shadow-sm">
      <div className="flex items-center gap-2 border-b border-border px-4 py-3">
        {icon}
        <h4 className="text-sm font-semibold text-foreground">{title}</h4>
        <span className="text-xs text-muted-foreground">（{items.length}件）</span>
      </div>
      {items.length === 0 ? (
        <p className="px-4 py-6 text-center text-sm text-muted-foreground">{emptyLabel}</p>
      ) : (
        <div className="overflow-x-auto">
          <Table className="min-w-[720px]">
            <TableHeader>
              <TableRow>
                <TableHead>書類名</TableHead>
                <TableHead className="w-[90px]">必須/任意</TableHead>
                <TableHead className="w-[90px]">原本/写し</TableHead>
                <TableHead className="w-[100px]">ステータス</TableHead>
                <TableHead className="w-[220px]">操作</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {items.map((item) => (
                <RequirementRow
                  key={item.id}
                  caseId={caseId}
                  item={item}
                  canReview={canReview}
                  actions={actions}
                  setActions={setActions}
                />
              ))}
            </TableBody>
          </Table>
        </div>
      )}
    </div>
  )
}

export function ChecklistTable({
  caseId,
  requirements,
  canReview,
}: {
  caseId: string
  requirements: GroupedRequirements
  canReview: boolean
}) {
  const router = useRouter()
  const { toast } = useToast()
  const [actions, setActions] = useState<RowActionsState>({ busyId: null, reject: null })
  const [rejectSubmitting, setRejectSubmitting] = useState(false)

  async function submitReject(reason: string) {
    if (!actions.reject) return
    const requirementId = actions.reject.requirementId
    setRejectSubmitting(true)
    try {
      const res = await fetch(
        `/api/applications/${caseId}/requirements/${requirementId}`,
        {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ action: 'reject', reason }),
        }
      )
      const result = await res.json().catch(() => ({}))
      if (!res.ok) {
        toast({
          variant: 'destructive',
          title: '差戻しに失敗しました',
          description: result.error || '時間をおいて再度お試しください。',
        })
        return
      }
      toast({ title: '差し戻しました', description: '会社の担当者に修正を依頼できます。' })
      setActions((prev) => ({ ...prev, reject: null }))
      router.refresh()
    } catch {
      toast({ variant: 'destructive', title: '差戻しに失敗しました' })
    } finally {
      setRejectSubmitting(false)
    }
  }

  return (
    <div className="space-y-6">
      <ChecklistSection
        caseId={caseId}
        title="会社・事業所の書類"
        icon={<Building2 className="h-4 w-4 text-muted-foreground" />}
        items={requirements.office}
        emptyLabel="会社の必要書類はまだありません。"
        canReview={canReview}
        actions={actions}
        setActions={setActions}
      />

      <div className="space-y-4">
        <h4 className="text-sm font-semibold text-foreground">人材ごとの書類</h4>
        {requirements.persons.length === 0 ? (
          <p className="rounded-xl border border-dashed border-border px-4 py-6 text-center text-sm text-muted-foreground">
            まだ人材が追加されていません。「人材を追加」から人材を選ぶと、その人の必要書類が表示されます。
          </p>
        ) : (
          requirements.persons.map((group) => (
            <ChecklistSection
              key={group.personId}
              caseId={caseId}
              title={group.personName ?? '（氏名未取得）'}
              icon={<User className="h-4 w-4 text-muted-foreground" />}
              items={group.items}
              emptyLabel="この人材の必要書類はまだ生成されていません。"
              canReview={canReview}
              actions={actions}
              setActions={setActions}
            />
          ))
        )}
      </div>

      <RejectReasonDialog
        open={actions.reject !== null}
        onOpenChange={(open) =>
          setActions((prev) => ({ ...prev, reject: open ? prev.reject : null }))
        }
        documentName={actions.reject?.name}
        submitting={rejectSubmitting}
        onSubmit={submitReject}
      />
    </div>
  )
}
