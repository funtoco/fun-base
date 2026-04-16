import { NextRequest, NextResponse } from "next/server"
import { createClient } from "@/lib/supabase/server"
import {
  getTenantMemberRemovalError,
  getTenantMemberRoleUpdateError,
} from "@/lib/tenant-access"

const MANAGEABLE_ROLES = ["owner", "admin", "member", "guest"] as const
type ManageableRole = (typeof MANAGEABLE_ROLES)[number]

export async function PATCH(
  request: NextRequest,
  { params }: { params: { tenantId: string; memberId: string } }
) {
  try {
    const supabase = await createClient()
    const { data: { user }, error: authError } = await supabase.auth.getUser()

    if (authError || !user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
    }

    const body = await request.json()
    const { role } = body

    if (!role) {
      return NextResponse.json(
        { error: "Role is required" },
        { status: 400 }
      )
    }

    if (!MANAGEABLE_ROLES.includes(role)) {
      return NextResponse.json(
        { error: "Invalid role" },
        { status: 400 }
      )
    }

    const { data: targetMember, error: targetMemberError } = await supabase
      .from("user_tenants")
      .select("id, user_id, role")
      .eq("id", params.memberId)
      .eq("tenant_id", params.tenantId)
      .single()

    if (targetMemberError || !targetMember) {
      console.error("Error fetching target member:", targetMemberError)
      return NextResponse.json(
        { error: "Member not found" },
        { status: 404 }
      )
    }

    const { data: actorMemberships, error: actorMembershipsError } = await supabase
      .from("user_tenants")
      .select("role")
      .eq("tenant_id", params.tenantId)
      .eq("user_id", user.id)
      .eq("status", "active")

    if (actorMembershipsError) {
      console.error("Error fetching actor memberships:", actorMembershipsError)
      return NextResponse.json(
        { error: "Failed to verify membership" },
        { status: 500 }
      )
    }

    let activeOwnerCount = 0
    if (targetMember.role === "owner" && role !== "owner") {
      const { count, error: ownerCountError } = await supabase
        .from("user_tenants")
        .select("id", { count: "exact", head: true })
        .eq("tenant_id", params.tenantId)
        .eq("role", "owner")
        .eq("status", "active")

      if (ownerCountError) {
        console.error("Error counting active owners:", ownerCountError)
        return NextResponse.json(
          { error: "Failed to verify owner count" },
          { status: 500 }
        )
      }

      activeOwnerCount = count ?? 0
    }

    const permissionError = getTenantMemberRoleUpdateError({
      currentUserId: user.id,
      targetUserId: targetMember.user_id,
      targetRole: targetMember.role,
      actorMemberships: actorMemberships || [],
      nextRole: role as ManageableRole,
      activeOwnerCount,
    })

    if (permissionError) {
      const status =
        permissionError === "ロールを変更する権限がありません" ||
        permissionError === "オーナーのロールは変更できません"
          ? 403
          : 400

      return NextResponse.json({ error: permissionError }, { status })
    }

    const { error: updateError } = await supabase
      .from("user_tenants")
      .update({ role: role as ManageableRole })
      .eq("id", params.memberId)
      .eq("tenant_id", params.tenantId)

    if (updateError) {
      console.error("Error updating member role:", updateError)
      return NextResponse.json(
        { error: "Failed to update member role" },
        { status: 500 }
      )
    }

    return NextResponse.json({ success: true })
  } catch (error) {
    console.error("Error updating member role:", error)
    return NextResponse.json(
      { error: "Failed to update member role" },
      { status: 500 }
    )
  }
}

export async function DELETE(
  request: NextRequest,
  { params }: { params: { tenantId: string; memberId: string } }
) {
  try {
    const supabase = await createClient()
    const { data: { user }, error: authError } = await supabase.auth.getUser()

    if (authError || !user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
    }

    const { data: targetMember, error: targetMemberError } = await supabase
      .from("user_tenants")
      .select("id, user_id, role")
      .eq("id", params.memberId)
      .eq("tenant_id", params.tenantId)
      .single()

    if (targetMemberError || !targetMember) {
      console.error("Error fetching target member:", targetMemberError)
      return NextResponse.json(
        { error: "Member not found" },
        { status: 404 }
      )
    }

    const { data: actorMemberships, error: actorMembershipsError } = await supabase
      .from("user_tenants")
      .select("role")
      .eq("tenant_id", params.tenantId)
      .eq("user_id", user.id)
      .eq("status", "active")

    if (actorMembershipsError) {
      console.error("Error fetching actor memberships:", actorMembershipsError)
      return NextResponse.json(
        { error: "Failed to verify membership" },
        { status: 500 }
      )
    }

    const permissionError = getTenantMemberRemovalError({
      currentUserId: user.id,
      targetUserId: targetMember.user_id,
      targetRole: targetMember.role,
      actorMemberships: actorMemberships || [],
    })

    if (permissionError) {
      const status = permissionError === "メンバーを削除する権限がありません" ? 403 : 400
      return NextResponse.json({ error: permissionError }, { status })
    }

    const { error: deleteError } = await supabase
      .from("user_tenants")
      .delete()
      .eq("id", params.memberId)
      .eq("tenant_id", params.tenantId)

    if (deleteError) {
      console.error("Error removing member:", deleteError)
      return NextResponse.json(
        { error: "Failed to remove member" },
        { status: 500 }
      )
    }

    return NextResponse.json({ success: true })
  } catch (error) {
    console.error("Error removing member:", error)
    return NextResponse.json(
      { error: "Failed to remove member" },
      { status: 500 }
    )
  }
}
