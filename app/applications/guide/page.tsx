import Link from 'next/link'
import { ArrowLeft } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { CouncilSection } from '@/components/portal/guidance/council-section'
import { DocumentTable } from '@/components/portal/guidance/document-table'
import { FlowLanes } from '@/components/portal/guidance/flow-lanes'
import { GuidanceSwitcher } from '@/components/portal/guidance/guidance-switcher'
import { listCases } from '@/lib/portal/applications'
import {
  guidanceDefaultsFromCases,
  selectGuidance,
  type GuidanceCondition,
} from '@/lib/portal/guidance'
import type { ApplicationCategory, EntityType, Field } from '@/lib/portal/types'

export const dynamic = 'force-dynamic'

const ENTITY_TYPES: EntityType[] = ['corporate', 'sole_proprietor']
const CATEGORIES: ApplicationCategory[] = ['initial', 'renewal']
const FIELDS: Field[] = [
  'care',
  'food_service',
  'accommodation',
  'food_manufacturing',
  'other',
]

function pick<T extends string>(
  value: string | string[] | undefined,
  allowed: T[]
): T | null {
  if (typeof value !== 'string') return null
  return allowed.includes(value as T) ? (value as T) : null
}

/** クエリ > 最新案件 > 既定値 の順で表示条件を決める。不正なクエリは無視する。 */
function resolveCondition(
  searchParams: Record<string, string | string[] | undefined>,
  fallback: GuidanceCondition
): GuidanceCondition {
  return {
    entityType: pick(searchParams.entity, ENTITY_TYPES) ?? fallback.entityType,
    category: pick(searchParams.category, CATEGORIES) ?? fallback.category,
    field: pick(searchParams.field, FIELDS) ?? fallback.field,
  }
}

export default async function ApplicationGuidePage({
  searchParams,
}: {
  searchParams: Record<string, string | string[] | undefined>
}) {
  const cases = await listCases()
  const condition = resolveCondition(searchParams, guidanceDefaultsFromCases(cases))
  const guidance = selectGuidance(condition)

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
        <div className="mt-4">
          <GuidanceSwitcher condition={condition} />
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
        <DocumentTable
          documents={guidance.documents}
          samples={guidance.samples}
          category={condition.category}
        />
      </section>
    </div>
  )
}
