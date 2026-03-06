import { NextRequest, NextResponse } from "next/server"
import { createClient } from "@/lib/supabase/server"
import { getInviteLinkInfo, acceptTenantInvitation } from "@/lib/supabase/tenants"

// GET: public endpoint - returns invite link info (tenant name, role) without auth
export async function GET(
  _request: NextRequest,
  { params }: { params: { token: string } }
) {
  const result = await getInviteLinkInfo(params.token)

  if (!result.success || !result.info) {
    return NextResponse.json({ error: result.error }, { status: 404 })
  }

  if (!result.info.isActive) {
    return NextResponse.json({ error: "この招待リンクは無効化されています" }, { status: 410 })
  }

  if (result.info.isExpired) {
    return NextResponse.json({ error: "この招待リンクは期限切れです" }, { status: 410 })
  }

  return NextResponse.json({
    tenantId: result.info.tenantId,
    tenantName: result.info.tenantName,
    defaultRole: result.info.defaultRole,
  })
}

// POST: authenticated - accept the invitation
export async function POST(
  _request: NextRequest,
  { params }: { params: { token: string } }
) {
  try {
    const supabase = await createClient()
    const { data: { user }, error: authError } = await supabase.auth.getUser()

    if (authError || !user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
    }

    const result = await acceptTenantInvitation(
      params.token,
      user.id,
      user.email ?? ""
    )

    if (!result.success) {
      return NextResponse.json({ error: result.error }, { status: 400 })
    }

    return NextResponse.json({ success: true, tenantId: result.tenantId })
  } catch (error) {
    console.error("Error accepting invitation:", error)
    return NextResponse.json({ error: "Failed to accept invitation" }, { status: 500 })
  }
}
