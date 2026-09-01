import type { Visa } from "./models"

const VISA_ACTIVITY_DATE_FIELDS: Array<keyof Visa> = [
  "visaAcquiredDate",
  "resultAt",
  "additionalDocumentsDate",
  "applicationDate",
  "visaApplicationPreparationDate",
  "applicationPreparationDate",
  "documentConfirmationDate",
  "documentCreationDate",
  "documentPreparationDate",
  "submittedAt",
  "receptionDate",
  "updatedAt",
]

const VISA_APPLICATION_DATE_FIELDS = VISA_ACTIVITY_DATE_FIELDS.filter((field) => field !== "updatedAt")

function getLatestValidDateTime(visa: Visa, fields: Array<keyof Visa>): number | undefined {
  const times = fields
    .map((field) => visa[field])
    .filter((value): value is string => typeof value === "string" && value.trim().length > 0)
    .map((value) => new Date(value).getTime())
    .filter(Number.isFinite)

  return times.length > 0 ? Math.max(...times) : undefined
}

export function getLatestVisaActivityDate(visa: Visa): string | undefined {
  const candidates = VISA_ACTIVITY_DATE_FIELDS
    .map((field) => visa[field])
    .filter((value): value is string => typeof value === "string" && value.trim().length > 0)
    .map((value) => ({
      value,
      time: new Date(value).getTime(),
    }))
    .filter((candidate) => Number.isFinite(candidate.time))

  candidates.sort((a, b) => b.time - a.time)

  return candidates[0]?.value
}

export function selectPrimaryVisa(visas: Visa[]): Visa | undefined {
  return visas
    .map((visa, index) => ({
      visa,
      index,
      isActive: visa.status !== "ビザ取得済み",
      activityTime:
        getLatestValidDateTime(visa, VISA_APPLICATION_DATE_FIELDS) ??
        getLatestValidDateTime(visa, ["updatedAt"]) ??
        Number.NEGATIVE_INFINITY,
    }))
    .sort((a, b) => {
      if (a.isActive !== b.isActive) {
        return a.isActive ? -1 : 1
      }
      return b.activityTime - a.activityTime || a.index - b.index
    })[0]?.visa
}
