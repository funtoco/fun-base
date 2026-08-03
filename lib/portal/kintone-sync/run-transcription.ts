import { getServiceClient } from '../storage'
import { createKintoneWriteClientFromEnv } from './kintone-write-client'
import { loadCaseHubLinks, writeBackSyncStatus, type CaseHubLinks } from './case-hub'
import { loadApplicationWorkbook, APPLICATION_WORKBOOK_CODE } from './source'
import {
  transcribeWorkbook,
  type TranscribeTargets,
  type TranscribeWorkbookResult,
} from './transcribe'

// 提出Excel → kintone 転記の「システム実行」コア。
// 認可（writer 判定など）は呼び出し側の責務。転記route（手動・writer限定）と
// アップロード自動トリガー（システム）から共通で使う。

export interface RunCaseTranscriptionResult {
  dryRun: boolean
  kintoneCaseId: string | null
  links: CaseHubLinks | null
  result: TranscribeWorkbookResult
  sourceFileName: string | null
}

/**
 * 案件の提出Excelを転記する。
 * - kintoneCaseId + client あり: app296 の事前紐付けを解決し、Aモデルで app34/app55 を直接 update。
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

  // app296（案件ハブ）から反映先レコード（company_ref/koyou_ref）を解決。
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
      app55RecordId: links.app55RecordId,
    }
  }

  const workbook = await loadApplicationWorkbook(params.caseId)
  if (!workbook.ok) {
    throw new Error(workbook.error)
  }

  try {
    const result = await transcribeWorkbook({
      buffer: workbook.data.buffer,
      dryRun,
      client,
      targets,
    })

    // 実書き込み時のみ app296 に成功サマリを書き戻す。
    if (!dryRun && client && params.kintoneCaseId) {
      const companyStatus =
        result.app34.plan.action === 'dry-run' ? '未反映' : '反映済'
      const koyouStatus =
        result.app55.plan.action === 'update' ? '反映済' : '未反映'
      await writeBackSyncStatus(client, params.kintoneCaseId, {
        companyStatus,
        koyouStatus,
        syncedAt: new Date().toISOString(),
        log:
          `法人(app34)=${result.app34.plan.action}/rec ${result.app34.plan.recordId ?? '-'} / ` +
          `雇用条件書(app55)=${result.app55.plan.action}/rec ${result.app55.plan.recordId ?? '-'}`,
      })
    }

    return {
      dryRun,
      kintoneCaseId: params.kintoneCaseId,
      links,
      result,
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
