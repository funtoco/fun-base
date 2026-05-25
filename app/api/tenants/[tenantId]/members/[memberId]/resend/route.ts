import { NextRequest, NextResponse } from "next/server"
import { createAdminClient } from "@/lib/supabase/client"
import { createClient } from "@/lib/supabase/server"
import {
  canManageCompanyContacts,
  canManageTenant,
  isCompanyContactEmail,
  isCompanyContactRole,
} from "@/lib/tenant-access"

export async function POST(
  _request: NextRequest,
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
    const canManageCompanyContactInvite = canManageCompanyContacts(
      memberships,
      user.email
    )

    if (!canManageAllMembers && !canManageCompanyContactInvite) {
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

    if (
      !canManageAllMembers &&
      (!isCompanyContactEmail(targetMember.email) || !isCompanyContactRole(targetMember.role))
    ) {
      return NextResponse.json(
        { error: "You can only resend invitations for company contacts" },
        { status: 403 }
      )
    }

    const adminSupabase = createAdminClient()
    const { error } = await adminSupabase.auth.admin.inviteUserByEmail(targetMember.email, {
      redirectTo: `${process.env.NEXT_PUBLIC_APP_URL || "http://localhost:3000"}/auth/set-password`,
    })

    if (error) {
      console.error("Error resending invitation:", error)
      return NextResponse.json(
        { error: error.message || "Failed to resend invitation" },
        { status: 500 }
      )
    }

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
