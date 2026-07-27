export const ENTITY_TYPES = ['corporate', 'sole_proprietor'] as const
export const APPLICATION_CATEGORIES = ['initial', 'renewal'] as const
export const FIELDS = [
  'care',
  'food_service',
  'accommodation',
  'food_manufacturing',
  'other',
] as const

export type EntityType = (typeof ENTITY_TYPES)[number]
export type ApplicationCategory = (typeof APPLICATION_CATEGORIES)[number]
export type Field = (typeof FIELDS)[number]

export interface NewCaseInput {
  tenant_office_id?: string | null
  entity_type?: string | null
  application_category?: string | null
  field?: string | null
  // 任意項目（バリデーション対象外だが受け取れるようにしておく）
  management_number?: string | null
  title?: string | null
}

export interface ValidatedNewCase {
  tenant_office_id: string
  entity_type: EntityType
  application_category: ApplicationCategory
  field: Field
  management_number: string | null
  title: string | null
}

export type ValidateNewCaseResult =
  | { ok: true; value: ValidatedNewCase }
  | { ok: false; error: string }

function trimOrNull(value: unknown): string | null {
  if (typeof value !== 'string') {
    return null
  }
  const trimmed = value.trim()
  return trimmed.length > 0 ? trimmed : null
}

/**
 * 案件作成入力の純粋バリデーション。必須欠落・enum外を弾き、
 * 正常入力では正規化した値を返す。DBアクセスや副作用は持たない。
 */
export function validateNewCase(input: NewCaseInput | null | undefined): ValidateNewCaseResult {
  if (!input || typeof input !== 'object') {
    return { ok: false, error: 'input is required' }
  }

  const officeId = trimOrNull(input.tenant_office_id)
  if (!officeId) {
    return { ok: false, error: 'tenant_office_id is required' }
  }

  const entityType = trimOrNull(input.entity_type)
  if (!entityType) {
    return { ok: false, error: 'entity_type is required' }
  }
  if (!(ENTITY_TYPES as readonly string[]).includes(entityType)) {
    return { ok: false, error: 'invalid entity_type' }
  }

  const category = trimOrNull(input.application_category)
  if (!category) {
    return { ok: false, error: 'application_category is required' }
  }
  if (!(APPLICATION_CATEGORIES as readonly string[]).includes(category)) {
    return { ok: false, error: 'invalid application_category' }
  }

  const field = trimOrNull(input.field)
  if (!field) {
    return { ok: false, error: 'field is required' }
  }
  if (!(FIELDS as readonly string[]).includes(field)) {
    return { ok: false, error: 'invalid field' }
  }

  return {
    ok: true,
    value: {
      tenant_office_id: officeId,
      entity_type: entityType as EntityType,
      application_category: category as ApplicationCategory,
      field: field as Field,
      management_number: trimOrNull(input.management_number),
      title: trimOrNull(input.title),
    },
  }
}
