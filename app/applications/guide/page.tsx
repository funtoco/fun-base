import Link from 'next/link'
import { ArrowLeft } from 'lucide-react'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { CouncilSection } from '@/components/portal/guidance/council-section'
import { DocumentTable } from '@/components/portal/guidance/document-table'
import { FlowLanes } from '@/components/portal/guidance/flow-lanes'
import { GuidanceSwitcher } from '@/components/portal/guidance/guidance-switcher'
import { listCases } from '@/lib/portal/applications'
import {
  guidanceDefaultsFromCases,
  resolveGuidanceCondition,
  selectGuidance,
} from '@/lib/portal/guidance'
import { FIELD_LABELS } from '@/lib/portal/types'

export const dynamic = 'force-dynamic'

export default async function ApplicationGuidePage({
  searchParams,
}: {
  searchParams: Record<string, string | string[] | undefined>
}) {
  const cases = await listCases()
  // クエリ > 最新案件 > 既定値 の順で表示条件が決まる。
  const condition = resolveGuidanceCondition(
    searchParams,
    guidanceDefaultsFromCases(cases)
  )
  const guidance = selectGuidance(condition)
  // 分野で実際に件数が絞られたときだけ、書類一覧の欠番の理由を添える。
  const unfilteredDocumentCount = selectGuidance({ ...condition, field: null }).documents
    .length
  const isDocumentListFiltered = guidance.documents.length < unfilteredDocumentCount

  return (
    <div className="space-y-8 p-6">
      <div>
        <Button asChild variant="ghost" size="sm" className="mb-2 -ml-2 gap-1">
          <Link href="/applications">
            <ArrowLeft className="h-4 w-4" />
            申請ポータルに戻る
          </Link>
        </Button>
        <h1 className="text-2xl font-bold text-foreground">
          在留資格申請手続きのご案内
        </h1>
        <p className="mt-2 text-muted-foreground">
          事業形態と受け入れ状況に合わせて、手続きの流れと必要な書類をご案内します。
        </p>
        <div className="mt-4 flex flex-wrap items-start gap-6">
          <GuidanceSwitcher condition={condition} />
          {/* 分野は案件由来なので、トグルではなく読み取り専用のチップで示す。 */}
          {condition.field && (
            <div>
              <span className="text-xs text-muted-foreground">分野</span>
              <div className="mt-1 flex h-10 items-center">
                <Badge variant="secondary">{FIELD_LABELS[condition.field]}</Badge>
              </div>
            </div>
          )}
        </div>
      </div>

      <section id="flow" className="scroll-mt-6 space-y-3">
        <h2 className="text-lg font-semibold text-foreground">1. 申請手続きの流れ</h2>
        <FlowLanes flow={guidance.flow} />
      </section>

      <section id="council" className="scroll-mt-6 space-y-3">
        <h2 className="text-lg font-semibold text-foreground">2. 協議会への加入登録</h2>
        <CouncilSection councils={guidance.councils} field={condition.field} />
      </section>

      <section id="documents" className="scroll-mt-6 space-y-3">
        <h2 className="text-lg font-semibold text-foreground">
          {condition.category === 'initial'
            ? `3. 取得書類一覧（全${guidance.documents.length}種類）`
            : `3. 準備書類一覧（全${guidance.documents.length}種類）`}
        </h2>
        {condition.field && isDocumentListFiltered && (
          <p className="text-xs text-muted-foreground">
            {FIELD_LABELS[condition.field]}
            分野に必要な書類のみを表示しています。番号は資料の原典に合わせているため、欠番が出ることがあります。
          </p>
        )}
        <DocumentTable
          documents={guidance.documents}
          samples={guidance.samples}
          category={condition.category}
        />
      </section>
    </div>
  )
}
