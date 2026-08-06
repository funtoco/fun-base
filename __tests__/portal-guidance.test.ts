import { describe, it, expect } from 'vitest'
import { selectGuidance } from '@/lib/portal/guidance'
import { COUNCIL_GUIDES } from '@/lib/portal/guidance/council'
import { FLOW_STEPS } from '@/lib/portal/guidance/flow'
import { FIELD_LABELS, type Field } from '@/lib/portal/types'

const CONDITIONS = [
  { entityType: 'corporate', category: 'initial' },
  { entityType: 'corporate', category: 'renewal' },
  { entityType: 'sole_proprietor', category: 'initial' },
  { entityType: 'sole_proprietor', category: 'renewal' },
] as const

describe('selectGuidance: 申請の流れ', () => {
  it('法人では押印ステップの注記が「法人印」になる', () => {
    const g = selectGuidance({ entityType: 'corporate', category: 'initial' })
    const seal = g.flow.company.filter((s) => s.title === '書類への押印対応 / 返送')
    expect(seal).toHaveLength(1)
    expect(seal[0].note?.body).toContain('法人印')
  })

  it('個人事業主では押印ステップの注記が「実印又は認印」になる', () => {
    const g = selectGuidance({ entityType: 'sole_proprietor', category: 'initial' })
    const seal = g.flow.company.filter((s) => s.title === '書類への押印対応 / 返送')
    expect(seal).toHaveLength(1)
    expect(seal[0].note?.body).toContain('実印又は認印')
  })

  it('初回は協議会加入登録、更新は協議会登録確認のステップが出る', () => {
    const initial = selectGuidance({ entityType: 'corporate', category: 'initial' })
    const renewal = selectGuidance({ entityType: 'corporate', category: 'renewal' })
    expect(initial.flow.company.map((s) => s.id)).toContain('company-council-join')
    expect(initial.flow.company.map((s) => s.id)).not.toContain('company-council-check')
    expect(renewal.flow.company.map((s) => s.id)).toContain('company-council-check')
    expect(renewal.flow.company.map((s) => s.id)).not.toContain('company-council-join')
  })

  it('Funtoco と内定者のレーンは条件によらず同じ', () => {
    const a = selectGuidance({ entityType: 'corporate', category: 'initial' })
    const b = selectGuidance({ entityType: 'sole_proprietor', category: 'renewal' })
    expect(a.flow.funtoco.map((s) => s.id)).toEqual(b.flow.funtoco.map((s) => s.id))
    expect(a.flow.candidate.map((s) => s.id)).toEqual(b.flow.candidate.map((s) => s.id))
    expect(a.flow.funtoco).toHaveLength(6)
    expect(a.flow.candidate).toHaveLength(3)
  })

  it.each(CONDITIONS)('$entityType × $category で貴社レーンに同じ見出しが二重に出ない', (c) => {
    const titles = selectGuidance(c).flow.company.map((s) => s.title)
    expect(new Set(titles).size).toBe(titles.length)
    expect(titles).toHaveLength(5)
  })

  it('FLOW_STEPS の id は重複しない', () => {
    expect(new Set(FLOW_STEPS.map((s) => s.id)).size).toBe(FLOW_STEPS.length)
  })
})

describe('selectGuidance: 協議会', () => {
  it('分野が介護なら介護の協議会が先頭に来る', () => {
    const g = selectGuidance({ entityType: 'corporate', category: 'initial', field: 'care' })
    expect(g.councils.map((c) => c.id)).toEqual(['care', 'food', 'other'])
  })

  it('分野が外食業なら外食・飲食料品製造の協議会が先頭に来る', () => {
    const g = selectGuidance({
      entityType: 'corporate',
      category: 'initial',
      field: 'food_service',
    })
    expect(g.councils.map((c) => c.id)).toEqual(['food', 'care', 'other'])
  })

  it('分野が宿泊なら「その他分野」が先頭に来る', () => {
    const g = selectGuidance({
      entityType: 'corporate',
      category: 'initial',
      field: 'accommodation',
    })
    expect(g.councils.map((c) => c.id)).toEqual(['other', 'care', 'food'])
  })

  it('分野が未指定でも協議会は全件返る', () => {
    const g = selectGuidance({ entityType: 'corporate', category: 'initial' })
    expect(g.councils.map((c) => c.id)).toEqual(['care', 'food', 'other'])
  })

  it.each(Object.keys(FIELD_LABELS) as Field[])(
    '分野 %s に対応する協議会が必ず先頭に来る',
    (field) => {
      const g = selectGuidance({ entityType: 'corporate', category: 'initial', field })
      expect(g.councils[0].fields).toContain(field)
      expect(g.councils).toHaveLength(3)
    }
  )

  it('協議会は手順か説明のどちらかを必ず持つ', () => {
    for (const guide of COUNCIL_GUIDES) {
      expect(guide.steps.length > 0 || Boolean(guide.description)).toBe(true)
    }
  })
})
