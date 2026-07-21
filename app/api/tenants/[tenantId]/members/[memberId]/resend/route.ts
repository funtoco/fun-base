import { NextRequest, NextResponse } from "next/server"
import { createAdminClient } from "@/lib/supabase/client"
import { sendEmail } from "@/lib/notifications/email"
import { getInviteRedirectUrl } from "@/lib/supabase/invite-redirect"
import { buildTenantInvitationEmail, buildTenantInviteUrl } from "@/lib/tenant-invitation-email"
import { createClient } from "@/lib/supabase/server"
import { canManageTenant, TENANT_INVITABLE_ROLES } from "@/lib/tenant-access"

const INVITABLE_ROLES = new Set(TENANT_INVITABLE_ROLES)

export async function POST(
  request: NextRequest,
  { params }: { params: { tenantId: string; memberId: string } }
) {
  try {
    const supabase = await createClient()
    const {
      data: { user },
      error: authError,
    } = await supabase.auth.getUser()

    if (authError || !user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
    }

    const { data: targetMember, error: targetMemberError } = await supabase
      .from("user_tenants")
      .select("id, email, role, status")
      .eq("id", params.memberId)
      .eq("tenant_id", params.tenantId)
      .single()

    if (targetMemberError || !targetMember) {
      console.error("Error fetching target member for resend:", targetMemberError)
      return NextResponse.json({ error: "Member not found" }, { status: 404 })
    }

    const { data: actorMemberships, error: actorMembershipsError } = await supabase
      .from("user_tenants")
      .select("role")
      .eq("tenant_id", params.tenantId)
      .eq("user_id", user.id)
      .eq("status", "active")

    if (actorMembershipsError) {
      console.error("Error fetching actor memberships for resend:", actorMembershipsError)
      return NextResponse.json(
        { error: "Failed to verify membership" },
        { status: 500 }
      )
    }

    const memberships = actorMemberships || []
    const canManageAllMembers = canManageTenant(memberships)

    if (!canManageAllMembers) {
      return NextResponse.json(
        { error: "You don't have permission to resend invitations" },
        { status: 403 }
      )
    }

    if (targetMember.status !== "pending") {
      return NextResponse.json(
        { error: "Only pending invitations can be resent" },
        { status: 400 }
      )
    }

    if (!targetMember.email) {
      return NextResponse.json(
        { error: "Invitation email is missing" },
        { status: 400 }
      )
    }

    const adminSupabase = createAdminClient()
    const { data: tenant, error: tenantError } = await adminSupabase
      .from("tenants")
      .select("name")
      .eq("id", params.tenantId)
      .single()

    if (tenantError || !tenant) {
      console.error("Error fetching tenant for resend:", tenantError)
      return NextResponse.json({ error: "Failed to fetch tenant" }, { status: 500 })
    }

    const inviteLinkDefaultRole = INVITABLE_ROLES.has(targetMember.role as any)
      ? targetMember.role
      : "member"

    const { data: link, error: inviteLinkError } = await adminSupabase
      .from("tenant_invite_links")
      .insert({
        tenant_id: params.tenantId,
        // Targeted email invites activate target_user_tenant_id, so default_role is
        // only a schema-compatible fallback for the invite-link row.
        default_role: inviteLinkDefaultRole,
        is_active: true,
        created_by: user.id,
        target_user_tenant_id: targetMember.id,
      })
      .select("token")
      .single()

    if (inviteLinkError || !link) {
      console.error("Error creating reusable resend invite link:", inviteLinkError)
      return NextResponse.json({ error: "Failed to create invite link" }, { status: 500 })
    }

    const baseUrl = getInviteRedirectUrl({ requestOrigin: request.nextUrl.origin })
    const inviteUrl = buildTenantInviteUrl(baseUrl, link.token)
    const emailMessage = buildTenantInvitationEmail({
      tenantName: tenant.name ?? "FunBase",
      inviteUrl,
    })

    await sendEmail({
      to: targetMember.email,
      ...emailMessage,
    })

    return NextResponse.json({
      success: true,
      message: "Invitation resent successfully",
    })
  } catch (error) {
    console.error("Error resending invitation:", error)
    return NextResponse.json(
      { error: "Failed to resend invitation" },
      { status: 500 }
    )
  }
}
