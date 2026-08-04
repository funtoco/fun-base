import { describe, it, expect } from 'vitest'
import { validateInviteOffices } from '@/lib/portal/invite-validation'

describe('validateInviteOffices', () => {
  it('member/guest は officeIds が空だとエラー', () => {
    expect(validateInviteOffices('member', [])).toEqual({ ok: false, error: 'officeIds required for member/guest' })
    expect(validateInviteOffices('guest', undefined)).toEqual({ ok: false, error: 'officeIds required for member/guest' })
  })
  it('member/guest は officeIds があればOK', () => {
    expect(validateInviteOffices('member', ['11111111-1111-1111-1111-111111111111'])).toEqual({ ok: true })
  })
  it('owner/admin は officeIds 不要', () => {
    expect(validateInviteOffices('admin', [])).toEqual({ ok: true })
    expect(validateInviteOffices('owner', undefined)).toEqual({ ok: true })
  })
})
