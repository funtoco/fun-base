import { getServiceClient } from '../storage'
import type { KintoneCommentMention } from './kintone-write-client'

// Phase6: kintone コメントのメンション宛先＝app296 プロセス管理の「作業者」。
// 作業者は Webhook(ADD_RECORD / UPDATE_RECORD / UPDATE_STATUS)の record に載ってくるので、
// 受信のたびに案件行へキャッシュし、コメント投稿時は追加の kintone 読み取り無しで宛先に使う。
// kintone の宛先は「表示名」ではなく「ログイン名(code)」で解決される点に注意。

type ServiceClient = ReturnType<typeof getServiceClient>

/** app296 の作業者フィールド（STATUS_ASSIGNEE）のフィールドコード。 */
export const KINTONE_ASSIGNEE_FIELD = '作業者'

/** kintone のコメント宛先の上限（1コメントあたり10件）。超えると API がエラーになる。 */
export const KINTONE_MENTION_LIMIT = 10

/**
 * Webhook payload(record) から作業者のログイン名を取り出す。
 * STATUS_ASSIGNEE の value は `[{ code, name }]`。
 * @returns 作業者コードの配列。空配列は「作業者が未設定」＝キャッシュを空にする。
 *   フィールド自体が payload に無い場合は null を返し、呼び出し側はキャッシュに触らない
 *   （作業者を載せない payload でキャッシュを消してしまうと、宛先が黙って消える）。
 */
export function extractKintoneAssigneeCodes(
  record: Record<string, { value: unknown } | undefined>
): string[] | null {
  const raw = record[KINTONE_ASSIGNEE_FIELD]?.value
  if (!Array.isArray(raw)) {
    return null
  }
  const codes: string[] = []
  for (const entry of raw) {
    const code = (entry as { code?: unknown } | null)?.code
    if (typeof code !== 'string' || code === '' || codes.includes(code)) {
      continue
    }
    codes.push(code)
    if (codes.length >= KINTONE_MENTION_LIMIT) {
      break
    }
  }
  return codes
}

/** 作業者コード → コメント宛先（`comment.mentions[]`）。 */
export function buildAssigneeMentions(codes: string[]): KintoneCommentMention[] {
  return codes
    .slice(0, KINTONE_MENTION_LIMIT)
    .map((code) => ({ code, type: 'USER' as const }))
}

/**
 * 作業者キャッシュを案件行へ書き込む（service-role）。
 * 未ミラー案件（該当行なし）は 0 件更新の no-op。失敗しても Webhook 全体は落とさない。
 */
export async function applyKintoneAssigneesToCase(
  service: ServiceClient,
  kintoneRecordId: string,
  codes: string[]
): Promise<{ updated: boolean }> {
  const { data, error } = await service
    .from('visa_application_cases')
    .update({ kintone_assignee_codes: codes })
    .eq('kintone_record_id', kintoneRecordId)
    .select('id')
  if (error) {
    console.error('Error caching kintone assignees:', error)
    return { updated: false }
  }
  return { updated: Array.isArray(data) && data.length > 0 }
}
