import { describe, it, expect } from 'vitest'
import {
  OFFICE_DOC_STATUS_FIELDS,
  requirementStatusToKintoneLabel,
  kintoneLabelToRequirementStatus,
  buildOfficeDocStatusPayload,
  extractOfficeDocStatuses,
  listFilledOfficeDocCodes,
  diffOfficeDocStatuses,
} from '@/lib/portal/kintone-sync/office-doc-status'
import type { OfficeDocRequirement } from '@/lib/portal/kintone-sync/office-doc-status'

describe('OFFICE_DOC_STATUS_FIELDS', () => {
  it('事業所書類7種を doc_status_<document_code> に対応づける', () => {
    expect(OFFICE_DOC_STATUS_FIELDS).toEqual({
      corp_registry: 'doc_status_corp_registry',
      resident_record_corp: 'doc_status_resident_record_corp',
      labor_insurance_cert: 'doc_status_labor_insurance_cert',
      corp_tax_cert_type3: 'doc_status_corp_tax_cert_type3',
      social_insurance_proof: 'doc_status_social_insurance_proof',
      corp_residence_tax_cert: 'doc_status_corp_residence_tax_cert',
      kyogikai_cert: 'doc_status_kyogikai_cert',
    })
  })

  it('対象外の書類（Excel・人材書類）を含まない', () => {
    expect(OFFICE_DOC_STATUS_FIELDS).not.toHaveProperty('application_workbook')
    expect(OFFICE_DOC_STATUS_FIELDS).not.toHaveProperty('prev_documents')
  })
})

describe('ステータスラベルの双方向変換', () => {
  it('RequirementStatus → kintone の日本語ラベル', () => {
    expect(requirementStatusToKintoneLabel('not_submitted')).toBe('未提出')
    expect(requirementStatusToKintoneLabel('reviewing')).toBe('確認中')
    expect(requirementStatusToKintoneLabel('approved')).toBe('承認済み')
    expect(requirementStatusToKintoneLabel('needs_fix')).toBe('要修正')
  })

  it('kintone の日本語ラベル → RequirementStatus', () => {
    expect(kintoneLabelToRequirementStatus('未提出')).toBe('not_submitted')
    expect(kintoneLabelToRequirementStatus('確認中')).toBe('reviewing')
    expect(kintoneLabelToRequirementStatus('承認済み')).toBe('approved')
    expect(kintoneLabelToRequirementStatus('要修正')).toBe('needs_fix')
  })

  it('空欄・未知ラベルは null（OP が選択肢を増やしても壊れない）', () => {
    expect(kintoneLabelToRequirementStatus('')).toBeNull()
    expect(kintoneLabelToRequirementStatus('保留')).toBeNull()
  })
})

describe('buildOfficeDocStatusPayload', () => {
  const reqs: OfficeDocRequirement[] = [
    { id: 'r1', documentCode: 'corp_registry', status: 'reviewing' },
    { id: 'r2', documentCode: 'kyogikai_cert', status: 'not_submitted' },
  ]

  it('要件ごとに doc_status_* フィールドの payload を作る', () => {
    expect(buildOfficeDocStatusPayload(reqs)).toEqual({
      doc_status_corp_registry: { value: '確認中' },
      doc_status_kyogikai_cert: { value: '未提出' },
    })
  })

  it('マッピングに無い書類は payload に含めない', () => {
    const payload = buildOfficeDocStatusPayload([
      ...reqs,
      { id: 'r3', documentCode: 'application_workbook', status: 'reviewing' },
    ])
    expect(Object.keys(payload)).toEqual([
      'doc_status_corp_registry',
      'doc_status_kyogikai_cert',
    ])
  })

  it('対象が空なら空の payload（呼び出し側は kintone を叩かない）', () => {
    expect(buildOfficeDocStatusPayload([])).toEqual({})
  })
})

describe('extractOfficeDocStatuses', () => {
  it('値の入った doc_status_* を document_code + status で返す', () => {
    const record = {
      doc_status_corp_registry: { value: '承認済み' },
      doc_status_kyogikai_cert: { value: '要修正' },
    }
    expect(extractOfficeDocStatuses(record)).toEqual([
      { documentCode: 'corp_registry', status: 'approved' },
      { documentCode: 'kyogikai_cert', status: 'needs_fix' },
    ])
  })

  it('空欄・未知ラベル・無関係フィールドは除外する', () => {
    const record = {
      doc_status_corp_registry: { value: '' },
      doc_status_labor_insurance_cert: { value: '保留' },
      case_title: { value: '案件名' },
    }
    expect(extractOfficeDocStatuses(record)).toEqual([])
  })
})

describe('listFilledOfficeDocCodes', () => {
  it('値が入っている書類コードを返す（初期化のスキップ判定用）', () => {
    const record = {
      doc_status_corp_registry: { value: '未提出' },
      doc_status_kyogikai_cert: { value: '' },
    }
    expect(listFilledOfficeDocCodes(record)).toEqual(['corp_registry'])
  })

  it('未知ラベルも「入力済み」として扱い、上書きしない', () => {
    const record = { doc_status_corp_registry: { value: '保留' } }
    expect(listFilledOfficeDocCodes(record)).toEqual(['corp_registry'])
  })
})

describe('diffOfficeDocStatuses', () => {
  const reqs: OfficeDocRequirement[] = [
    { id: 'r1', documentCode: 'corp_registry', status: 'reviewing' },
    { id: 'r2', documentCode: 'kyogikai_cert', status: 'reviewing' },
  ]

  it('kintone 側で変わった要件だけ返す', () => {
    const diff = diffOfficeDocStatuses(
      [
        { documentCode: 'corp_registry', status: 'approved' },
        { documentCode: 'kyogikai_cert', status: 'reviewing' },
      ],
      reqs
    )
    expect(diff).toEqual([{ id: 'r1', status: 'approved' }])
  })

  it('変化が無ければ空配列（送信起因の Webhook を no-op にする）', () => {
    const diff = diffOfficeDocStatuses(
      [
        { documentCode: 'corp_registry', status: 'reviewing' },
        { documentCode: 'kyogikai_cert', status: 'reviewing' },
      ],
      reqs
    )
    expect(diff).toEqual([])
  })

  it('その案件の要件に無い書類は無視する', () => {
    const diff = diffOfficeDocStatuses(
      [{ documentCode: 'corp_tax_cert_type3', status: 'approved' }],
      reqs
    )
    expect(diff).toEqual([])
  })
})
