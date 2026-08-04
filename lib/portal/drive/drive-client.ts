import { importPKCS8, SignJWT } from 'jose'

// Google Drive 書込クライアント（サービスアカウント認証）。
// googleapis SDK は使わず、既存依存 jose で SA-JWT を RS256 署名 → OAuth2 でアクセストークンに交換 →
// Drive のマルチパートアップロードを fetch で叩く（kintone-write-client と同じ「注入可能I/F＋REST実装＋
// …FromEnv（未設定null）」パターン）。認証未設定なら null を返し、呼び出し側は Drive ミラーをスキップ。

const DRIVE_SCOPE = 'https://www.googleapis.com/auth/drive'
const TOKEN_ENDPOINT = 'https://oauth2.googleapis.com/token'
const UPLOAD_ENDPOINT =
  'https://www.googleapis.com/upload/drive/v3/files?uploadType=multipart&supportsAllDrives=true&fields=id,webViewLink'
const MULTIPART_BOUNDARY = '----funbaseDriveUploadBoundary'

/** 注入可能な最小 Drive 書込 I/F（テストはモックを注入する）。 */
export interface DriveClient {
  createFile(params: {
    folderId: string
    name: string
    mimeType: string
    body: Buffer
  }): Promise<{ id: string; webViewLink?: string }>
}

export interface DriveAuth {
  clientEmail: string
  privateKey: string
}

/**
 * env の GOOGLE_SERVICE_ACCOUNT_JSON（サービスアカウント鍵JSONまるごと）から認証情報を作る。
 * 未設定・壊れたJSON・必須欠落は null（＝Drive ミラー無効）。
 */
export function readDriveAuthFromEnv(
  env: Record<string, string | undefined> = process.env
): DriveAuth | null {
  const raw = env.GOOGLE_SERVICE_ACCOUNT_JSON?.trim()
  if (!raw) {
    return null
  }
  try {
    const parsed = JSON.parse(raw) as {
      client_email?: string
      private_key?: string
    }
    if (!parsed.client_email || !parsed.private_key) {
      return null
    }
    return {
      clientEmail: parsed.client_email,
      // 環境変数経由で \n がエスケープされている場合に備えて復元。
      privateKey: parsed.private_key.replace(/\\n/g, '\n'),
    }
  } catch {
    return null
  }
}

/** fetch ベースの Drive 実装。実通信するのは Drive ミラー実行時のみ。 */
export class RestDriveClient implements DriveClient {
  constructor(private readonly auth: DriveAuth) {}

  private async getAccessToken(): Promise<string> {
    const key = await importPKCS8(this.auth.privateKey, 'RS256')
    // 共有フォルダ方式（SA 自身が権限を持つ）。ドメイン全体委任は使わないため sub は付けない
    // （sub に SA 自身を入れると自己代理扱いで token エンドポイントが unauthorized_client を返す）。
    const assertion = await new SignJWT({ scope: DRIVE_SCOPE })
      .setProtectedHeader({ alg: 'RS256', typ: 'JWT' })
      .setIssuer(this.auth.clientEmail)
      .setAudience(TOKEN_ENDPOINT)
      .setIssuedAt()
      .setExpirationTime('1h')
      .sign(key)

    const params = new URLSearchParams({
      grant_type: 'urn:ietf:params:oauth:grant-type:jwt-bearer',
      assertion,
    })
    const res = await fetch(TOKEN_ENDPOINT, {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: params.toString(),
    })
    if (!res.ok) {
      throw new Error(`Drive token error: ${res.status} ${await res.text()}`)
    }
    const json = (await res.json()) as { access_token?: string }
    if (!json.access_token) {
      throw new Error('Drive token error: no access_token')
    }
    return json.access_token
  }

  async createFile(params: {
    folderId: string
    name: string
    mimeType: string
    body: Buffer
  }): Promise<{ id: string; webViewLink?: string }> {
    const token = await this.getAccessToken()
    const metadata = JSON.stringify({
      name: params.name,
      parents: [params.folderId],
    })
    const pre = Buffer.from(
      `--${MULTIPART_BOUNDARY}\r\n` +
        `Content-Type: application/json; charset=UTF-8\r\n\r\n` +
        `${metadata}\r\n` +
        `--${MULTIPART_BOUNDARY}\r\n` +
        `Content-Type: ${params.mimeType}\r\n\r\n`,
      'utf-8'
    )
    const post = Buffer.from(`\r\n--${MULTIPART_BOUNDARY}--`, 'utf-8')
    const multipartBody = Buffer.concat([pre, params.body, post])

    const res = await fetch(UPLOAD_ENDPOINT, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${token}`,
        'Content-Type': `multipart/related; boundary=${MULTIPART_BOUNDARY}`,
      },
      body: multipartBody,
    })
    if (!res.ok) {
      throw new Error(`Drive upload error: ${res.status} ${await res.text()}`)
    }
    return (await res.json()) as { id: string; webViewLink?: string }
  }
}

/** env から Drive クライアントを生成。認証未設定なら null（呼び出し側はミラーをスキップ）。 */
export function createDriveClientFromEnv(
  env: Record<string, string | undefined> = process.env
): DriveClient | null {
  const auth = readDriveAuthFromEnv(env)
  return auth ? new RestDriveClient(auth) : null
}
