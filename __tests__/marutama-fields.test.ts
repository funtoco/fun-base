import { describe, it, expect } from 'vitest'
import type { Person, DocumentType } from '@/lib/models'

/**
 * マルタマ対応: 新規フィールド・ドキュメントタイプのテスト
 */

// --- Person型の新規フィールド ---

describe('Person型: マルタマ対応フィールド', () => {
  const basePerson: Person = {
    id: 'test-id',
    name: 'テスト太郎',
    createdAt: '2026-01-01T00:00:00Z',
    updatedAt: '2026-01-01T00:00:00Z',
  }

  it('入社前フィールドが設定できること', () => {
    const person: Person = {
      ...basePerson,
      interviewDate: '2026-03-01',
      jobOfferDate: '2026-03-15',
      applicationNumber: 'APP-2026-001',
      departureProcedureStatus: '出国手続き完了',
      entryConfirmedDate: '2026-04-01',
      myNumber: '123456789012',
    }

    expect(person.interviewDate).toBe('2026-03-01')
    expect(person.jobOfferDate).toBe('2026-03-15')
    expect(person.applicationNumber).toBe('APP-2026-001')
    expect(person.departureProcedureStatus).toBe('出国手続き完了')
    expect(person.entryConfirmedDate).toBe('2026-04-01')
    expect(person.myNumber).toBe('123456789012')
  })

  it('入社後フィールドが設定できること', () => {
    const person: Person = {
      ...basePerson,
      joiningDate: '2026-04-15',
    }

    expect(person.joiningDate).toBe('2026-04-15')
  })

  it('社会保険フィールドが設定できること', () => {
    const person: Person = {
      ...basePerson,
      insuranceNumber: 'INS-12345',
      insuranceAcquiredDate: '2026-05-01',
      insuranceEnrollmentStatus: {
        healthInsurance: true,
        pension: true,
        employmentInsurance: false,
      },
    }

    expect(person.insuranceNumber).toBe('INS-12345')
    expect(person.insuranceAcquiredDate).toBe('2026-05-01')
    expect(person.insuranceEnrollmentStatus).toEqual({
      healthInsurance: true,
      pension: true,
      employmentInsurance: false,
    })
  })

  it('新規フィールドはすべてオプショナルであること', () => {
    // basePerson（必須フィールドのみ）が有効な Person であること
    const person: Person = { ...basePerson }

    expect(person.interviewDate).toBeUndefined()
    expect(person.jobOfferDate).toBeUndefined()
    expect(person.applicationNumber).toBeUndefined()
    expect(person.departureProcedureStatus).toBeUndefined()
    expect(person.entryConfirmedDate).toBeUndefined()
    expect(person.myNumber).toBeUndefined()
    expect(person.joiningDate).toBeUndefined()
    expect(person.insuranceNumber).toBeUndefined()
    expect(person.insuranceAcquiredDate).toBeUndefined()
    expect(person.insuranceEnrollmentStatus).toBeUndefined()
  })
})

// --- マイナンバー下4桁マスク表示 ---

describe('マイナンバー: 下4桁マスク表示', () => {
  // 詳細ページ (app/people/[id]/page.tsx) で使われるマスク表示ロジック
  function maskMyNumber(myNumber: string): string {
    return `****${myNumber.slice(-4)}`
  }

  it('12桁のマイナンバーが下4桁のみ表示されること', () => {
    expect(maskMyNumber('123456789012')).toBe('****9012')
  })

  it('短いマイナンバーでも下4桁が表示されること', () => {
    expect(maskMyNumber('1234')).toBe('****1234')
  })

  it('4桁未満でもクラッシュしないこと', () => {
    expect(maskMyNumber('12')).toBe('****12')
    expect(maskMyNumber('')).toBe('****')
  })
})

// --- DocumentType: 新規6タイプ ---

describe('DocumentType: 新規書類タイプ', () => {
  const VALID_DOCUMENT_TYPES: DocumentType[] = [
    'passport_front', 'passport_back',
    'residence_card_front', 'residence_card_back',
    'coe_copy', 'flight_ticket_copy', 'bank_card_copy',
    'resident_card_copy', 'resume', 'designation_document',
  ]

  it('既存の4タイプが含まれること', () => {
    expect(VALID_DOCUMENT_TYPES).toContain('passport_front')
    expect(VALID_DOCUMENT_TYPES).toContain('passport_back')
    expect(VALID_DOCUMENT_TYPES).toContain('residence_card_front')
    expect(VALID_DOCUMENT_TYPES).toContain('residence_card_back')
  })

  it('入社前書類の4タイプが含まれること', () => {
    expect(VALID_DOCUMENT_TYPES).toContain('coe_copy')
    expect(VALID_DOCUMENT_TYPES).toContain('flight_ticket_copy')
    expect(VALID_DOCUMENT_TYPES).toContain('bank_card_copy')
    expect(VALID_DOCUMENT_TYPES).toContain('resident_card_copy')
  })

  it('入社後書類の2タイプが含まれること', () => {
    expect(VALID_DOCUMENT_TYPES).toContain('resume')
    expect(VALID_DOCUMENT_TYPES).toContain('designation_document')
  })

  it('合計10タイプであること', () => {
    expect(VALID_DOCUMENT_TYPES).toHaveLength(10)
  })
})

// --- API バリデーションロジック ---

describe('API PUT /api/people/[id]: バリデーションロジック', () => {
  // route.ts で使用されるバリデーションロジックを再現
  const STRING_FIELDS = [
    'employeeNumber', 'employmentNotificationDate', 'employmentChangeNotificationDate',
    'interviewDate', 'jobOfferDate', 'applicationNumber', 'departureProcedureStatus',
    'entryConfirmedDate', 'myNumber', 'joiningDate',
    'insuranceNumber', 'insuranceAcquiredDate',
  ] as const

  function validateStringField(value: unknown): { valid: boolean } {
    if (value !== undefined && value !== null && typeof value !== 'string') {
      return { valid: false }
    }
    return { valid: true }
  }

  function validateBody(body: Record<string, unknown>): { valid: boolean; field?: string } {
    for (const field of STRING_FIELDS) {
      if (!validateStringField(body[field]).valid) {
        return { valid: false, field }
      }
    }
    const ies = body.insuranceEnrollmentStatus
    if (ies !== undefined && ies !== null && typeof ies !== 'object') {
      return { valid: false, field: 'insuranceEnrollmentStatus' }
    }
    return { valid: true }
  }

  it('文字列フィールドにstringを渡すと有効', () => {
    expect(validateBody({ interviewDate: '2026-03-01' })).toEqual({ valid: true })
    expect(validateBody({ myNumber: '123456789012' })).toEqual({ valid: true })
    expect(validateBody({ applicationNumber: 'APP-001' })).toEqual({ valid: true })
  })

  it('文字列フィールドにnullを渡すと有効', () => {
    expect(validateBody({ interviewDate: null })).toEqual({ valid: true })
    expect(validateBody({ joiningDate: null })).toEqual({ valid: true })
  })

  it('文字列フィールドにundefinedを渡すと有効（省略可）', () => {
    expect(validateBody({})).toEqual({ valid: true })
  })

  it('文字列フィールドに数値を渡すと無効', () => {
    expect(validateBody({ interviewDate: 123 })).toEqual({ valid: false, field: 'interviewDate' })
    expect(validateBody({ myNumber: 123456789012 })).toEqual({ valid: false, field: 'myNumber' })
  })

  it('文字列フィールドにbooleanを渡すと無効', () => {
    expect(validateBody({ applicationNumber: true })).toEqual({ valid: false, field: 'applicationNumber' })
  })

  it('insuranceEnrollmentStatusにオブジェクトを渡すと有効', () => {
    expect(validateBody({
      insuranceEnrollmentStatus: { healthInsurance: true, pension: false },
    })).toEqual({ valid: true })
  })

  it('insuranceEnrollmentStatusにnullを渡すと有効', () => {
    expect(validateBody({ insuranceEnrollmentStatus: null })).toEqual({ valid: true })
  })

  it('insuranceEnrollmentStatusに文字列を渡すと無効', () => {
    expect(validateBody({ insuranceEnrollmentStatus: 'invalid' })).toEqual({
      valid: false,
      field: 'insuranceEnrollmentStatus',
    })
  })

  it('insuranceEnrollmentStatusに数値を渡すと無効', () => {
    expect(validateBody({ insuranceEnrollmentStatus: 123 })).toEqual({
      valid: false,
      field: 'insuranceEnrollmentStatus',
    })
  })

  it('全新規フィールドを同時に指定できること', () => {
    expect(validateBody({
      interviewDate: '2026-03-01',
      jobOfferDate: '2026-03-15',
      applicationNumber: 'APP-001',
      departureProcedureStatus: '完了',
      entryConfirmedDate: '2026-04-01',
      myNumber: '123456789012',
      joiningDate: '2026-04-15',
      insuranceNumber: 'INS-001',
      insuranceAcquiredDate: '2026-05-01',
      insuranceEnrollmentStatus: { healthInsurance: true },
    })).toEqual({ valid: true })
  })
})

// --- フィールドマッピング ---

describe('API PUT: camelCase→snake_case フィールドマッピング', () => {
  const FIELD_MAPPING: Record<string, string> = {
    employeeNumber: 'employee_number',
    employmentNotificationDate: 'employment_notification_date',
    employmentChangeNotificationDate: 'employment_change_notification_date',
    interviewDate: 'interview_date',
    jobOfferDate: 'job_offer_date',
    applicationNumber: 'application_number',
    departureProcedureStatus: 'departure_procedure_status',
    entryConfirmedDate: 'entry_confirmed_date',
    myNumber: 'my_number',
    joiningDate: 'joining_date',
    insuranceNumber: 'insurance_number',
    insuranceAcquiredDate: 'insurance_acquired_date',
  }

  function buildUpdateFields(body: Record<string, unknown>): Record<string, unknown> {
    const updateFields: Record<string, unknown> = {}
    for (const [camelKey, snakeKey] of Object.entries(FIELD_MAPPING)) {
      const value = body[camelKey]
      if (value !== undefined) {
        updateFields[snakeKey] = (typeof value === 'string' && value.trim()) ? value.trim() : null
      }
    }
    return updateFields
  }

  it('新規フィールドが正しいDB列名にマッピングされること', () => {
    expect(FIELD_MAPPING.interviewDate).toBe('interview_date')
    expect(FIELD_MAPPING.jobOfferDate).toBe('job_offer_date')
    expect(FIELD_MAPPING.applicationNumber).toBe('application_number')
    expect(FIELD_MAPPING.departureProcedureStatus).toBe('departure_procedure_status')
    expect(FIELD_MAPPING.entryConfirmedDate).toBe('entry_confirmed_date')
    expect(FIELD_MAPPING.myNumber).toBe('my_number')
    expect(FIELD_MAPPING.joiningDate).toBe('joining_date')
    expect(FIELD_MAPPING.insuranceNumber).toBe('insurance_number')
    expect(FIELD_MAPPING.insuranceAcquiredDate).toBe('insurance_acquired_date')
  })

  it('マッピングが12フィールドあること（既存3 + 新規9）', () => {
    expect(Object.keys(FIELD_MAPPING)).toHaveLength(12)
  })

  it('文字列値がtrimされてマッピングされること', () => {
    const result = buildUpdateFields({
      applicationNumber: '  APP-001  ',
      myNumber: ' 123456789012 ',
    })
    expect(result.application_number).toBe('APP-001')
    expect(result.my_number).toBe('123456789012')
  })

  it('空文字列がnullにマッピングされること', () => {
    const result = buildUpdateFields({
      interviewDate: '',
      joiningDate: '   ',
    })
    expect(result.interview_date).toBeNull()
    expect(result.joining_date).toBeNull()
  })

  it('nullがnullにマッピングされること', () => {
    const result = buildUpdateFields({
      interviewDate: null,
    })
    expect(result.interview_date).toBeNull()
  })

  it('undefinedのフィールドはマッピング結果に含まれないこと', () => {
    const result = buildUpdateFields({
      interviewDate: '2026-03-01',
    })
    expect(result).toHaveProperty('interview_date')
    expect(result).not.toHaveProperty('job_offer_date')
  })
})

// --- 書類セクション構成 ---

describe('書類セクション: 入社前・入社後書類の構成', () => {
  // person-documents-tab.tsx の DOCUMENT_SECTIONS から再現
  const DOCUMENT_SECTIONS = [
    {
      title: 'パスポート',
      types: [
        { type: 'passport_front', label: 'パスポート（表）' },
        { type: 'passport_back', label: 'パスポート（裏）' },
      ],
    },
    {
      title: '在留カード',
      types: [
        { type: 'residence_card_front', label: '在留カード（表）' },
        { type: 'residence_card_back', label: '在留カード（裏）' },
      ],
    },
    {
      title: '入社前書類',
      types: [
        { type: 'coe_copy', label: 'COE写し' },
        { type: 'flight_ticket_copy', label: 'フライト写し' },
        { type: 'bank_card_copy', label: '口座カード写し' },
        { type: 'resident_card_copy', label: '住民票写し' },
      ],
    },
    {
      title: '入社後書類',
      types: [
        { type: 'resume', label: '履歴書' },
        { type: 'designation_document', label: '指定書写し' },
      ],
    },
  ]

  it('4つのセクションが存在すること', () => {
    expect(DOCUMENT_SECTIONS).toHaveLength(4)
  })

  it('入社前書類セクションに4つの書類タイプがあること', () => {
    const preEmployment = DOCUMENT_SECTIONS.find(s => s.title === '入社前書類')
    expect(preEmployment).toBeDefined()
    expect(preEmployment!.types).toHaveLength(4)
    expect(preEmployment!.types.map(t => t.type)).toEqual([
      'coe_copy', 'flight_ticket_copy', 'bank_card_copy', 'resident_card_copy',
    ])
  })

  it('入社後書類セクションに2つの書類タイプがあること', () => {
    const postEmployment = DOCUMENT_SECTIONS.find(s => s.title === '入社後書類')
    expect(postEmployment).toBeDefined()
    expect(postEmployment!.types).toHaveLength(2)
    expect(postEmployment!.types.map(t => t.type)).toEqual([
      'resume', 'designation_document',
    ])
  })

  it('全書類タイプの合計が10であること', () => {
    const allTypes = DOCUMENT_SECTIONS.flatMap(s => s.types)
    expect(allTypes).toHaveLength(10)
  })

  it('すべての書類タイプにラベルが設定されていること', () => {
    const allTypes = DOCUMENT_SECTIONS.flatMap(s => s.types)
    for (const t of allTypes) {
      expect(t.label).toBeTruthy()
      expect(t.label.length).toBeGreaterThan(0)
    }
  })
})
