import { describe, it, expect } from 'vitest'
import { selectGuidance } from '@/lib/portal/guidance'
import { COUNCIL_GUIDES } from '@/lib/portal/guidance/council'
import { DOCUMENTS } from '@/lib/portal/guidance/documents'
import { FLOW_STEPS } from '@/lib/portal/guidance/flow'
import { DOCUMENT_SAMPLES } from '@/lib/portal/guidance/samples'
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
  it('分野が介護なら介護の協議会が先頭に来て、残りは定義順で続く', () => {
    const g = selectGuidance({ entityType: 'corporate', category: 'initial', field: 'care' })
    expect(g.councils.map((c) => c.id)).toEqual(['care', 'food', 'other'])
  })

  it('分野が外食業なら外食・飲食料品製造の協議会が先頭に来て、残りは定義順で続く', () => {
    const g = selectGuidance({
      entityType: 'corporate',
      category: 'initial',
      field: 'food_service',
    })
    expect(g.councils.map((c) => c.id)).toEqual(['food', 'care', 'other'])
  })

  it('分野が宿泊なら「その他分野」の協議会が先頭に来て、残りは定義順で続く', () => {
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

describe('selectGuidance: 取得書類', () => {
  it('個人事業主 × 初回は8件', () => {
    const g = selectGuidance({ entityType: 'sole_proprietor', category: 'initial' })
    expect(g.documents).toHaveLength(8)
    expect(g.documents[0].name).toContain('住民票')
  })

  it('法人 × 初回は8件で、1件目が履歴事項全部証明書', () => {
    const g = selectGuidance({ entityType: 'corporate', category: 'initial' })
    expect(g.documents).toHaveLength(8)
    expect(g.documents[0].name).toBe('履歴事項全部証明書')
  })

  it('更新は entityType によらず3件', () => {
    const corp = selectGuidance({ entityType: 'corporate', category: 'renewal' })
    const sole = selectGuidance({ entityType: 'sole_proprietor', category: 'renewal' })
    expect(corp.documents).toHaveLength(3)
    expect(sole.documents).toHaveLength(3)
  })

  it('介護分野では営業許可証が落ちる', () => {
    const g = selectGuidance({ entityType: 'corporate', category: 'initial', field: 'care' })
    expect(g.documents).toHaveLength(7)
    expect(g.documents.some((d) => d.name.includes('営業許可証'))).toBe(false)
  })

  it('外食業分野では営業許可証が残る', () => {
    const g = selectGuidance({
      entityType: 'corporate',
      category: 'initial',
      field: 'food_service',
    })
    expect(g.documents).toHaveLength(8)
    expect(g.documents.some((d) => d.name.includes('営業許可証'))).toBe(true)
  })

  it('分野が未指定なら営業許可証を落とさない', () => {
    const g = selectGuidance({ entityType: 'corporate', category: 'initial' })
    expect(g.documents.some((d) => d.name.includes('営業許可証'))).toBe(true)
  })

  it('返り値を破壊してもモジュール定数が汚染されない', () => {
    const g = selectGuidance({ entityType: 'corporate', category: 'initial' })
    g.councils.length = 0
    g.documents.length = 0
    expect(COUNCIL_GUIDES).toHaveLength(3)
    expect(DOCUMENTS['corporate:initial']).toHaveLength(8)
  })

  it.each(Object.keys(DOCUMENTS) as (keyof typeof DOCUMENTS)[])(
    '%s の書類番号は1から連番になっている',
    (key) => {
      const nos = DOCUMENTS[key].map((d) => d.no)
      expect(nos).toEqual(nos.map((_, i) => i + 1))
    }
  )

  it.each([
    { entityType: 'corporate', category: 'initial', field: 'care', nos: [1, 2, 3, 4, 5, 6, 8] },
    {
      entityType: 'sole_proprietor',
      category: 'initial',
      field: 'food_manufacturing',
      nos: [1, 2, 3, 4, 5, 6, 8],
    },
    {
      entityType: 'corporate',
      category: 'initial',
      field: 'accommodation',
      nos: [1, 2, 3, 4, 5, 6, 7, 8],
    },
    {
      entityType: 'corporate',
      category: 'initial',
      field: 'food_service',
      nos: [1, 2, 3, 4, 5, 6, 7, 8],
    },
    { entityType: 'corporate', category: 'renewal', field: 'care', nos: [1, 2] },
  ] as const)('$entityType × $category × $field は原典の書類番号を保持する（欠番あり）', (c) => {
    expect(selectGuidance(c).documents.map((d) => d.no)).toEqual([...c.nos])
  })
})

describe('selectGuidance: 書類サンプル', () => {
  it('書類が参照する sampleId はすべて samples に存在する', () => {
    const referenced = Object.values(DOCUMENTS)
      .flat()
      .flatMap((doc) => doc.sampleIds ?? [])
    expect(referenced.length).toBeGreaterThan(0)
    for (const id of referenced) {
      expect(DOCUMENT_SAMPLES[id], `未定義の sampleId: ${id}`).toBeDefined()
    }
  })

  it('samples はすべていずれかの書類から参照されている', () => {
    const referenced = new Set(
      Object.values(DOCUMENTS)
        .flat()
        .flatMap((doc) => doc.sampleIds ?? [])
    )
    const orphans = Object.keys(DOCUMENT_SAMPLES).filter((id) => !referenced.has(id))
    expect(orphans).toEqual([])
  })

  it('サンプルは14件で、id とキーが一致している', () => {
    expect(Object.keys(DOCUMENT_SAMPLES)).toHaveLength(14)
    for (const [key, sample] of Object.entries(DOCUMENT_SAMPLES)) {
      expect(sample.id).toBe(key)
    }
  })

  it('サンプルの src は id から導出されている', () => {
    for (const sample of Object.values(DOCUMENT_SAMPLES)) {
      expect(sample.src).toBe(`/guidance/samples/${sample.id}.jpg`)
    }
  })

  it('個人事業主 × 初回のサンプルに住民票が含まれる', () => {
    const g = selectGuidance({ entityType: 'sole_proprietor', category: 'initial' })
    expect(g.samples.map((s) => s.id)).toContain('sp-residence-certificate')
  })

  it('介護分野では営業許可証のサンプルが出ない', () => {
    const g = selectGuidance({ entityType: 'corporate', category: 'initial', field: 'care' })
    expect(g.samples.map((s) => s.id)).not.toContain('business-permit-food')
    expect(g.samples.map((s) => s.id)).not.toContain('business-permit-lodging')
  })

  it('同じサンプルが重複して返らない', () => {
    const g = selectGuidance({ entityType: 'corporate', category: 'initial' })
    const ids = g.samples.map((s) => s.id)
    expect(new Set(ids).size).toBe(ids.length)
  })
})
