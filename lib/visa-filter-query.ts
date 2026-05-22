import {
  buildInterviewListQueryString,
  getQueryMultiValues,
} from "@/lib/interview-list-query"

export interface VisaFilterValues {
  search: string
  types: string[]
  expiries: string[]
  companies: string[]
  affiliations: string[]
}

export function parseVisaFilterQuery(searchParams: URLSearchParams): VisaFilterValues {
  return {
    search: searchParams.get("search")?.trim() ?? "",
    types: getQueryMultiValues(searchParams, "type"),
    expiries: getQueryMultiValues(searchParams, "expiry"),
    companies: getQueryMultiValues(searchParams, "company"),
    affiliations: getQueryMultiValues(searchParams, "affiliation"),
  }
}

export function buildVisaFilterQuery(filters: VisaFilterValues): string {
  return buildInterviewListQueryString({
    search: filters.search,
    multi: {
      type: filters.types,
      expiry: filters.expiries,
      company: filters.companies,
      affiliation: filters.affiliations,
    },
  })
}
