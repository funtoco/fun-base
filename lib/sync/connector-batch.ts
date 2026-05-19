export interface ConnectorBatchParams {
  limit: number
  offset: number
  connectorId: string | null
}

export interface ConnectorBatchMetadata {
  batchLimit: number
  batchOffset: number
  connectorCount: number
  hasMore: boolean
  nextOffset: number | null
}

const DEFAULT_CONNECTOR_BATCH_LIMIT = 10
const MAX_CONNECTOR_BATCH_LIMIT = 50

function parseOptionalInteger(value: string | null, defaultValue: number, name: string): number {
  if (value === null || value.trim() === '') return defaultValue
  if (!/^-?\d+$/.test(value)) {
    throw new Error(`${name} must be an integer`)
  }

  const parsed = Number(value)
  if (!Number.isSafeInteger(parsed)) {
    throw new Error(`${name} must be a safe integer`)
  }

  return parsed
}

export function parseConnectorBatchParams(searchParams: URLSearchParams): ConnectorBatchParams {
  const limit = parseOptionalInteger(searchParams.get('limit'), DEFAULT_CONNECTOR_BATCH_LIMIT, 'limit')
  const offset = parseOptionalInteger(searchParams.get('offset'), 0, 'offset')
  const connectorId = searchParams.get('connectorId')?.trim() || null

  if (limit < 1 || limit > MAX_CONNECTOR_BATCH_LIMIT) {
    throw new Error(`limit must be between 1 and ${MAX_CONNECTOR_BATCH_LIMIT}`)
  }
  if (offset < 0) {
    throw new Error('offset must be 0 or greater')
  }

  return {
    limit,
    offset,
    connectorId,
  }
}

export function parseOptionalConnectorBatchParams(searchParams: URLSearchParams): ConnectorBatchParams | null {
  const connectorId = searchParams.get('connectorId')?.trim() || null
  const hasBatchControls =
    searchParams.has('limit') ||
    searchParams.has('offset') ||
    connectorId !== null ||
    searchParams.get('allBatches') === 'true'

  if (!hasBatchControls) {
    return null
  }

  return parseConnectorBatchParams(searchParams)
}

export function buildConnectorBatchMetadata({
  fetchedCount,
  limit,
  offset,
}: {
  fetchedCount: number
  limit: number
  offset: number
}): ConnectorBatchMetadata {
  const hasMore = fetchedCount > limit
  const connectorCount = Math.min(fetchedCount, limit)

  return {
    batchLimit: limit,
    batchOffset: offset,
    connectorCount,
    hasMore,
    nextOffset: hasMore ? offset + limit : null,
  }
}
