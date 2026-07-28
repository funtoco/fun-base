import Link from 'next/link'
import { notFound } from 'next/navigation'
import { ArrowLeft } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { CaseProgressHeader } from '@/components/portal/case-progress-header'
import { ChecklistTable } from '@/components/portal/checklist-table'
import { AddMembersDialog } from '@/components/portal/add-members-dialog'
import { CommentThread } from '@/components/portal/comment-thread'
import { RemindButton } from '@/components/portal/remind-button'
import {
  getCaseWithRequirements,
  getOfficePeopleForCase,
} from '@/lib/portal/applications'
import { listComments } from '@/lib/portal/comments'
import {
  APPLICATION_CATEGORY_LABELS,
  ENTITY_TYPE_LABELS,
  FIELD_LABELS,
} from '@/lib/portal/types'

export const dynamic = 'force-dynamic'

export default async function ApplicationDetailPage({
  params,
}: {
  params: { caseId: string }
}) {
  const data = await getCaseWithRequirements(params.caseId)
  if (!data) {
    notFound()
  }

  const { case: detail, requirements, isWriter } = data
  const memberPersonIds = detail.members.map((m) => m.personId)
  const availablePeople = await getOfficePeopleForCase(
    detail.tenantOfficeId,
    memberPersonIds
  )
  const comments = await listComments(detail.id)

  return (
    <div className="space-y-6 p-6">
      <div>
        <Button asChild variant="ghost" size="sm" className="mb-2 -ml-2 gap-1">
          <Link href="/applications">
            <ArrowLeft className="h-4 w-4" />
            申請ポータルに戻る
          </Link>
        </Button>
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div>
            <h1 className="text-2xl font-bold text-foreground">
              {detail.title || detail.officeName || '無題の案件'}
            </h1>
            <div className="mt-2 flex flex-wrap items-center gap-2">
              {detail.officeName && (
                <Badge variant="outline">{detail.officeName}</Badge>
              )}
              <Badge variant="secondary">{FIELD_LABELS[detail.field]}</Badge>
              <Badge variant="secondary">
                {ENTITY_TYPE_LABELS[detail.entityType]}
              </Badge>
              <Badge variant="secondary">
                {APPLICATION_CATEGORY_LABELS[detail.applicationCategory]}
              </Badge>
              {detail.managementNumber && (
                <span className="text-sm text-muted-foreground">
                  管理番号：{detail.managementNumber}
                </span>
              )}
            </div>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            {isWriter && <RemindButton caseId={detail.id} />}
            <AddMembersDialog caseId={detail.id} people={availablePeople} />
          </div>
        </div>

        <div className="mt-3 flex flex-wrap items-center gap-2">
          <span className="text-sm font-medium text-muted-foreground">
            対象人材：
          </span>
          {detail.members.length === 0 ? (
            <span className="text-sm text-muted-foreground">未設定</span>
          ) : (
            detail.members.map((member) => (
              <Badge key={member.id} variant="secondary">
                {member.personName ?? '（氏名未取得）'}
              </Badge>
            ))
          )}
        </div>
      </div>

      <CaseProgressHeader status={detail.status} />

      <ChecklistTable
        caseId={detail.id}
        requirements={requirements}
        canReview={isWriter}
      />

      <CommentThread caseId={detail.id} comments={comments} />
    </div>
  )
}
