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
