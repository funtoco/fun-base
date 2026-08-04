import { getServiceClient } from '../storage'
import { createKintoneWriteClientFromEnv } from './kintone-write-client'
import {
  loadCaseHubLinks,
  writeBackSyncStatus,
  type CaseHubLinks,
  type SyncStatus,
} from './case-hub'
import { loadApplicationWorkbook, APPLICATION_WORKBOOK_CODE } from './source'
import {
  transcribeWorkbook,
  syncStatusLabelForAction,
  type TranscribeTargets,
  type TranscribeResult,
} from './transcribe'
import type { KintoneRecordPayload } from './types'

// 提出Excel → kintone 転記の「システム実行」コア。
// 認可（writer 判定など）は呼び出し側の責務。転記route（手動・writer限定）と
// アップロード自動トリガー（システム）から共通で使う。

/** app55（雇用条件書）1人分の書込結果。 */
export interface App55WriteResult {
  /** 反映先 app55 レコード番号（koyou_ref）。 */
  app55RecordId: string
  /** 実行された操作。 */
  action: 'update' | 'dry-run' | 'error'
  /** 表示用の申請人名（koyou_applicant_disp・あれば）。 */
  applicantName: string | null
  /** action='error' 時のメッセージ。 */
  error?: string
}

export interface RunCaseTranscriptionResult {
  dryRun: boolean
  kintoneCaseId: string | null
  links: CaseHubLinks | null
  /** 法人(app34)の転記結果。 */
  app34: TranscribeResult
  /** app55 に送った共通payload（人固有項目は除外済み）。 */
  app55Record: KintoneRecordPayload
  /** 雇用条件書(app55)を各人へ fan-out した結果（0件=紐付け無し）。 */
  app55Writes: App55WriteResult[]
  sourceFileName: string | null
}

/**
 * 案件の提出Excelを転記する。
 * - kintoneCaseId + client あり: app296 の事前紐付けを解決し、Aモデルで app34 を直接 update、
 *   app55（雇用条件書）は koyou_details サブテーブルの各人へ同一payloadを fan-out。
 * - 実書き込み（dryRun=false かつ client あり）時は結果を app296 に書き戻す（成功/エラー）。
 * - dryRun（既定 false）や client 無しは書き込みなし。
 */
export async function runCaseTranscription(params: {
  caseId: string
  kintoneCaseId: string | null
  dryRun?: boolean
}): Promise<RunCaseTranscriptionResult> {
  const dryRun = params.dryRun ?? false
  const client = createKintoneWriteClientFromEnv()

  // app296（案件ハブ）から反映先（company_ref / koyou_details サブテーブル）を解決。
  let links: CaseHubLinks | null = null
  let targets: TranscribeTargets = {}
  if (client && params.kintoneCaseId) {
    links = await loadCaseHubLinks(client, params.kintoneCaseId)
    if (!links) {
      throw new Error(
        `ビザ案件管理(app296)にレコード「${params.kintoneCaseId}」が見つかりません`
      )
    }
    targets = {
      app34RecordId: links.app34RecordId,
    }
  }

  const workbook = await loadApplicationWorkbook(params.caseId)
  if (!workbook.ok) {
    throw new Error(workbook.error)
  }

  const koyouTargets = links?.koyouTargets ?? []

  try {
    const result = await transcribeWorkbook({
      buffer: workbook.data.buffer,
      dryRun,
      client,
      targets,
    })

    // app55（雇用条件書）は複数人。共通payloadを各人のレコードへ fan-out する。
    // 1人分の失敗が他の人を巻き添えにしないよう、行ごとに成否を収集する（app34同様の分離方針）。
    const app55Writes: App55WriteResult[] = []
    for (const target of koyouTargets) {
      if (dryRun || !client) {
        app55Writes.push({
          app55RecordId: target.app55RecordId,
          action: 'dry-run',
          applicantName: target.applicantName,
        })
        continue
      }
      try {
        await client.updateRecord('55', target.app55RecordId, result.app55Record)
        app55Writes.push({
          app55RecordId: target.app55RecordId,
          action: 'update',
          applicantName: target.applicantName,
        })
      } catch (e) {
        app55Writes.push({
          app55RecordId: target.app55RecordId,
          action: 'error',
          applicantName: target.applicantName,
          error: e instanceof Error ? e.message : String(e),
        })
      }
    }

    // 実書き込み時のみ app296 に結果を書き戻す。app34 と app55(全人の集計) を個別に成否判定。
    // 書き戻し自体の失敗は握り潰す（実書き込み結果のラベルを覆さない・元処理は成功扱い）。
    if (!dryRun && client && params.kintoneCaseId) {
      const okCount = app55Writes.filter((w) => w.action === 'update').length
      const errCount = app55Writes.filter((w) => w.action === 'error').length
      // 1人でも失敗→エラー / 対象0人→未反映 / 全員成功→反映済。
      const koyouStatus: SyncStatus =
        app55Writes.length === 0 ? '未反映' : errCount > 0 ? 'エラー' : '反映済'
      try {
        await writeBackSyncStatus(client, params.kintoneCaseId, {
          companyStatus: syncStatusLabelForAction(result.app34.plan.action),
          koyouStatus,
          syncedAt: new Date().toISOString(),
          log:
            `法人(app34)=${result.app34.plan.action}/rec ${result.app34.plan.recordId ?? '-'} / ` +
            `雇用条件書(app55)=${okCount}件反映済・${errCount}件エラー（計${app55Writes.length}人）`,
        })
      } catch (writebackError) {
        console.error('Error writing back sync status to app296:', writebackError)
      }
    }

    return {
      dryRun,
      kintoneCaseId: params.kintoneCaseId,
      links,
      app34: result.app34,
      app55Record: result.app55Record,
      app55Writes,
      sourceFileName: workbook.data.fileName,
    }
  } catch (error) {
    // 実書き込み中の失敗は app296 にエラーを書き戻す（可能なら）。書き戻し失敗は無視。
    const message =
      error instanceof Error ? error.message : 'kintone転記に失敗しました'
    if (!dryRun && client && params.kintoneCaseId) {
      try {
        await writeBackSyncStatus(client, params.kintoneCaseId, {
          companyStatus: 'エラー',
          koyouStatus: 'エラー',
          syncedAt: new Date().toISOString(),
          log: `エラー: ${message}`,
        })
      } catch (writebackError) {
        console.error('Error writing back sync error to app296:', writebackError)
      }
    }
    throw error
  }
}

/**
 * アップロード自動トリガー。
 * 対象要件が application_workbook（office 提出Excel）で、案件が app296 と紐付いていれば、
 * 実書き込み転記を実行する。それ以外・未紐付けは何もしない（呼び出し側で await して使う）。
 */
export async function maybeAutoTranscribeOnUpload(params: {
  caseId: string
  requirementId: string
}): Promise<{ triggered: boolean; reason?: string }> {
  const service = getServiceClient()

  // 要件の document_code を確認（application_workbook 以外は対象外）。
  const { data: req } = await service
    .from('case_document_requirements')
    .select('document_code')
    .eq('id', params.requirementId)
    .maybeSingle()
  const docCode = (req as { document_code?: string } | null)?.document_code
  if (docCode !== APPLICATION_WORKBOOK_CODE) {
    return { triggered: false, reason: 'not_application_workbook' }
  }

  // 案件の kintone 紐付けを確認（未紐付けはスキップ）。
  const { data: caseRow } = await service
    .from('visa_application_cases')
    .select('kintone_record_id')
    .eq('id', params.caseId)
    .maybeSingle()
  const kintoneCaseId =
    (caseRow as { kintone_record_id?: string | null } | null)?.kintone_record_id ??
    null
  if (!kintoneCaseId) {
    return { triggered: false, reason: 'no_kintone_link' }
  }

  await runCaseTranscription({
    caseId: params.caseId,
    kintoneCaseId,
    dryRun: false,
  })
  return { triggered: true }
}
