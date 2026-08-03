import crypto from 'node:crypto'

// kintone「就労_ビザ案件管理」(app296) の Webhook 受信・検証・正規化（純粋ロジック）。
// kintone Webhook は HMAC 署名や独自ヘッダを送れないため、共有シークレットは URL クエリ
// (?secret=...) で受けてタイミングセーフに比較する（cron の Bearer 検証に倣う）。

export type KintoneWebhookType =
  | 'ADD_RECORD'
  | 'UPDATE_RECORD'
  | 'UPDATE_STATUS'
  | 'ADD_RECORD_COMMENT'
  | 'DELETE_RECORD'

const VALID_TYPES: KintoneWebhookType[] = [
  'ADD_RECORD',
  'UPDATE_RECORD',
  'UPDATE_STATUS',
  'ADD_RECORD_COMMENT',
  'DELETE_RECORD',
]

/** 正規化済みの Webhook イベント。 */
export interface KintoneWebhookEvent {
  type: KintoneWebhookType
  appId: string
  recordId: string
  /** レコード全体（フィールドコード → { value }）。DELETE では空のことがある。 */
  record: Record<string, { value: unknown }>
  /** 生 payload（コメント等の付随情報を後段で使うため保持）。 */
  raw: unknown
}

/**
 * 共有シークレットをタイミングセーフに検証する。
 * expected 未設定（env 無し）や provided 欠落・不一致は false。
 */
export function verifyWebhookSecret(
  provided: string | null | undefined,
  expected: string | undefined = process.env.KINTONE_WEBHOOK_SECRET
): boolean {
  if (!expected || !provided) {
    return false
  }
  const a = Buffer.from(provided, 'utf-8')
  const b = Buffer.from(expected, 'utf-8')
  if (a.length !== b.length) {
    return false
  }
  return crypto.timingSafeEqual(a, b)
}

/**
 * kintone Webhook payload を検証し正規化する。
 * app.id が expectedAppId（既定 '296'）でない、type 不正、recordId 欠落は null。
 */
export function parseVisaCaseWebhook(
  payload: unknown,
  expectedAppId = '296'
): KintoneWebhookEvent | null {
  if (!payload || typeof payload !== 'object') {
    return null
  }
  const p = payload as {
    type?: unknown
    app?: { id?: unknown }
    record?: { $id?: { value?: unknown } } & Record<string, unknown>
    recordId?: unknown
  }
  const type = p.type as KintoneWebhookType
  if (!VALID_TYPES.includes(type)) {
    return null
  }
  const appId = p.app?.id != null ? String(p.app.id) : null
  if (!appId || appId !== expectedAppId) {
    return null
  }
  const recordId =
    p.recordId != null
      ? String(p.recordId)
      : p.record?.$id?.value != null
        ? String(p.record.$id.value)
        : null
  if (!recordId) {
    return null
  }
  return {
    type,
    appId,
    recordId,
    record: (p.record ?? {}) as Record<string, { value: unknown }>,
    raw: payload,
  }
}
