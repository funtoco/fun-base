import { describe, it, expect } from 'vitest'
import {
  pushOfficeDocStatuses,
  pushRequirementStatusToKintone,
} from '@/lib/portal/kintone-sync/office-doc-sync'
import type { KintoneWriteClient } from '@/lib/portal/kintone-sync/kintone-write-client'

const dummyClient = {} as KintoneWriteClient

describe('pushOfficeDocStatuses: 早期 skip（DBに触れない）', () => {
  it('kintone 書込クライアント未設定 → skipped(no_kintone_auth)', async () => {
    const res = await pushOfficeDocStatuses({
      caseId: 'c1',
      kintoneCaseId: '296',
      client: null,
    })
    expect(res).toEqual({ status: 'skipped', reason: 'no_kintone_auth' })
  })

  it('案件が app296 と未紐付け → skipped(no_kintone_link)', async () => {
    const res = await pushOfficeDocStatuses({
      caseId: 'c1',
      kintoneCaseId: null,
      client: dummyClient,
    })
    expect(res).toEqual({ status: 'skipped', reason: 'no_kintone_link' })
  })

  it('送る書類が1件も無い（全件が入力済み）→ skipped(nothing_to_push)・kintoneを叩かない', async () => {
    const res = await pushOfficeDocStatuses({
      caseId: 'c1',
      kintoneCaseId: '296',
      client: dummyClient,
      documentCodes: [],
    })
    expect(res).toEqual({ status: 'skipped', reason: 'nothing_to_push' })
  })
})

describe('pushRequirementStatusToKintone: 早期 skip（DBに触れない）', () => {
  it('kintone 書込クライアント未設定 → skipped(no_kintone_auth)', async () => {
    const res = await pushRequirementStatusToKintone({
      caseId: 'c1',
      requirementId: 'r1',
      client: null,
    })
    expect(res).toEqual({ status: 'skipped', reason: 'no_kintone_auth' })
  })
})
