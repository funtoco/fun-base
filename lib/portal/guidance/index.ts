import type { ApplicationCategory, EntityType, Field } from '@/lib/portal/types'
import { FLOW_STEPS } from './flow'
import type { FlowLane, FlowStep, Guidance } from './types'

export * from './types'
export { FLOW_LANE_LABELS } from './flow'

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
    councils: [],
    documents: [],
    samples: [],
  }
}
