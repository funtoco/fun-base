import {
  APPLICATION_CATEGORY_LABELS,
  ENTITY_TYPE_LABELS,
  FIELD_LABELS,
  type ApplicationCategory,
  type EntityType,
  type Field,
  type VisaApplicationCase,
} from '@/lib/portal/types'
import { COUNCIL_GUIDES } from './council'
import { DOCUMENTS } from './documents'
import { FLOW_STEPS } from './flow'
import { DOCUMENT_SAMPLES } from './samples'
import type {
  CouncilGuide,
  DocumentSample,
  FlowLane,
  FlowStep,
  Guidance,
  GuidanceCondition,
  RequiredDocument,
} from './types'

export * from './types'
export { FLOW_LANE_LABELS } from './flow'
export { COUNCIL_INTRO } from './council'
export { DOCUMENTS_INTRO_INITIAL, DOCUMENTS_INTRO_RENEWAL } from './documents'

function matchesStep(
  step: FlowStep,
  entityType: EntityType,
  category: ApplicationCategory
): boolean {
  if (step.entityTypes && !step.entityTypes.includes(entityType)) return false
  if (step.categories && !step.categories.includes(category)) return false
  return true
}

function selectFlow(
  entityType: EntityType,
  category: ApplicationCategory
): Record<FlowLane, FlowStep[]> {
  const matched = FLOW_STEPS.filter((step) => matchesStep(step, entityType, category))
  const byLane = (lane: FlowLane) => matched.filter((step) => step.lane === lane)
  return {
    company: byLane('company'),
    funtoco: byLane('funtoco'),
    candidate: byLane('candidate'),
  }
}

function selectCouncils(field: Field | null): CouncilGuide[] {
  if (!field) return [...COUNCIL_GUIDES]
  const matched = COUNCIL_GUIDES.filter((guide) => guide.fields.includes(field))
  const rest = COUNCIL_GUIDES.filter((guide) => !guide.fields.includes(field))
  return [...matched, ...rest]
}

function selectDocuments(
  entityType: EntityType,
  category: ApplicationCategory,
  field: Field | null
): RequiredDocument[] {
  const list = DOCUMENTS[`${entityType}:${category}`]
  if (!field) return [...list]
  return list.filter((doc) => !doc.fields || doc.fields.includes(field))
}

function collectSamples(documents: RequiredDocument[]): DocumentSample[] {
  const seen = new Set<string>()
  const samples: DocumentSample[] = []
  for (const doc of documents) {
    for (const id of doc.sampleIds ?? []) {
      // 同一リスト内で複数の書類が同じ sampleId を参照すると React の key が重複するためガードする。
      // 現在のデータでは到達しないが、documents.ts の編集で起こり得るため残している。
      // 対になるデータ不変条件は __tests__ の「同一リスト内で同じ sampleId を2つの書類が参照しない」。
      if (seen.has(id)) continue
      const sample = DOCUMENT_SAMPLES[id]
      if (!sample) {
        throw new Error(`Unknown document sample id: ${id}`)
      }
      seen.add(id)
      samples.push(sample)
    }
  }
  return samples
}

export function selectGuidance(input: {
  entityType: EntityType
  category: ApplicationCategory
  field?: Field | null
}): Guidance {
  const field = input.field ?? null
  const documents = selectDocuments(input.entityType, input.category, field)
  return {
    entityType: input.entityType,
    category: input.category,
    field,
    flow: selectFlow(input.entityType, input.category),
    councils: selectCouncils(field),
    documents,
    samples: collectSamples(documents),
  }
}

/**
 * 案件一覧からご案内の初期表示条件を決める。
 * listCases() は created_at の降順なので、先頭 = 最新の案件を採用する。
 */
export function guidanceDefaultsFromCases(
  casesNewestFirst: VisaApplicationCase[]
): GuidanceCondition {
  const latest = casesNewestFirst[0]
  return {
    entityType: latest?.entityType ?? 'corporate',
    category: latest?.applicationCategory ?? 'initial',
    field: latest?.field ?? null,
  }
}

// ラベル定義（Record<K, string>）から導出するので、union に値を足せば自動で追随する。
const ENTITY_TYPES = Object.keys(ENTITY_TYPE_LABELS) as EntityType[]
const CATEGORIES = Object.keys(APPLICATION_CATEGORY_LABELS) as ApplicationCategory[]
const FIELDS = Object.keys(FIELD_LABELS) as Field[]

function pick<T extends string>(
  value: string | string[] | undefined,
  allowed: T[]
): T | null {
  if (typeof value !== 'string') return null
  return allowed.includes(value as T) ? (value as T) : null
}

/** クエリ > 呼び出し側の既定値 の順で表示条件を決める。不正なクエリは無視する。 */
export function resolveGuidanceCondition(
  searchParams: Record<string, string | string[] | undefined>,
  fallback: GuidanceCondition
): GuidanceCondition {
  return {
    entityType: pick(searchParams.entity, ENTITY_TYPES) ?? fallback.entityType,
    category: pick(searchParams.category, CATEGORIES) ?? fallback.category,
    field: pick(searchParams.field, FIELDS) ?? fallback.field,
  }
}

/** ご案内ページへのリンク。resolveGuidanceCondition と対になる URL 契約。 */
export function buildGuideHref(condition: GuidanceCondition): string {
  const params = new URLSearchParams({
    entity: condition.entityType,
    category: condition.category,
  })
  if (condition.field) {
    params.set('field', condition.field)
  }
  return `/applications/guide?${params.toString()}`
}
