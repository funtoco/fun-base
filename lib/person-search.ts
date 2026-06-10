import type { Person } from "@/lib/models"

export const PERSON_SEARCH_KEYS = [
  "name",
  "kana",
  "tenantName",
  "company",
  "nationality",
  "employeeNumber",
] satisfies (keyof Person)[]

export function normalizePersonSearchText(value?: string | null) {
  return value?.toLowerCase().trim() ?? ""
}

export function matchesPersonSearch(person: Person, searchTerm: string) {
  const searchText = normalizePersonSearchText(searchTerm)
  if (!searchText) return true

  return PERSON_SEARCH_KEYS.some((key) => {
    return normalizePersonSearchText(person[key]?.toString()).includes(searchText)
  })
}
