import type { ApplicationCategory, EntityType, Field } from '@/lib/portal/types'
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
