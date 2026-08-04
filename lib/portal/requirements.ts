import type {
  CaseDocumentRequirement,
  GroupedRequirements,
  PersonRequirementGroup,
} from './types'

// 案件メンバー（人材）の表示名解決に使う最小情報
export interface MemberNameRef {
  personId: string
  personName: string | null
}

function bySortOrder(a: CaseDocumentRequirement, b: CaseDocumentRequirement): number {
  if (a.sortOrder !== b.sortOrder) {
    return a.sortOrder - b.sortOrder
  }
  return a.documentCode.localeCompare(b.documentCode)
}

/**
 * 必要書類の行を office / person（人材ごと）にグループ化する純関数。
 *
 * - office 行は sort_order 昇順。
 * - person 行は person_id ごとにまとめ、各グループ内は sort_order 昇順。
 * - members を渡すと、まだ書類行が無い（materialize 前など）メンバーも
 *   空グループとして順序を保って表示できる。
 * - 表示名は members 由来を優先し、無ければ requirement 行由来を使う。
 */
export function groupRequirements(
  requirements: CaseDocumentRequirement[],
  members: MemberNameRef[] = []
): GroupedRequirements {
  const office = requirements
    .filter((r) => r.scope === 'office')
    .sort(bySortOrder)

  // person_id ごとの行を集約
  const itemsByPerson = new Map<string, CaseDocumentRequirement[]>()
  for (const r of requirements) {
    if (r.scope !== 'person' || !r.personId) {
      continue
    }
    const list = itemsByPerson.get(r.personId) ?? []
    list.push(r)
    itemsByPerson.set(r.personId, list)
  }

  // 表示順序: members の並び順を尊重し、members に無い person_id は後ろに追加
  const orderedPersonIds: string[] = []
  const nameByPerson = new Map<string, string | null>()
  for (const m of members) {
    if (!orderedPersonIds.includes(m.personId)) {
      orderedPersonIds.push(m.personId)
    }
    nameByPerson.set(m.personId, m.personName)
  }
  for (const personId of itemsByPerson.keys()) {
    if (!orderedPersonIds.includes(personId)) {
      orderedPersonIds.push(personId)
    }
  }

  const persons: PersonRequirementGroup[] = orderedPersonIds.map((personId) => {
    const items = (itemsByPerson.get(personId) ?? []).slice().sort(bySortOrder)
    // person 書類行は氏名を持たないため、表示名は members 由来のみ解決する
    const personName = nameByPerson.get(personId) ?? null
    return { personId, personName, items }
  })

  return { office, persons }
}
