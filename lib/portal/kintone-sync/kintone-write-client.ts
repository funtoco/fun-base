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

/**
 * kintone API がエラーを返したことを表す例外。HTTP ステータスで分岐したい呼び出し側
 * （revision 競合=409 のリトライなど）のために status を保持する。
 */
export class KintoneApiError extends Error {
  constructor(
    readonly status: number,
    message: string
  ) {
    super(`kintone API error: ${status} ${message}`)
    this.name = 'KintoneApiError'
  }
}

/** レコード添付ファイルフィールドの1要素（GET したときの形）。 */
export interface KintoneFileValue {
  fileKey: string
  name: string
  contentType: string
  /** kintone は文字列で返す。 */
  size: string
}

/** kintone レコードコメント1件（GET /k/v1/record/comments.json）。 */
export interface KintoneRecordComment {
  id: string
  text: string
  createdAt: string
  creator: { code: string; name: string }
}

/** コメント本文中のメンション指定。 */
export interface KintoneCommentMention {
  code: string
  type: 'USER' | 'GROUP' | 'ORGANIZATION'
}

/** upsert に必要な最小の書込インターフェース（テストではモックを注入する）。 */
export interface KintoneWriteClient {
  getRecords(appId: string, query: string): Promise<KintoneReadRecord[]>
  createRecord(
    appId: string,
    record: KintoneRecordPayload
  ): Promise<{ id: string; revision: string }>
  /**
   * レコードを更新する。opts.revision を渡すと楽観ロックになり、
   * 他者が先に更新していれば 409（KintoneApiError）になる。
   */
  updateRecord(
    appId: string,
    id: string,
    record: KintoneRecordPayload,
    opts?: { revision?: string }
  ): Promise<{ revision: string }>
  /** ファイルをアップロードして fileKey を得る（POST /k/v1/file.json）。 */
  uploadFile(params: {
    fileName: string
    contentType: string
    body: Buffer
  }): Promise<{ fileKey: string }>
  /** fileKey でファイル本体を取得する（GET /k/v1/file.json）。 */
  downloadFile(fileKey: string): Promise<{ body: Buffer; contentType: string }>
  /** プロセス管理のステータスを「アクション名」で進める（PUT /k/v1/record/status.json）。 */
  updateRecordStatus(
    appId: string,
    id: string,
    action: string,
    opts?: { assignee?: string; revision?: string }
  ): Promise<{ revision: string }>
  /** レコードコメントを取得する（GET /k/v1/record/comments.json）。 */
  getRecordComments(
    appId: string,
    recordId: string,
    opts?: { order?: 'asc' | 'desc'; offset?: number; limit?: number }
  ): Promise<KintoneRecordComment[]>
  /** レコードコメントを投稿する（POST /k/v1/record/comment.json）。 */
  postRecordComment(
    appId: string,
    recordId: string,
    text: string,
    mentions?: KintoneCommentMention[]
  ): Promise<{ id: string }>
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
      throw new KintoneApiError(response.status, text)
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
    record: KintoneRecordPayload,
    opts?: { revision?: string }
  ): Promise<{ revision: string }> {
    const body: Record<string, unknown> = { app: appId, id, record }
    if (opts?.revision) {
      body.revision = opts.revision
    }
    return this.request<{ revision: string }>('/k/v1/record.json', {
      method: 'PUT',
      body,
    })
  }

  async uploadFile(params: {
    fileName: string
    contentType: string
    body: Buffer
  }): Promise<{ fileKey: string }> {
    // multipart の組み立ては FormData に任せる。Content-Type を自前で付けると boundary が壊れる。
    const form = new FormData()
    form.append(
      'file',
      new Blob([new Uint8Array(params.body)], { type: params.contentType }),
      params.fileName
    )
    const response = await fetch(`${this.baseUrl}/k/v1/file.json`, {
      method: 'POST',
      headers: { ...this.authHeaders },
      body: form,
    })
    if (!response.ok) {
      throw new KintoneApiError(response.status, await response.text())
    }
    return (await response.json()) as { fileKey: string }
  }

  async downloadFile(
    fileKey: string
  ): Promise<{ body: Buffer; contentType: string }> {
    const params = new URLSearchParams({ fileKey })
    const response = await fetch(
      `${this.baseUrl}/k/v1/file.json?${params.toString()}`,
      { method: 'GET', headers: { ...this.authHeaders } }
    )
    if (!response.ok) {
      throw new KintoneApiError(response.status, await response.text())
    }
    return {
      body: Buffer.from(await response.arrayBuffer()),
      contentType:
        response.headers.get('content-type') ?? 'application/octet-stream',
    }
  }

  async updateRecordStatus(
    appId: string,
    id: string,
    action: string,
    opts?: { assignee?: string; revision?: string }
  ): Promise<{ revision: string }> {
    const body: Record<string, unknown> = { app: appId, id, action }
    if (opts?.assignee) {
      body.assignee = opts.assignee
    }
    if (opts?.revision) {
      body.revision = opts.revision
    }
    return this.request<{ revision: string }>('/k/v1/record/status.json', {
      method: 'PUT',
      body,
    })
  }

  async getRecordComments(
    appId: string,
    recordId: string,
    opts?: { order?: 'asc' | 'desc'; offset?: number; limit?: number }
  ): Promise<KintoneRecordComment[]> {
    const params = new URLSearchParams({
      app: appId,
      record: recordId,
      order: opts?.order ?? 'asc',
    })
    if (opts?.offset != null) {
      params.set('offset', String(opts.offset))
    }
    if (opts?.limit != null) {
      params.set('limit', String(opts.limit))
    }
    const response = await this.request<{ comments: KintoneRecordComment[] }>(
      `/k/v1/record/comments.json?${params.toString()}`,
      { method: 'GET' }
    )
    return response.comments
  }

  async postRecordComment(
    appId: string,
    recordId: string,
    text: string,
    mentions?: KintoneCommentMention[]
  ): Promise<{ id: string }> {
    const comment: { text: string; mentions?: KintoneCommentMention[] } = { text }
    if (mentions && mentions.length > 0) {
      comment.mentions = mentions
    }
    return this.request<{ id: string }>('/k/v1/record/comment.json', {
      method: 'POST',
      body: { app: appId, record: recordId, comment },
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
