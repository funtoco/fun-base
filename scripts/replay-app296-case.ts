import { getServiceClient } from '../lib/portal/storage'
import { mapKintoneRecordToCaseRow, mirrorCaseFromKintone } from '../lib/portal/kintone-sync/case-mirror'
import { parseApp296ReplayInput } from '../lib/portal/kintone-sync/case-replay'

async function main() {
  const input = process.env.APP296_RECORD_JSON
  if (!input) {
    throw new Error('APP296_RECORD_JSONが未設定です')
  }

  const event = parseApp296ReplayInput(input)
  const mapped = mapKintoneRecordToCaseRow(event)
  const result = await mirrorCaseFromKintone(event)
  if (!result.caseId) {
    throw new Error(`案件を準備できませんでした: ${result.skipped ?? 'unknown'}`)
  }

  const service = getServiceClient()
  const [caseResult, officesResult, membersResult, requirementsResult] = await Promise.all([
    service
      .from('visa_application_cases')
      .select('id, tenant_id, title, status, kintone_record_id, kintone_sync_status')
      .eq('id', result.caseId)
      .single(),
    service
      .from('visa_application_case_offices')
      .select('tenant_office_id')
      .eq('case_id', result.caseId),
    service
      .from('visa_application_case_members')
      .select('person_id')
      .eq('case_id', result.caseId),
    service
      .from('case_document_requirements')
      .select('id, scope')
      .eq('case_id', result.caseId),
  ])

  for (const [label, query] of [
    ['case', caseResult],
    ['offices', officesResult],
    ['members', membersResult],
    ['requirements', requirementsResult],
  ] as const) {
    if (query.error) {
      throw new Error(`${label}の検証に失敗しました: ${query.error.message}`)
    }
  }

  const officeCount = officesResult.data?.length ?? 0
  const memberCount = membersResult.data?.length ?? 0
  const requirements = requirementsResult.data ?? []
  const expectedOfficeCount = new Set(mapped.officeNames.map((name) => name.trim())).size
  const expectedMemberCount = new Set(
    mapped.koyouTargets.map((target) => target.hrid).filter((hrid): hrid is string => Boolean(hrid))
  ).size

  if (officeCount < expectedOfficeCount) {
    throw new Error(`事業所の解決が不足しています: expected=${expectedOfficeCount} actual=${officeCount}`)
  }
  if (memberCount < expectedMemberCount) {
    throw new Error(`対象者の解決が不足しています: expected=${expectedMemberCount} actual=${memberCount}`)
  }
  if (requirements.length === 0) {
    throw new Error('必要書類が作成されていません')
  }

  const officeRequirementCount = requirements.filter((row) => row.scope === 'office').length
  const personRequirementCount = requirements.filter((row) => row.scope === 'person').length

  console.log(
    JSON.stringify(
      {
        ok: true,
        created: result.created,
        caseId: result.caseId,
        kintoneRecordId: event.recordId,
        title: caseResult.data?.title ?? null,
        status: caseResult.data?.status ?? null,
        kintoneSyncStatus: caseResult.data?.kintone_sync_status ?? null,
        officeCount,
        memberCount,
        requirementCount: requirements.length,
        officeRequirementCount,
        personRequirementCount,
      },
      null,
      2
    )
  )
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : error)
  process.exitCode = 1
})
