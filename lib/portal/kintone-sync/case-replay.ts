import type { KintoneWebhookEvent } from './webhook'

type KintoneField = { value: unknown }
type KintoneRecord = Record<string, KintoneField>

type RecordsEnvelope = {
  records?: unknown
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

/**
 * kintone API/MCP で取得した app296 の1レコードを、既存ミラー処理へ渡すイベントに変換する。
 * 手動再実行は UPDATE_RECORD として扱い、同じ kintone_record_id へ冪等に upsert する。
 */
export function parseApp296ReplayInput(input: string): KintoneWebhookEvent {
  let parsed: unknown
  try {
    parsed = JSON.parse(input)
  } catch {
    throw new Error('APP296_RECORD_JSONが不正なJSONです')
  }

  let record: unknown = parsed
  if (isRecord(parsed) && 'records' in parsed) {
    const records = (parsed as RecordsEnvelope).records
    if (!Array.isArray(records) || records.length !== 1) {
      throw new Error('app296レコードを1件だけ指定してください')
    }
    record = records[0]
  }

  if (!isRecord(record)) {
    throw new Error('app296レコードを1件だけ指定してください')
  }

  const idField = record.$id
  if (!isRecord(idField) || idField.value == null || String(idField.value).trim() === '') {
    throw new Error('app296レコードの$id.valueがありません')
  }

  return {
    type: 'UPDATE_RECORD',
    appId: '296',
    recordId: String(idField.value),
    record: record as KintoneRecord,
    raw: record,
  }
}
