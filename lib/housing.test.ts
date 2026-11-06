import { describe, expect, test } from "vitest"
import { normalize, parseAddress } from "./address"
import { filterHousingPeople, getHousingCompanies, getHousingTenants, groupHousing, selectHousingPeople } from "./housing"

const address = (street: string) => parseAddress({ pref: "大阪府", city: "豊中市", town: "豊南町西", street })
const person = (id: string, full: string, workingStatus = "在籍中") => ({ id, name: `人材${id}`, address: full, workingStatus, company: "坂本病院" })

describe("住所の解析", () => {
  test("全角数字・ハイフン・漢数字の丁目を正規化する", () => {
    expect(normalize("四丁目 ３−５−３０　" )).toBe("4丁目 3-5-30")
    expect(address("4丁目1-17 ル号期2階北側")).toMatchObject({ banchi: "4-1-17", name: "ル号期", room: "2階北側" })
  })

  test("番地・建物名・部屋を分け、住所の一項目入力も同じ建物にする", () => {
    const split = address("3-5-30アムザ301号")
    const full = parseAddress({ full: "大阪府豊中市豊南町西3-5-30アムザ301号" })
    expect(split).toMatchObject({ banchi: "3-5-30", name: "アムザ", room: "301号" })
    expect(full.key).toBe(split.key)
    expect(full.roomKey).toBe(split.roomKey)
  })

  test("三つ目の数字が101以上なら部屋として扱う", () => {
    expect(address("2-37-306")).toMatchObject({ banchi: "2-37", room: "306" })
    expect(address("2-3-15")).toMatchObject({ banchi: "2-3-15", room: "" })
  })

  test("番地表記の3つ目が101以上でも部屋にしない", () => {
    expect(address("3丁目5番123号")).toMatchObject({ banchi: "3-5-123", room: "" })
    const grouped = groupHousing([
      person("1", "大阪府豊中市豊南町西3丁目5番123号"),
      person("2", "大阪府豊中市豊南町西3丁目5番124号"),
    ])
    expect(grouped.buildings).toHaveLength(2)
  })

  test("部屋の表記ゆれを同じキーにし、棟・号館違いを別建物にする", () => {
    expect(address("3-6-25 メゾン 206号室").roomKey).toBe(address("3-6-25 メゾン206号").roomKey)
    expect(address("3-6-25 メゾン #301").roomKey).toBe(address("3-6-25 メゾン301号室").roomKey)
    expect(address("1830-50 マンション104棟 201号室").key).not.toBe(address("1830-50 マンション105棟 201号室").key)
    expect(address("1-2-3 マンション1号館 201号室").key).not.toBe(address("1-2-3 マンション2号館 201号室").key)
  })

  test("郵便番号を除いて番地・建物・部屋を解析する", () => {
    const parsed = parseAddress({ full: "〒561-0816 大阪府豊中市豊南町西3-5-30アムザ301号" })
    expect(parsed).toMatchObject({
      banchi: "3-5-30",
      name: "アムザ",
      room: "301号",
      address: "大阪府豊中市豊南町西3-5-30",
    })
  })

  test("番地がない住所や未定などの仮入力は登録なしとして扱う", () => {
    expect(parseAddress({ full: "大阪府豊中市豊南町西" }).key).toBe("")
    expect(parseAddress({ full: "" }).key).toBe("")
    expect(parseAddress({ pref: "大阪府", city: "豊中市", town: "豊南町西", street: "未定" }).key).toBe("")
  })
})

describe("住まいのグルーピング", () => {
  test("対象の在籍中と入社待ちだけを選ぶ", () => {
    const people = [person("1", "大阪府豊中市豊南町西4-6-3"), person("2", "", "入社待ち"), person("3", "", "退職済み")]
    expect(selectHousingPeople(people).map((p) => p.id)).toEqual(["1", "2"])
  })

  test("建物を人数順に並べ、部屋ごとに人をまとめる", () => {
    const grouped = groupHousing([
      person("1", "大阪府豊中市豊南町西4-6-3 1階西側"),
      person("2", "大阪府豊中市豊南町西4-6-3 1階西側"),
      person("3", "大阪府豊中市豊南町西4-6-3 2階東側"),
      person("4", "大阪府豊中市豊南町西4-13-22 豊南ハイツ305号"),
    ])
    expect(grouped.buildings.map((b) => b.count)).toEqual([3, 1])
    expect(grouped.buildings[0].rooms.map((r) => [r.label, r.people.length])).toEqual([["1階西側", 2], ["2階東側", 1]])
    expect(grouped.residentCount).toBe(4)
  })

  test("同じ建物名なら番地の表記違いを統合し、部屋なしは最後に置く", () => {
    const grouped = groupHousing([
      person("1", "奈良県北葛城郡上牧町中筋出作15-2 ロイヤルガーデン上牧A301号室"),
      person("2", "奈良県北葛城郡上牧町中筋出作15 ロイヤルガーデン上牧B303"),
      person("3", "奈良県北葛城郡上牧町中筋出作15 ロイヤルガーデン上牧"),
    ])
    expect(grouped.buildings).toHaveLength(1)
    expect(grouped.buildings[0].rooms.map((r) => r.label)).toEqual(["A301号室", "B303", "部屋の記入なし"])
  })

  test("同じ建物名でも異なる番地は統合しない", () => {
    const grouped = groupHousing([
      person("1", "大阪府豊中市豊南町西1-2-3 サンハイツ101号室"),
      person("2", "大阪府豊中市豊南町西1-4-5 サンハイツ102号室"),
    ])
    expect(grouped.buildings).toHaveLength(2)
  })

  test("番地不明の人を住所なしに分ける", () => {
    const grouped = groupHousing([person("1", "大阪府豊中市豊南町西"), person("2", "大阪府豊中市豊南町西4-6-3")])
    expect(grouped.noAddress.map((p) => p.id)).toEqual(["1"])
    expect(grouped.residentCount).toBe(1)
  })

  test("対象者がいないとき空の概要を返す", () => {
    expect(groupHousing([])).toEqual({ buildings: [], noAddress: [], residentCount: 0 })
  })
})

describe("住まいの会社・所属先フィルター", () => {
  const people = [
    { ...person("1", "大阪府豊中市豊南町西4-6-3"), tenantName: "A社", company: "共通事業所" },
    { ...person("2", ""), tenantName: "A社", company: "" },
    { ...person("3", "大阪府豊中市豊南町西4-13-22"), tenantName: "B社", company: "共通事業所", workingStatus: "入社待ち" },
    { ...person("4", ""), tenantName: "B社", company: "B事業所" },
    { ...person("5", ""), tenantName: "", company: "" },
    { ...person("6", ""), tenantName: "A社", company: "退職先", workingStatus: "退職" },
  ]
  const targets = selectHousingPeople(people)

  test("対象者だけから空欄を含む会社候補を作る", () => {
    expect(getHousingTenants(targets)).toEqual(["", "A社", "B社"])
  })

  test("会社に応じた所属先候補を重複なく作り、空欄と同名所属先を扱う", () => {
    expect(getHousingCompanies(targets, null)).toEqual(["", "B事業所", "共通事業所"])
    expect(getHousingCompanies(targets, "A社")).toEqual(["", "共通事業所"])
    expect(getHousingCompanies(targets, "B社")).toEqual(["B事業所", "共通事業所"])
    expect(getHousingCompanies(targets, "")).toEqual([""])
  })

  test("会社と所属先の選択後に建物・人数・住所なしが連動する", () => {
    const selected = filterHousingPeople(targets, "A社", "共通事業所")
    expect(selected.map((p) => p.id)).toEqual(["1"])
    expect(groupHousing(selected)).toMatchObject({ residentCount: 1, noAddress: [] })
    expect(groupHousing(selected).buildings).toHaveLength(1)
    expect(groupHousing(filterHousingPeople(targets, "A社", "")).noAddress.map((p) => p.id)).toEqual(["2"])
    expect(filterHousingPeople(targets, null, null)).toHaveLength(5)
    expect(filterHousingPeople(targets, "存在しない会社", null)).toEqual([])
  })
})
