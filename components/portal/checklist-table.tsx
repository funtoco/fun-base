'use client'

import { useRef, useState } from 'react'
import { useRouter } from 'next/navigation'
import { Building2, Eye, Loader2, Upload } from 'lucide-react'
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
}

function RequirementRow({
  caseId,
  item,
  actions,
  setActions,
}: {
  caseId: string
  item: CaseDocumentRequirement
  actions: RowActionsState
  setActions: React.Dispatch<React.SetStateAction<RowActionsState>>
}) {
  const router = useRouter()
  const { toast } = useToast()
  const fileInputRef = useRef<HTMLInputElement>(null)

  const busy = actions.busyId === item.id
  const doc = requirementDoc(item)
  // 未提出/要修正はもちろん、確認中(提出済み・未承認)も差し替え可能にする。承認済みのみロック。
  const canUpload = item.status !== 'approved'
  // 申請書類作成フォームは提出時に内容登録・連携が走る（時間がかかる）ので進捗表示を出し分ける。
  const isWorkbook = item.documentCode === 'application_workbook'

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
      // 申請書類作成フォームは提出時に内容を登録・連携する。その結果をメッセージに反映（社内名は出さない）。
      const auto = (
        result as {
          autoTranscribe?: {
            triggered?: boolean
            summary?: { dryRun: boolean; app55Ok: number; app55Error: number; app55Total: number }
          }
        }
      ).autoTranscribe
      const s = auto?.summary
      if (s && !s.dryRun && s.app55Error > 0) {
        toast({
          variant: 'destructive',
          title: '提出しました（一部の登録・連携に失敗）',
          description: `内容を登録・連携しました（成功 ${s.app55Ok}件・エラー ${s.app55Error}件／計 ${s.app55Total}件）。`,
        })
      } else if (s && !s.dryRun) {
        toast({
          title: '提出・登録が完了しました',
          description:
            s.app55Total > 0
              ? `内容を確認して登録・連携しました（${s.app55Total}件）。`
              : '内容を確認して登録・連携しました。',
        })
      } else {
        toast({ title: '提出しました', description: `「${item.name}」を提出しました（確認中）。` })
      }
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
            // 申請書類作成フォーム(application_workbook)はExcel(.xlsx)、それ以外は画像/PDF。
            accept={
              item.documentCode === 'application_workbook'
                ? '.xlsx,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'
                : 'image/png,image/jpeg,image/webp,image/heic,image/heif,application/pdf'
            }
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
              {busy ? (
                <>
                  <Loader2 className="h-3.5 w-3.5 animate-spin" />
                  {isWorkbook ? '内容を確認して登録・連携中…' : 'アップロード中…'}
                </>
              ) : (
                <>
                  <Upload className="h-3.5 w-3.5" />
                  {item.status === 'needs_fix'
                    ? '再提出'
                    : item.status === 'reviewing'
                      ? '差し替え'
                      : 'アップロード'}
                </>
              )}
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
  actions,
  setActions,
}: {
  caseId: string
  title: string
  icon: React.ReactNode
  items: CaseDocumentRequirement[]
  emptyLabel: string
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
}: {
  caseId: string
  requirements: GroupedRequirements
}) {
  const [actions, setActions] = useState<RowActionsState>({ busyId: null })

  return (
    <div className="space-y-6">
      <ChecklistSection
        caseId={caseId}
        title="会社・事業所の書類"
        icon={<Building2 className="h-4 w-4 text-muted-foreground" />}
        items={requirements.office}
        emptyLabel="会社の必要書類はまだありません。"
        actions={actions}
        setActions={setActions}
      />
    </div>
  )
}
