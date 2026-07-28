import { describe, it, expect } from 'vitest'
import { groupRequirements, type MemberNameRef } from '@/lib/portal/requirements'
import type { CaseDocumentRequirement } from '@/lib/portal/types'

function req(
  overrides: Partial<CaseDocumentRequirement> & Pick<CaseDocumentRequirement, 'id' | 'documentCode' | 'scope' | 'sortOrder'>
): CaseDocumentRequirement {
  return {
    caseId: 'case-1',
    name: overrides.documentCode,
    personId: null,
    isRequired: true,
    copyType: 'copy',
    issuer: null,
    validityMonths: null,
    status: 'not_submitted',
    rejectionReason: null,
    officeDocumentId: null,
    personDocumentId: null,
    ...overrides,
  }
}

describe('groupRequirements', () => {
  it('office 行を sort_order 昇順で返し、person が無ければ persons は空', () => {
    const rows = [
      req({ id: '2', documentCode: 'tax_payment_cert', scope: 'office', sortOrder: 20 }),
      req({ id: '1', documentCode: 'company_registry', scope: 'office', sortOrder: 10 }),
    ]
    const result = groupRequirements(rows)
    expect(result.office.map((r) => r.documentCode)).toEqual([
      'company_registry',
      'tax_payment_cert',
    ])
    expect(result.persons).toEqual([])
  })

  it('person 行を person_id ごとにまとめ、各グループ内は sort_order 昇順', () => {
    const rows = [
      req({ id: 'o1', documentCode: 'company_registry', scope: 'office', sortOrder: 10 }),
      req({ id: 'p1b', documentCode: 'passport_copy', scope: 'person', personId: 'person-A', sortOrder: 120 }),
      req({ id: 'p1a', documentCode: 'residence_card', scope: 'person', personId: 'person-A', sortOrder: 110 }),
      req({ id: 'p2a', documentCode: 'residence_card', scope: 'person', personId: 'person-B', sortOrder: 110 }),
    ]
    const members: MemberNameRef[] = [
      { personId: 'person-A', personName: 'アウン' },
      { personId: 'person-B', personName: 'ディーパ' },
    ]
    const result = groupRequirements(rows, members)

    expect(result.office).toHaveLength(1)
    expect(result.persons).toHaveLength(2)

    const groupA = result.persons[0]
    expect(groupA.personId).toBe('person-A')
    expect(groupA.personName).toBe('アウン')
    expect(groupA.items.map((r) => r.documentCode)).toEqual([
      'residence_card',
      'passport_copy',
    ])

    const groupB = result.persons[1]
    expect(groupB.personName).toBe('ディーパ')
    expect(groupB.items).toHaveLength(1)
  })

  it('members の並び順を尊重し、書類行がまだ無いメンバーも空グループで表示', () => {
    const rows = [
      req({ id: 'p1', documentCode: 'residence_card', scope: 'person', personId: 'person-A', sortOrder: 110 }),
    ]
    const members: MemberNameRef[] = [
      { personId: 'person-A', personName: 'アウン' },
      { personId: 'person-B', personName: 'ディーパ' },
    ]
    const result = groupRequirements(rows, members)
    expect(result.persons.map((p) => p.personId)).toEqual(['person-A', 'person-B'])
    expect(result.persons[1].items).toEqual([])
  })

  it('members に含まれない person_id の行は末尾に追加（名前は null）', () => {
    const rows = [
      req({ id: 'p1', documentCode: 'residence_card', scope: 'person', personId: 'person-A', sortOrder: 110 }),
      req({ id: 'p2', documentCode: 'residence_card', scope: 'person', personId: 'person-Z', sortOrder: 110 }),
    ]
    const members: MemberNameRef[] = [{ personId: 'person-A', personName: 'アウン' }]
    const result = groupRequirements(rows, members)
    expect(result.persons.map((p) => p.personId)).toEqual(['person-A', 'person-Z'])
    expect(result.persons[1].personName).toBeNull()
  })
})
