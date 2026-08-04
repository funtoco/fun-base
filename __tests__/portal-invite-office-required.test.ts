import { describe, it, expect } from 'vitest'
import { parseOfficeIds, validateInviteOffices } from '@/lib/portal/invite-validation'

describe('validateInviteOffices', () => {
  it('member/guest は officeIds が空でも全所属先扱いでOK', () => {
    expect(validateInviteOffices('member', [])).toEqual({ ok: true })
    expect(validateInviteOffices('guest', undefined)).toEqual({ ok: true })
  })

  it('member/guest は officeIds があれば特定所属先指定としてOK', () => {
    expect(validateInviteOffices('member', ['11111111-1111-1111-1111-111111111111'])).toEqual({ ok: true })
  })

  it('owner/admin は officeIds 不要', () => {
    expect(validateInviteOffices('admin', [])).toEqual({ ok: true })
    expect(validateInviteOffices('owner', undefined)).toEqual({ ok: true })
  })
})

describe('parseOfficeIds', () => {
  it('未指定と空配列は全所属先扱いの空配列に正規化する', () => {
    expect(parseOfficeIds(undefined)).toEqual({ ok: true, officeIds: [] })
    expect(parseOfficeIds([])).toEqual({ ok: true, officeIds: [] })
  })

  it('重複と空白を正規化する', () => {
    expect(parseOfficeIds([' office-1 ', 'office-1', 'office-2'])).toEqual({
      ok: true,
      officeIds: ['office-1', 'office-2'],
    })
  })

  it('不正なofficeIdsは全所属先扱いにせずエラーにする', () => {
    expect(parseOfficeIds('office-1')).toEqual({ ok: false, error: 'Invalid officeIds' })
    expect(parseOfficeIds(null)).toEqual({ ok: false, error: 'Invalid officeIds' })
    expect(parseOfficeIds([123])).toEqual({ ok: false, error: 'Invalid officeIds' })
    expect(parseOfficeIds([''])).toEqual({ ok: false, error: 'Invalid officeIds' })
  })
})
