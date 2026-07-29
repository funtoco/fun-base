import type { KintoneRecordPayload } from './types'

// 軽量な kintone REST クライアント（env 認証・書込用）。
// 既存の lib/kintone/api-client.ts は OAuth 前提のため、本機能では env（APIトークン or
// パスワード認証）で動く独立クライアントに分離する。
//
// 認証は env から読む:
//   - KINTONE_BASE_URL                （例: https://funtoco.cybozu.com）
//   - KINTONE_API_TOKEN_APP34         （app34 用 API トークン）… 優先
//   - KINTONE_USERNAME / KINTONE_PASSWORD （パスワード認証）… フォールバック
// いずれも未設定なら null を返し、呼び出し側は dryRun のみ許可する。

/** kintone から返る1レコード（`$id` と各フィールド）。 */
export interface KintoneReadRecord {
  $id: { value: string }
  [fieldCode: string]: { value: unknown }
}

/** upsert に必要な最小の書込インターフェース（テストではモックを注入する）。 */
export interface KintoneWriteClient {
  getRecords(appId: string, query: string): Promise<KintoneReadRecord[]>
  createRecord(
    appId: string,
    record: KintoneRecordPayload
  ): Promise<{ id: string; revision: string }>
  updateRecord(
    appId: string,
    id: string,
    record: KintoneRecordPayload
  ): Promise<{ revision: string }>
}

export interface KintoneWriteAuth {
  baseUrl: string
  apiToken?: string
  username?: string
  password?: string
}

/**
 * env から認証情報を組み立てる。BASE_URL が無い、または認証手段（トークン or ユーザー/パス）が
 * 揃わない場合は null（＝実書き込み不可＝dryRun のみ）。
 */
export function readKintoneWriteAuthFromEnv(
  env: NodeJS.ProcessEnv = process.env
): KintoneWriteAuth | null {
  const baseUrl = env.KINTONE_BASE_URL?.trim()
  if (!baseUrl) {
    return null
  }
  const apiToken = env.KINTONE_API_TOKEN_APP34?.trim()
  if (apiToken) {
    return { baseUrl, apiToken }
  }
  const username = env.KINTONE_USERNAME?.trim()
  const password = env.KINTONE_PASSWORD
  if (username && password) {
    return { baseUrl, username, password }
  }
  return null
}

function base64(input: string): string {
  return Buffer.from(input, 'utf-8').toString('base64')
}

/** fetch ベースの REST 実装。実通信するのは実書き込み（dryRun=false）のときだけ。 */
export class RestKintoneWriteClient implements KintoneWriteClient {
  private readonly baseUrl: string
  private readonly authHeaders: Record<string, string>

  constructor(auth: KintoneWriteAuth) {
    this.baseUrl = auth.baseUrl.replace(/\/+$/, '')
    if (auth.apiToken) {
      this.authHeaders = { 'X-Cybozu-API-Token': auth.apiToken }
    } else if (auth.username && auth.password) {
      this.authHeaders = {
        'X-Cybozu-Authorization': base64(`${auth.username}:${auth.password}`),
      }
    } else {
      throw new Error('kintone 認証情報が不足しています')
    }
  }

  private async request<T>(
    path: string,
    options: { method: string; body?: unknown }
  ): Promise<T> {
    const headers: Record<string, string> = { ...this.authHeaders }
    if (options.body !== undefined) {
      headers['Content-Type'] = 'application/json'
    }
    const response = await fetch(`${this.baseUrl}${path}`, {
      method: options.method,
      headers,
      body: options.body !== undefined ? JSON.stringify(options.body) : undefined,
    })
    if (!response.ok) {
      const text = await response.text()
      throw new Error(`kintone API error: ${response.status} ${text}`)
    }
    return (await response.json()) as T
  }

  async getRecords(appId: string, query: string): Promise<KintoneReadRecord[]> {
    const params = new URLSearchParams({ app: appId })
    if (query) {
      params.set('query', query)
    }
    const response = await this.request<{ records: KintoneReadRecord[] }>(
      `/k/v1/records.json?${params.toString()}`,
      { method: 'GET' }
    )
    return response.records
  }

  async createRecord(
    appId: string,
    record: KintoneRecordPayload
  ): Promise<{ id: string; revision: string }> {
    return this.request<{ id: string; revision: string }>('/k/v1/record.json', {
      method: 'POST',
      body: { app: appId, record },
    })
  }

  async updateRecord(
    appId: string,
    id: string,
    record: KintoneRecordPayload
  ): Promise<{ revision: string }> {
    return this.request<{ revision: string }>('/k/v1/record.json', {
      method: 'PUT',
      body: { app: appId, id, record },
    })
  }
}

/**
 * env から書込クライアントを生成する。認証未設定なら null（呼び出し側は dryRun のみ許可）。
 */
export function createKintoneWriteClientFromEnv(
  env: NodeJS.ProcessEnv = process.env
): KintoneWriteClient | null {
  const auth = readKintoneWriteAuthFromEnv(env)
  if (!auth) {
    return null
  }
  return new RestKintoneWriteClient(auth)
}
