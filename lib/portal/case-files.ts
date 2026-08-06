import { createClient } from '@/lib/supabase/server'
import type { ActionResult } from './documents'
import { validateUploadFile } from './storage'
import {
  createKintoneWriteClientFromEnv,
  type KintoneWriteClient,
} from './kintone-sync/kintone-write-client'
import {
  appendCaseFiles,
  listCaseFiles,
  readCaseFile,
  type CaseFile,
} from './kintone-sync/case-files'

// 案件の「その他ファイル」の server-mediated 層。
// アクセス確認はユーザーセッション（RLS）で行い、確認後の kintone 操作は
// サーバ側の API トークンで行う（クライアントに kintone 認証を渡さない）。

/**
 * その他ファイルが使えない理由。UI にそのまま出す文言へ変換する。
 * - no_kintone_link: 案件がまだ kintone と紐付いていない
 * - no_kintone_auth: kintone 認証が未設定（環境変数）
 * - error: 一時的な取得失敗（kintone 障害・フィールド未作成・権限不足など）
 */
export type CaseFilesBlockedReason = 'no_kintone_link' | 'no_kintone_auth' | 'error'

export interface CaseFilesState {
  files: CaseFile[]
  /** アップロード可能なら true。false のとき blockedReason に理由が入る。 */
  canUpload: boolean
  blockedReason?: CaseFilesBlockedReason
}

/** 1ファイルごとのアップロード結果（部分失敗を画面に出すため）。 */
export interface CaseFileUploadResult {
  name: string
  ok: boolean
  error?: string
}

/** 1リクエストで受け付ける最大ファイル数（暴走リクエスト対策）。 */
export const MAX_FILES_PER_REQUEST = 10

type CaseAccess =
  | { ok: true; kintoneCaseId: string | null }
  | { ok: false; status: number; error: string }

/**
 * 案件をユーザーセッション（RLS）で読む。行が返れば「この案件へのアクセス権あり」。
 * 併せて kintone レコード番号（未連携なら null）を返す。
 */
async function loadCaseAccess(caseId: string): Promise<CaseAccess> {
  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) {
    return { ok: false, status: 401, error: 'ログインが必要です' }
  }

  const { data, error } = await supabase
    .from('visa_application_cases')
    .select('id, kintone_record_id')
    .eq('id', caseId)
    .maybeSingle()

  if (error) {
    console.error('case access check error:', error)
    return { ok: false, status: 500, error: 'アクセス確認に失敗しました' }
  }
  if (!data) {
    return { ok: false, status: 404, error: '案件が見つかりません' }
  }

  const kintoneCaseId = (data as { kintone_record_id: string | null })
    .kintone_record_id
  return { ok: true, kintoneCaseId: kintoneCaseId || null }
}

/** kintone 認証と案件連携が揃っているかを判定する。 */
function resolveClient(
  kintoneCaseId: string | null
):
  | { ok: true; client: KintoneWriteClient; kintoneCaseId: string }
  | { ok: false; blockedReason: 'no_kintone_link' | 'no_kintone_auth' } {
  if (!kintoneCaseId) {
    return { ok: false, blockedReason: 'no_kintone_link' }
  }
  const client = createKintoneWriteClientFromEnv()
  if (!client) {
    return { ok: false, blockedReason: 'no_kintone_auth' }
  }
  return { ok: true, client, kintoneCaseId }
}

/**
 * 案件詳細の初期表示用。アクセス不可・未連携・認証未設定でも throw せず、
 * 「アップロード不可」の状態として返す（画面には理由を出す）。
 */
export async function getCaseFilesState(caseId: string): Promise<CaseFilesState> {
  const access = await loadCaseAccess(caseId)
  if (!access.ok) {
    return { files: [], canUpload: false, blockedReason: 'error' }
  }

  const resolved = resolveClient(access.kintoneCaseId)
  if (!resolved.ok) {
    return { files: [], canUpload: false, blockedReason: resolved.blockedReason }
  }

  try {
    const files = await listCaseFiles(resolved.client, resolved.kintoneCaseId)
    return { files, canUpload: true }
  } catch (error) {
    // kintone 障害・添付フィールド未作成・トークン権限不足。ページ全体は壊さない。
    console.error('listCaseFiles failed:', error)
    return { files: [], canUpload: false, blockedReason: 'error' }
  }
}

/**
 * その他ファイルを複数アップロードする。
 * 検証・アップロードは1件ずつ行い、成功した fileKey だけをまとめて案件レコードへ追記する。
 */
export async function uploadCaseFiles(params: {
  caseId: string
  files: File[]
}): Promise<ActionResult<{ results: CaseFileUploadResult[] }>> {
  const { caseId, files } = params

  if (files.length === 0) {
    return { ok: false, status: 400, error: 'ファイルが指定されていません' }
  }
  if (files.length > MAX_FILES_PER_REQUEST) {
    return {
      ok: false,
      status: 400,
      error: `一度にアップロードできるのは${MAX_FILES_PER_REQUEST}件までです`,
    }
  }

  const access = await loadCaseAccess(caseId)
  if (!access.ok) {
    return { ok: false, status: access.status, error: access.error }
  }

  const resolved = resolveClient(access.kintoneCaseId)
  if (!resolved.ok) {
    return {
      ok: false,
      status: 409,
      error:
        resolved.blockedReason === 'no_kintone_link'
          ? 'この案件はまだ連携されていないため、ファイルをアップロードできません'
          : 'ファイル連携が設定されていません。管理者にお問い合わせください',
    }
  }
  const { client, kintoneCaseId } = resolved

  const results: CaseFileUploadResult[] = []
  const fileKeys: string[] = []

  for (const file of files) {
    const validationError = validateUploadFile({ size: file.size, type: file.type })
    if (validationError) {
      results.push({ name: file.name, ok: false, error: validationError })
      continue
    }
    try {
      const { fileKey } = await client.uploadFile({
        fileName: file.name,
        contentType: file.type,
        body: Buffer.from(await file.arrayBuffer()),
      })
      fileKeys.push(fileKey)
      results.push({ name: file.name, ok: true })
    } catch (error) {
      console.error('kintone uploadFile failed:', error)
      results.push({
        name: file.name,
        ok: false,
        error: 'アップロードに失敗しました',
      })
    }
  }

  if (fileKeys.length > 0) {
    try {
      await appendCaseFiles(client, kintoneCaseId, fileKeys)
    } catch (error) {
      // レコードへの紐付けに失敗＝どのファイルも保存されていない。成功扱いにしない。
      console.error('appendCaseFiles failed:', error)
      return {
        ok: false,
        status: 500,
        error: 'ファイルの保存に失敗しました。時間をおいて再度お試しください',
      }
    }
  }

  // 更新後の一覧は返さない。画面は router.refresh() で
  // getCaseFilesState を通して取り直すため、ここで取ると二重取得になる。
  return { ok: true, data: { results } }
}

/**
 * その他ファイル1件の本文を返す（プレビュー・ダウンロード用）。
 * 案件へのアクセス権と「その fileKey がこの案件のものであること」の両方を確認する。
 */
export async function downloadCaseFile(params: {
  caseId: string
  fileKey: string
}): Promise<ActionResult<{ name: string; contentType: string; body: Buffer }>> {
  const access = await loadCaseAccess(params.caseId)
  if (!access.ok) {
    return { ok: false, status: access.status, error: access.error }
  }

  const resolved = resolveClient(access.kintoneCaseId)
  if (!resolved.ok) {
    return { ok: false, status: 404, error: 'ファイルが見つかりません' }
  }

  try {
    const file = await readCaseFile(
      resolved.client,
      resolved.kintoneCaseId,
      params.fileKey
    )
    if (!file) {
      return { ok: false, status: 404, error: 'ファイルが見つかりません' }
    }
    return { ok: true, data: file }
  } catch (error) {
    console.error('readCaseFile failed:', error)
    return { ok: false, status: 500, error: 'ファイルの取得に失敗しました' }
  }
}
