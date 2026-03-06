import { NextRequest, NextResponse } from "next/server"
import { createClient } from "@/lib/supabase/server"
import { createAdminClient } from "@/lib/supabase/client"

export async function POST(
  request: NextRequest,
  { params }: { params: { tenantId: string } }
) {
  try {
    const supabase = await createClient()
    const { data: { user }, error: authError } = await supabase.auth.getUser()

    if (authError || !user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
    }

    // Check permission: admin or owner only
    const { data: membership } = await supabase
      .from("user_tenants")
      .select("role")
      .eq("tenant_id", params.tenantId)
      .eq("user_id", user.id)
      .eq("status", "active")
      .single()

    if (!membership || !["owner", "admin"].includes(membership.role)) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 })
    }

    const body = await request.json()
    const { defaultRole = "member", expiresInDays } = body

    if (!["admin", "member", "guest"].includes(defaultRole)) {
      return NextResponse.json({ error: "Invalid role" }, { status: 400 })
    }

    const expiresAt = expiresInDays
      ? new Date(Date.now() + expiresInDays * 24 * 60 * 60 * 1000).toISOString()
      : null

    const adminSupabase = createAdminClient()
    const { data: link, error: insertError } = await adminSupabase
      .from("tenant_invite_links")
      .insert({
        tenant_id: params.tenantId,
        default_role: defaultRole,
        expires_at: expiresAt,
        is_active: true,
        created_by: user.id,
      })
      .select("id, token")
      .single()

    if (insertError || !link) {
      console.error("Error creating invite link:", insertError)
      return NextResponse.json({ error: "Failed to create invite link" }, { status: 500 })
    }

    const baseUrl = process.env.NEXT_PUBLIC_APP_URL || request.nextUrl.origin
    const inviteUrl = `${baseUrl}/invite/${link.token}`

    return NextResponse.json({ success: true, url: inviteUrl, token: link.token })
  } catch (error) {
    console.error("Error in invite-links POST:", error)
    return NextResponse.json({ error: "Internal server error" }, { status: 500 })
  }
}
