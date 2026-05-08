export interface RecordIdBatch {
  from: number
  to: number
}

export function buildRecordIdBatches(from: number, to: number, batchSize: number): RecordIdBatch[] {
  if (!Number.isInteger(from) || from < 1) {
    throw new Error('from must be greater than 0')
  }
  if (!Number.isInteger(to) || to < from) {
    throw new Error('to must be greater than or equal to from')
  }
  if (!Number.isInteger(batchSize) || batchSize < 1) {
    throw new Error('batchSize must be greater than 0')
  }

  const batches: RecordIdBatch[] = []
  for (let current = from; current <= to; current += batchSize) {
    batches.push({
      from: current,
      to: Math.min(current + batchSize - 1, to),
    })
  }

  return batches
}
