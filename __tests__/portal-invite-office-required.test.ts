import { describe, it, expect } from 'vitest'
import { validateInviteOffices } from '@/lib/portal/invite-validation'

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
