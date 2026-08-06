import type { ApplicationCategory, EntityType, Field } from '@/lib/portal/types'
import { COUNCIL_GUIDES } from './council'
import { DOCUMENTS } from './documents'
import { FLOW_STEPS } from './flow'
import type { CouncilGuide, FlowLane, FlowStep, Guidance, RequiredDocument } from './types'

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

export function selectGuidance(input: {
  entityType: EntityType
  category: ApplicationCategory
  field?: Field | null
}): Guidance {
  const field = input.field ?? null
  return {
    entityType: input.entityType,
    category: input.category,
    field,
    flow: selectFlow(input.entityType, input.category),
    councils: selectCouncils(field),
    documents: selectDocuments(input.entityType, input.category, field),
    samples: [],
  }
}
