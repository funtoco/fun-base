'use client'

import { useRef, useState } from 'react'
import { useRouter } from 'next/navigation'
import { FileText, Loader2, Paperclip, Upload } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { useToast } from '@/lib/hooks/use-toast'
import type {
  CaseFilesBlockedReason,
  CaseFileUploadResult,
} from '@/lib/portal/case-files'
import type { CaseFile } from '@/lib/portal/kintone-sync/case-files'

// 案件のチェックリストに載らない任意ファイル（その他ファイル）の一覧＋複数アップロード。
// 実体は kintone 案件レコードの添付ファイルなので、表示・取得は API ルート経由で行う。

const BLOCKED_MESSAGES: Record<CaseFilesBlockedReason, string> = {
  no_kintone_link:
    'この案件はまだ連携準備中のため、その他ファイルをアップロードできません。担当者にお問い合わせください。',
  no_kintone_auth:
    'ファイル連携が設定されていないため、その他ファイルをアップロードできません。管理者にお問い合わせください。',
  error:
    'その他ファイルを取得できませんでした。時間をおいてページを再読み込みしてください。',
}

/** 画像・PDF・Excel（サーバ側の許可形式と揃える）。 */
const ACCEPT =
  'image/png,image/jpeg,image/webp,image/heic,image/heif,application/pdf,' +
  '.xlsx,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet,' +
  '.xls,application/vnd.ms-excel'

function formatSize(bytes: number): string {
  if (!bytes) {
    return '-'
  }
  if (bytes < 1024) {
    return `${bytes} B`
  }
  if (bytes < 1024 * 1024) {
    return `${Math.round(bytes / 1024)} KB`
  }
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`
}

export function OtherFilesCard({
  caseId,
  files,
  canUpload,
  blockedReason,
}: {
  caseId: string
  files: CaseFile[]
  canUpload: boolean
  blockedReason?: CaseFilesBlockedReason
}) {
  const router = useRouter()
  const { toast } = useToast()
  const fileInputRef = useRef<HTMLInputElement>(null)
  const [progress, setProgress] = useState<{ done: number; total: number } | null>(
    null
  )

  const uploading = progress !== null

  /**
   * 選択された全ファイルを**1件ずつ**送る。まとめて送るとリクエストが巨大になるため、
   * 既存の書類アップロードと同じサイズ感を保ちつつ、途中で失敗しても成功分は残す。
   */
  async function handleUpload(selected: File[]) {
    setProgress({ done: 0, total: selected.length })
    const failures: CaseFileUploadResult[] = []

    try {
      for (const [index, file] of selected.entries()) {
        try {
          const form = new FormData()
          form.append('files', file)
          const res = await fetch(`/api/applications/${caseId}/files`, {
            method: 'POST',
            body: form,
          })
          const result = (await res.json().catch(() => ({}))) as {
            error?: string
            results?: CaseFileUploadResult[]
          }
          if (!res.ok) {
            failures.push({
              name: file.name,
              ok: false,
              error: result.error || 'アップロードに失敗しました',
            })
          } else {
            failures.push(...(result.results ?? []).filter((r) => !r.ok))
          }
        } catch {
          failures.push({
            name: file.name,
            ok: false,
            error: 'ネットワークエラーが発生しました',
          })
        }
        setProgress({ done: index + 1, total: selected.length })
      }

      const okCount = selected.length - failures.length
      if (failures.length === 0) {
        toast({
          title: 'アップロードしました',
          description: `${okCount}件のファイルを追加しました。`,
        })
      } else {
        toast({
          variant: 'destructive',
          title:
            okCount > 0
              ? `${okCount}件を追加しました（${failures.length}件は失敗）`
              : 'アップロードに失敗しました',
          description: failures
            .map((f) => `${f.name}：${f.error ?? '不明なエラー'}`)
            .join('\n'),
        })
      }
      router.refresh()
    } finally {
      setProgress(null)
    }
  }

  return (
    <div className="rounded-xl border border-border bg-card shadow-sm">
      <div className="flex flex-wrap items-center gap-2 border-b border-border px-4 py-3">
        <Paperclip className="h-4 w-4 text-muted-foreground" />
        <h4 className="text-sm font-semibold text-foreground">その他ファイル</h4>
        <span className="text-xs text-muted-foreground">（{files.length}件）</span>
        <div className="ml-auto">
          <input
            ref={fileInputRef}
            type="file"
            multiple
            className="hidden"
            accept={ACCEPT}
            onChange={(e) => {
              const selected = Array.from(e.target.files ?? [])
              if (selected.length > 0) {
                void handleUpload(selected)
              }
              e.target.value = ''
            }}
          />
          <Button
            size="sm"
            variant="outline"
            disabled={!canUpload || uploading}
            onClick={() => fileInputRef.current?.click()}
            className="gap-1"
          >
            {uploading ? (
              <>
                <Loader2 className="h-3.5 w-3.5 animate-spin" />
                アップロード中… {progress.done}/{progress.total}件
              </>
            ) : (
              <>
                <Upload className="h-3.5 w-3.5" />
                ファイルを追加
              </>
            )}
          </Button>
        </div>
      </div>

      <div className="px-4 py-4">
        {!canUpload && blockedReason && (
          <p className="mb-3 rounded-lg border border-border bg-muted px-3 py-2 text-xs text-muted-foreground">
            {BLOCKED_MESSAGES[blockedReason]}
          </p>
        )}

        {files.length === 0 ? (
          <p className="text-center text-sm text-muted-foreground">
            チェックリストに無い書類は、ここに何件でも追加できます。
          </p>
        ) : (
          <ul className="space-y-2">
            {files.map((file) => (
              <li key={file.fileKey}>
                <a
                  href={`/api/applications/${caseId}/files/${encodeURIComponent(file.fileKey)}`}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="flex items-center gap-2 rounded-lg border border-border bg-background px-3 py-2 transition-colors hover:bg-muted"
                >
                  <FileText className="h-4 w-4 shrink-0 text-muted-foreground" />
                  <span className="min-w-0 flex-1 truncate text-sm text-foreground">
                    {file.name}
                  </span>
                  <span className="shrink-0 text-xs text-muted-foreground">
                    {formatSize(file.size)}
                  </span>
                </a>
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  )
}
