import type { Announcement, DailySupportRecord, Person, RegularInterview, Visa } from "@/lib/models"

export type DashboardData = {
  people: Person[]
  visas: Visa[]
  regularInterviews: RegularInterview[]
  dailySupportRecords: DailySupportRecord[]
  announcements: Announcement[]
  readAnnouncementIds: string[]
}

export type DashboardSourceName = keyof DashboardData

export type DashboardDataLoaders = {
  [SourceName in DashboardSourceName]: () => Promise<DashboardData[SourceName]>
}

export type DashboardSourceFailure = {
  name: DashboardSourceName
  label: string
  reason: unknown
}

export type DashboardLoadResult =
  | {
      status: "success" | "partial"
      data: DashboardData
      failedSources: DashboardSourceFailure[]
    }
  | {
      status: "fatal"
      data: null
      failedSources: DashboardSourceFailure[]
    }

const EMPTY_DASHBOARD_DATA: DashboardData = {
  people: [],
  visas: [],
  regularInterviews: [],
  dailySupportRecords: [],
  announcements: [],
  readAnnouncementIds: [],
}

const DASHBOARD_SOURCES: Array<{ name: DashboardSourceName; label: string }> = [
  { name: "people", label: "人材情報" },
  { name: "visas", label: "ビザ情報" },
  { name: "regularInterviews", label: "最近の面談" },
  { name: "dailySupportRecords", label: "日々のサポート" },
  { name: "announcements", label: "お知らせ" },
  { name: "readAnnouncementIds", label: "お知らせの既読状況" },
]

function setDashboardSourceData<Name extends DashboardSourceName>(
  data: DashboardData,
  name: Name,
  value: DashboardData[Name],
) {
  data[name] = value
}

export async function loadDashboardDataSources(loaders: DashboardDataLoaders): Promise<DashboardLoadResult> {
  const settledResults = await Promise.allSettled(
    DASHBOARD_SOURCES.map(({ name }) => loaders[name]()),
  )
  const data = { ...EMPTY_DASHBOARD_DATA }
  const failedSources: DashboardSourceFailure[] = []

  settledResults.forEach((result, index) => {
    const source = DASHBOARD_SOURCES[index]

    if (result.status === "fulfilled") {
      setDashboardSourceData(data, source.name, result.value)
      return
    }

    failedSources.push({
      ...source,
      reason: result.reason,
    })
  })

  if (failedSources.length === 0) {
    return { status: "success", data, failedSources }
  }

  const coreSourceFailed = failedSources.some(
    (source) => source.name === "people" || source.name === "visas",
  )
  if (coreSourceFailed || failedSources.length === DASHBOARD_SOURCES.length) {
    return {
      status: "fatal",
      data: null,
      failedSources,
    }
  }

  return { status: "partial", data, failedSources }
}
