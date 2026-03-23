interface NormalizeBatchParamsInput {
  cursorParam: string | null
  batchSizeParam: string | null
  defaultBatchSize: number
  maxBatchSize: number
}

interface BatchMetaInput {
  cursor: number
  batchSize: number
  totalCount: number
}

export function normalizeBatchParams({
  cursorParam,
  batchSizeParam,
  defaultBatchSize,
  maxBatchSize,
}: NormalizeBatchParamsInput) {
  const parsedCursor = Number.parseInt(cursorParam || "0", 10)
  const parsedBatchSize = Number.parseInt(batchSizeParam || `${defaultBatchSize}`, 10)

  const cursor = Number.isFinite(parsedCursor) && parsedCursor > 0 ? parsedCursor : 0

  let batchSize = Number.isFinite(parsedBatchSize) ? parsedBatchSize : defaultBatchSize
  if (batchSize <= 0) {
    batchSize = defaultBatchSize
  }
  if (batchSize > maxBatchSize) {
    batchSize = maxBatchSize
  }

  return {
    cursor,
    batchSize,
  }
}

export function getBatchMeta({
  cursor,
  batchSize,
  totalCount,
}: BatchMetaInput) {
  const processedRangeEnd = Math.min(cursor + batchSize, totalCount)
  const hasMore = processedRangeEnd < totalCount

  return {
    hasMore,
    nextCursor: hasMore ? processedRangeEnd : null,
    processedRangeEnd,
    remainingCount: Math.max(totalCount - processedRangeEnd, 0),
  }
}
