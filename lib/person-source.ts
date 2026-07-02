export const MANUAL_PERSON_ID_PREFIX = "manual_"

export function isManualPersonId(id: string | null | undefined): boolean {
  return Boolean(id?.startsWith(MANUAL_PERSON_ID_PREFIX))
}
