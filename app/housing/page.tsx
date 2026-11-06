"use client"

import { useEffect, useMemo, useState } from "react"
import Link from "next/link"
import { Building2, MapPin } from "lucide-react"
import { Badge } from "@/components/ui/badge"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { filterHousingPeople, getHousingCompanies, getHousingTenants, groupHousing, selectHousingPeople } from "@/lib/housing"
import type { Person } from "@/lib/models"
import { getPeople } from "@/lib/supabase/people"

function PersonRow({ person }: { person: Person }) {
  return (
    <li className="flex flex-wrap items-center gap-x-2 gap-y-1 py-1 text-sm">
      <Link href={`/people/${encodeURIComponent(person.id)}`} className="font-medium text-primary hover:underline">
        {person.name}
      </Link>
      {person.workingStatus === "入社待ち" && <Badge variant="secondary">入社待ち</Badge>}
      {person.company && <span className="text-muted-foreground">{person.company}</span>}
    </li>
  )
}

export default function HousingPage() {
  const [people, setPeople] = useState<Person[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(false)
  const [tenantName, setTenantName] = useState<string | null>(null)
  const [company, setCompany] = useState<string | null>(null)

  useEffect(() => {
    let cancelled = false
    getPeople()
      .then((result) => {
        if (!cancelled) setPeople(result)
      })
      .catch(() => {
        if (!cancelled) setError(true)
      })
      .finally(() => {
        if (!cancelled) setLoading(false)
      })
    return () => { cancelled = true }
  }, [])

  const targetPeople = useMemo(() => selectHousingPeople(people), [people])
  const tenants = useMemo(() => getHousingTenants(targetPeople), [targetPeople])
  const companies = useMemo(() => getHousingCompanies(targetPeople, tenantName), [targetPeople, tenantName])
  const selectedPeople = useMemo(() => filterHousingPeople(targetPeople, tenantName, company), [targetPeople, tenantName, company])
  const housing = useMemo(() => groupHousing(selectedPeople), [selectedPeople])

  const onTenantChange = (value: string) => {
    const nextTenant = value === "all" ? null : JSON.parse(value) as string
    if (company !== null && !getHousingCompanies(targetPeople, nextTenant).includes(company)) setCompany(null)
    setTenantName(nextTenant)
  }

  return (
    <main className="space-y-6 p-6">
      <div>
        <h1 className="text-3xl font-bold text-foreground">住まい</h1>
        <p className="mt-2 text-muted-foreground">在籍中・入社待ちの人材を建物と部屋ごとに表示します。</p>
      </div>

      {!loading && !error && (
        <div className="flex flex-wrap gap-3">
          <div className="flex flex-col gap-1">
            <label htmlFor="housing-tenant" className="text-sm font-medium">会社</label>
            <select id="housing-tenant" value={tenantName === null ? "all" : JSON.stringify(tenantName)} onChange={(event) => onTenantChange(event.target.value)} className="h-9 min-w-40 rounded-md border border-input bg-background px-3 text-sm">
              <option value="all">すべて</option>
              {tenants.map((tenant) => <option key={tenant} value={JSON.stringify(tenant)}>{tenant || "未入力"}</option>)}
            </select>
          </div>
          <div className="flex flex-col gap-1">
            <label htmlFor="housing-company" className="text-sm font-medium">所属先</label>
            <select id="housing-company" value={company === null ? "all" : JSON.stringify(company)} onChange={(event) => setCompany(event.target.value === "all" ? null : JSON.parse(event.target.value) as string)} className="h-9 min-w-40 rounded-md border border-input bg-background px-3 text-sm">
              <option value="all">すべて</option>
              {companies.map((item) => <option key={item} value={JSON.stringify(item)}>{item || "未入力"}</option>)}
            </select>
          </div>
        </div>
      )}

      {loading ? (
        <p role="status" className="text-muted-foreground">住まいを読み込んでいます…</p>
      ) : error ? (
        <p role="alert" className="text-destructive">住まいの情報を取得できませんでした。ページを再読み込みしてください。</p>
      ) : (
        <>
          <div className="grid gap-4 sm:grid-cols-3">
            {[
              ["建物数", housing.buildings.length],
              ["住所あり人数", housing.residentCount],
              ["住所なし人数", housing.noAddress.length],
            ].map(([label, value]) => (
              <Card key={label}>
                <CardContent className="pt-6">
                  <p className="text-sm text-muted-foreground">{label}</p>
                  <p className="mt-1 text-2xl font-semibold">{value}</p>
                </CardContent>
              </Card>
            ))}
          </div>

          {selectedPeople.length === 0 ? (
            <p className="text-muted-foreground">{targetPeople.length === 0 ? "表示対象の人材はいません。" : "条件に合う人材はいません。"}</p>
          ) : <div className="grid gap-4 lg:grid-cols-2 2xl:grid-cols-3">
            {housing.buildings.map((building) => (
              <Card key={building.key}>
                <CardHeader className="space-y-2">
                  <CardTitle className="flex items-center gap-2 text-lg">
                    <Building2 className="h-5 w-5 shrink-0 text-primary" aria-hidden="true" />
                    <span className="min-w-0 break-words">{building.title}</span>
                    <Badge variant="secondary" className="ml-auto shrink-0">{building.count}人</Badge>
                  </CardTitle>
                  <div className="flex flex-wrap items-center justify-between gap-2 text-sm text-muted-foreground">
                    <span className="break-all">{building.address}</span>
                    <a
                      href={`https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(building.address)}`}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="inline-flex shrink-0 items-center gap-1 text-primary hover:underline"
                    >
                      <MapPin className="h-4 w-4" aria-hidden="true" />地図
                    </a>
                  </div>
                </CardHeader>
                <CardContent className="space-y-4">
                  {building.rooms.map((room) => (
                    <section key={room.label} className="border-t pt-3">
                      <h3 className="text-sm font-semibold">{room.label}</h3>
                      <ul className="mt-1">{room.people.map((person) => <PersonRow key={person.id} person={person} />)}</ul>
                    </section>
                  ))}
                </CardContent>
              </Card>
            ))}

            {housing.noAddress.length > 0 && (
              <Card>
                <CardHeader><CardTitle className="text-lg">住所の登録なし</CardTitle></CardHeader>
                <CardContent><ul>{housing.noAddress.map((person) => <PersonRow key={person.id} person={person} />)}</ul></CardContent>
              </Card>
            )}
          </div>}
        </>
      )}
    </main>
  )
}
