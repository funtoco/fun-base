export function buildPeopleSearchHref(query: string, currentPathname: string, currentSearch: string): string {
  const normalizedQuery = query.trim()
  const shouldPreservePeopleFilters = currentPathname === "/people"
  const params = new URLSearchParams(shouldPreservePeopleFilters ? currentSearch : "")

  if (normalizedQuery) {
    params.set("search", normalizedQuery)
  } else {
    params.delete("search")
  }

  const queryString = params.toString()
  return queryString ? `/people?${queryString}` : "/people"
}
