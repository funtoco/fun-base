import { NextRequest, NextResponse } from "next/server"
import { createClient } from "@/lib/supabase/server"
import { createAdminClient } from "@/lib/supabase/client"

interface TenantOfficeRecord {
  id: string
  tenant_id: string
  name: string
  slug?: string | null
  address?: string | null
  is_active: boolean
  created_at: string
  updated_at: string
}

function officeKey(name: string) {
  return name.trim().toLocaleLowerCase("ja-JP")
}

function uniqueAffiliationNames(rows: Array<{ company: string | null }>) {
  const namesByKey = new Map<string, string>()

  for (const row of rows) {
    const name = row.company?.trim()
    if (!name) {
      continue
    }

    const key = officeKey(name)
    if (!namesByKey.has(key)) {
      namesByKey.set(key, name)
    }
  }

  return Array.from(namesByKey.values()).sort((a, b) =>
    a.localeCompare(b, "ja-JP")
  )
}

export async function GET(
  _request: NextRequest,
  { params }: { params: { tenantId: string } }
) {
  try {
    const supabase = await createClient()
    const { data: { user }, error: authError } = await supabase.auth.getUser()

    if (authError || !user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
    }

    const { data: memberships, error: membershipError } = await supabase
      .from("user_tenants")
      .select("id")
      .eq("tenant_id", params.tenantId)
      .eq("user_id", user.id)
      .eq("status", "active")
      .limit(1)

    if (membershipError) {
      console.error("Error verifying tenant membership:", membershipError)
      return NextResponse.json(
        { error: "Failed to verify membership" },
        { status: 500 }
      )
    }

    if (!memberships || memberships.length === 0) {
      return NextResponse.json(
        { error: "Tenant membership is required" },
        { status: 403 }
      )
    }

    const adminSupabase = createAdminClient()
    const { data: people, error: peopleError } = await adminSupabase
      .from("people")
      .select("company")
      .eq("tenant_id", params.tenantId)

    if (peopleError) {
      console.error("Error fetching tenant affiliations:", peopleError)
      return NextResponse.json(
        { error: "Failed to fetch affiliations" },
        { status: 500 }
      )
    }

    const affiliationNames = uniqueAffiliationNames(people || [])
    if (affiliationNames.length === 0) {
      return NextResponse.json({ offices: [] })
    }

    const affiliationKeys = new Set(affiliationNames.map(officeKey))
    const { data: existingOffices, error: existingOfficesError } = await adminSupabase
      .from("tenant_offices")
      .select("id, tenant_id, name, slug, address, is_active, created_at, updated_at")
      .eq("tenant_id", params.tenantId)

    if (existingOfficesError) {
      console.error("Error fetching affiliation scopes:", existingOfficesError)
      return NextResponse.json(
        { error: "Failed to fetch affiliations" },
        { status: 500 }
      )
    }

    const existingByKey = new Map<string, TenantOfficeRecord>()
    for (const office of existingOffices || []) {
      existingByKey.set(officeKey(office.name), office)
    }

    const inactiveMatchingOfficeIds = (existingOffices || [])
      .filter((office) => affiliationKeys.has(officeKey(office.name)) && !office.is_active)
      .map((office) => office.id)

    if (inactiveMatchingOfficeIds.length > 0) {
      const { error: reactivateError } = await adminSupabase
        .from("tenant_offices")
        .update({ is_active: true })
        .eq("tenant_id", params.tenantId)
        .in("id", inactiveMatchingOfficeIds)

      if (reactivateError) {
        console.error("Error reactivating affiliation scopes:", reactivateError)
        return NextResponse.json(
          { error: "Failed to update affiliations" },
          { status: 500 }
        )
      }
    }

    for (const name of affiliationNames) {
      if (existingByKey.has(officeKey(name))) {
        continue
      }

      const { error: insertError } = await adminSupabase
        .from("tenant_offices")
        .insert({
          tenant_id: params.tenantId,
          name,
          metadata: {
            source: "people.company",
          },
        })

      if (insertError && insertError.code !== "23505") {
        console.error("Error creating affiliation scope:", insertError)
        return NextResponse.json(
          { error: "Failed to update affiliations" },
          { status: 500 }
        )
      }
    }

    const { data: offices, error: officesError } = await adminSupabase
      .from("tenant_offices")
      .select("id, tenant_id, name, slug, address, is_active, created_at, updated_at")
      .eq("tenant_id", params.tenantId)
      .eq("is_active", true)

    if (officesError) {
      console.error("Error fetching affiliation scopes:", officesError)
      return NextResponse.json(
        { error: "Failed to fetch affiliations" },
        { status: 500 }
      )
    }

    const syncedOffices = (offices || [])
      .filter((office) => affiliationKeys.has(officeKey(office.name)))
      .sort((a, b) => a.name.localeCompare(b.name, "ja-JP"))

    return NextResponse.json({ offices: syncedOffices })
  } catch (error) {
    console.error("Error fetching tenant affiliations:", error)
    return NextResponse.json(
      { error: "Failed to fetch affiliations" },
      { status: 500 }
    )
  }
}
