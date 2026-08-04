import { createAdminClient } from '@/lib/supabase/client'

// ポータル書類のストレージ規約とサービスロール操作をまとめる。
// アップロード/署名URL発行はすべてサーバAPI経由でこのモジュールを使い、
// クライアントには storage への書込権限を渡さない（server-mediated）。

export const OFFICE_BUCKET = 'office-documents'
export const PERSON_BUCKET = 'person-documents'

export const MAX_UPLOAD_BYTES = 10 * 1024 * 1024 // 10MB（person-documents バケットと同じ上限）
export const ALLOWED_CONTENT_TYPES = [
  'image/png',
  'image/jpeg',
  'image/jpg',
  'image/webp',
  'image/heic',
  'image/heif',
  'application/pdf',
  // 提出Excel（申請書類作成フォーム）を受け付ける
  'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet', // .xlsx
  'application/vnd.ms-excel', // .xls
]

export const SIGNED_URL_TTL_SECONDS = 60 * 60 // 60分

/**
 * サービスロール（RLSバイパス）クライアント。既存の createAdminClient に倣う。
 * サーバ側でアクセス確認を済ませたあとの storage 操作・行作成にのみ使う。
 */
export function getServiceClient() {
  return createAdminClient()
}

/** アップロードファイルの型・サイズ検証。問題があればエラーメッセージ、無ければ null。 */
export function validateUploadFile(file: {
  size: number
  type: string
}): string | null {
  if (!file.size || file.size <= 0) {
    return 'ファイルが空です'
  }
  if (file.size > MAX_UPLOAD_BYTES) {
    return 'ファイルサイズは10MB以下にしてください'
  }
  if (!ALLOWED_CONTENT_TYPES.includes(file.type)) {
    return '対応していないファイル形式です（PDF・画像・Excelのみ）'
  }
  return null
}

/** 拡張子（小文字・英数字のみ）。取得できなければ 'bin'。 */
function safeExtension(fileName: string): string {
  const dot = fileName.lastIndexOf('.')
  if (dot < 0 || dot === fileName.length - 1) {
    return 'bin'
  }
  const ext = fileName.slice(dot + 1).toLowerCase()
  return /^[a-z0-9]{1,10}$/.test(ext) ? ext : 'bin'
}

/**
 * バケット内のオブジェクトキーを生成する。ファイル名はタイムスタンプ+拡張子で正規化し、
 * 元のファイル名は DB 行の file_name 列で保持する（storage キーにユーザー入力を持ち込まない）。
 */
export function buildOfficeObjectKey(params: {
  tenantId: string
  officeId: string
  caseId: string
  requirementId: string
  fileName: string
}): string {
  const ext = safeExtension(params.fileName)
  return `${params.tenantId}/${params.officeId}/${params.caseId}/${params.requirementId}/${Date.now()}.${ext}`
}

export function buildPersonObjectKey(params: {
  tenantId: string
  personId: string
  caseId: string
  requirementId: string
  fileName: string
}): string {
  const ext = safeExtension(params.fileName)
  return `${params.tenantId}/${params.personId}/portal/${params.caseId}/${params.requirementId}/${Date.now()}.${ext}`
}
