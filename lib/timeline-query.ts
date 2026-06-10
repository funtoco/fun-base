import {
  buildInterviewListQueryString,
  getQueryMultiValues,
  getQuerySingleValue,
  toggleQueryMultiValue,
} from "@/lib/interview-list-query"

export interface TimelineFilterValues {
  search: string
  type: string
  persons: string[]
  date: string
}

export function readTimelineFilters(searchParams: URLSearchParams): TimelineFilterValues {
  return {
    search: searchParams.get("search")?.trim() ?? "",
    type: getQuerySingleValue(searchParams, "type"),
    persons: getQueryMultiValues(searchParams, "person"),
    date: getQuerySingleValue(searchParams, "date"),
  }
}

export function buildTimelineQueryString(filters: TimelineFilterValues): string {
  return buildInterviewListQueryString({
    search: filters.search,
    multi: {
      person: filters.persons,
    },
    single: {
      type: filters.type,
      date: filters.date,
    },
  })
}

export function toggleTimelinePerson(currentValues: string[], personId: string): string[] {
  return toggleQueryMultiValue(currentValues, personId)
}
