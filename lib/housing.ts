import { parseAddress, type AddressParts, type ParsedAddress } from "./address"

export const NO_ROOM_LABEL = "部屋の記入なし"

const collator = new Intl.Collator("ja", { numeric: true })

export type HousingPerson = { name: string; address?: string | AddressParts | null }
export type HousingBuilding<P> = {
  key: string
  title: string
  address: string
  count: number
  rooms: { label: string; people: P[] }[]
}

/** FunBase の在籍状況に基づく表示対象。 */
export function selectHousingPeople<P extends { workingStatus?: string }>(people: P[]): P[] {
  return people.filter((person) => person.workingStatus === "在籍中" || person.workingStatus === "入社待ち")
}

type HousingFilterPerson = { tenantName?: string; company?: string }

/** null は「すべて」、空文字は未入力の候補を表す。 */
export function filterHousingPeople<P extends HousingFilterPerson>(people: P[], tenantName: string | null, company: string | null): P[] {
  return people.filter((person) =>
    (tenantName === null || (person.tenantName ?? "") === tenantName) &&
    (company === null || (person.company ?? "") === company)
  )
}

export function getHousingTenants(people: HousingFilterPerson[]): string[] {
  return [...new Set(people.map((person) => person.tenantName ?? ""))].sort(collator.compare)
}

export function getHousingCompanies(people: HousingFilterPerson[], tenantName: string | null): string[] {
  return [...new Set(filterHousingPeople(people, tenantName, null).map((person) => person.company ?? ""))].sort(collator.compare)
}

function mostCommon(values: string[]): string {
  const count = new Map<string, number>()
  for (const value of values) if (value) count.set(value, (count.get(value) ?? 0) + 1)
  return [...count.entries()].sort((a, b) => b[1] - a[1] || collator.compare(a[0], b[0]))[0]?.[0] ?? ""
}

/** 番地の片方がもう片方の前方一致なら、枝番の記入漏れとして統合できる。 */
function areBanchiCompatible(a: string, b: string): boolean {
  const left = a.split("-")
  const right = b.split("-")
  const shorter = left.length <= right.length ? left : right
  const longer = left.length <= right.length ? right : left
  return shorter.every((value, index) => value === longer[index])
}

/** 同じ番地、または同じ町・同じ建物名で枝番だけが異なる人を1つの建物にまとめる。 */
function unionBuildings(parsed: ParsedAddress[]): (address: ParsedAddress) => string {
  const parent = new Map<string, string>()
  const find = (value: string): string => {
    if (!parent.has(value)) parent.set(value, value)
    while (parent.get(value) !== value) {
      parent.set(value, parent.get(parent.get(value)!)!)
      value = parent.get(value)!
    }
    return value
  }
  const union = (a: string, b: string) => {
    const rootA = find(a)
    const rootB = find(b)
    if (rootA !== rootB) parent.set(rootA, rootB)
  }

  const byName = new Map<string, ParsedAddress[]>()
  for (const address of parsed) {
    find(`k:${address.key}`)
    if (!address.nameKey) continue
    const matches = byName.get(address.nameKey) ?? []
    for (const other of matches) {
      if (areBanchiCompatible(address.banchi, other.banchi)) {
        union(`k:${address.key}`, `k:${other.key}`)
      }
    }
    matches.push(address)
    byName.set(address.nameKey, matches)
  }
  return (address) => find(`k:${address.key}`)
}

export function groupHousing<P extends HousingPerson>(people: P[]): {
  buildings: HousingBuilding<P>[]
  noAddress: P[]
  residentCount: number
} {
  const noAddress: P[] = []
  const withAddress: { p: P; a: ParsedAddress }[] = []
  for (const person of people) {
    const source = typeof person.address === "string" ? { full: person.address } : person.address ?? {}
    const parsed = parseAddress(source)
    if (parsed.key) withAddress.push({ p: person, a: parsed })
    else noAddress.push(person)
  }

  const buildingOf = unionBuildings(withAddress.map(({ a }) => a))
  const byBuilding = new Map<string, { parsed: ParsedAddress[]; rooms: Map<string, { label: string; people: P[] }> }>()
  for (const { p, a } of withAddress) {
    const key = buildingOf(a)
    if (!byBuilding.has(key)) byBuilding.set(key, { parsed: [], rooms: new Map() })
    const building = byBuilding.get(key)!
    building.parsed.push(a)
    if (!building.rooms.has(a.roomKey)) building.rooms.set(a.roomKey, { label: a.room || NO_ROOM_LABEL, people: [] })
    building.rooms.get(a.roomKey)!.people.push(p)
  }

  const byName = (a: P, b: P) => collator.compare(a.name ?? "", b.name ?? "")
  const buildings = [...byBuilding.entries()].map(([key, building]) => {
    const address = mostCommon(building.parsed.map((a) => a.address))
    const main = building.parsed.find((a) => a.address === address)!
    const name = mostCommon(building.parsed.map((a) => a.name))
    const rooms = [...building.rooms.entries()]
      .sort(([a], [b]) => Number(a === "") - Number(b === "") || collator.compare(a, b))
      .map(([, room]) => ({ label: room.label, people: [...room.people].sort(byName) }))
    return {
      key,
      title: name || [main.town, main.banchi].filter(Boolean).join(" ") || address,
      address,
      count: building.parsed.length,
      rooms,
    }
  })
  buildings.sort((a, b) => b.count - a.count || collator.compare(a.address, b.address))

  return { buildings, noAddress: [...noAddress].sort(byName), residentCount: withAddress.length }
}
