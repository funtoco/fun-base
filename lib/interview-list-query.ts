const DEFAULT_SINGLE_VALUE = "all"
const SEARCH_QUERY_KEY = "search"

function normalizeQueryValue(value: string): string {
  return value.trim()
}

export function getQueryMultiValues(searchParams: URLSearchParams, key: string): string[] {
  const rawValue = searchParams.get(key)
  if (!rawValue) return []

  return rawValue
    .split(",")
    .map(normalizeQueryValue)
    .filter(Boolean)
}

export function getQuerySingleValue(
  searchParams: URLSearchParams,
  key: string,
  defaultValue = DEFAULT_SINGLE_VALUE
): string {
  return normalizeQueryValue(searchParams.get(key) ?? "") || defaultValue
}

export function toggleQueryMultiValue(currentValues: string[], value: string): string[] {
  return currentValues.includes(value)
    ? currentValues.filter((currentValue) => currentValue !== value)
    : [...currentValues, value]
}

export function buildInterviewListQueryString({
  search,
  multi = {},
  single = {},
}: {
  search?: string
  multi?: Record<string, string[]>
  single?: Record<string, string>
}): string {
  const params = new URLSearchParams()
  const normalizedSearch = normalizeQueryValue(search ?? "")

  if (normalizedSearch) {
    params.set(SEARCH_QUERY_KEY, normalizedSearch)
  }

  Object.entries(multi).forEach(([key, values]) => {
    const normalizedValues = values.map(normalizeQueryValue).filter(Boolean)
    if (normalizedValues.length > 0) {
      params.set(key, normalizedValues.join(","))
    }
  })

  Object.entries(single).forEach(([key, value]) => {
    const normalizedValue = normalizeQueryValue(value)
    if (normalizedValue && normalizedValue !== DEFAULT_SINGLE_VALUE) {
      params.set(key, normalizedValue)
    }
  })

  return params.toString()
}
