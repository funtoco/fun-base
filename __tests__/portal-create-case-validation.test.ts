import { describe, it, expect } from 'vitest'
import { validateNewCase } from '@/lib/portal/case-validation'

const OFFICE = '11111111-1111-1111-1111-111111111111'

const validInput = {
  tenant_office_id: OFFICE,
  entity_type: 'corporate',
  application_category: 'initial',
  field: 'care',
}

describe('validateNewCase', () => {
  it('正常入力は ok:true と正規化した値を返す', () => {
    const result = validateNewCase(validInput)
    expect(result.ok).toBe(true)
    if (result.ok) {
      expect(result.value).toEqual({
        tenant_office_id: OFFICE,
        entity_type: 'corporate',
        application_category: 'initial',
        field: 'care',
        management_number: null,
        title: null,
      })
    }
  })

  it('任意項目（管理番号・タイトル）を trim して保持する', () => {
    const result = validateNewCase({
      ...validInput,
      management_number: '  A-100 ',
      title: '  近江舞子 初回  ',
    })
    expect(result.ok).toBe(true)
    if (result.ok) {
      expect(result.value.management_number).toBe('A-100')
      expect(result.value.title).toBe('近江舞子 初回')
    }
  })

  it('tenant_office_id が欠落するとエラー', () => {
    expect(validateNewCase({ ...validInput, tenant_office_id: '' })).toEqual({
      ok: false,
      error: 'tenant_office_id is required',
    })
    expect(validateNewCase({ ...validInput, tenant_office_id: undefined })).toEqual({
      ok: false,
      error: 'tenant_office_id is required',
    })
  })

  it('entity_type が欠落・enum外だとエラー', () => {
    expect(validateNewCase({ ...validInput, entity_type: undefined })).toEqual({
      ok: false,
      error: 'entity_type is required',
    })
    expect(validateNewCase({ ...validInput, entity_type: 'ngo' })).toEqual({
      ok: false,
      error: 'invalid entity_type',
    })
  })

  it('application_category が欠落・enum外だとエラー', () => {
    expect(validateNewCase({ ...validInput, application_category: undefined })).toEqual({
      ok: false,
      error: 'application_category is required',
    })
    expect(validateNewCase({ ...validInput, application_category: 'switch' })).toEqual({
      ok: false,
      error: 'invalid application_category',
    })
  })

  it('field が欠落・enum外だとエラー', () => {
    expect(validateNewCase({ ...validInput, field: undefined })).toEqual({
      ok: false,
      error: 'field is required',
    })
    expect(validateNewCase({ ...validInput, field: 'construction' })).toEqual({
      ok: false,
      error: 'invalid field',
    })
  })

  it('入力自体が無いとエラー', () => {
    expect(validateNewCase(null)).toEqual({ ok: false, error: 'input is required' })
    expect(validateNewCase(undefined)).toEqual({ ok: false, error: 'input is required' })
  })

  it('renewal / sole_proprietor / 他分野 も許容', () => {
    const result = validateNewCase({
      tenant_office_id: OFFICE,
      entity_type: 'sole_proprietor',
      application_category: 'renewal',
      field: 'food_manufacturing',
    })
    expect(result.ok).toBe(true)
  })
})
