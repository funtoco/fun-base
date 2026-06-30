import { NextRequest, NextResponse } from "next/server"
import { createClient } from "@/lib/supabase/server"
import {
  canManageTenant,
  getTenantMemberRemovalError,
  getTenantMemberRoleUpdateError,
  TENANT_MANAGEABLE_ROLES,
  TENANT_FEATURE_PERMISSION_KEYS,
  type TenantFeaturePermissions,
} from "@/lib/tenant-access"

type ManageableRole = (typeof TENANT_MANAGEABLE_ROLES)[number]

function normalizeOfficeIds(value: unknown): string[] | null {
  if (typeof value === "undefined") {
    return null
  }

  if (!Array.isArray(value)) {
    return null
  }

  const normalizedIds = value
    .filter((id): id is string => typeof id === "string")
    .map((id) => id.trim())
    .filter(Boolean)

  return Array.from(new Set(normalizedIds))
}

function normalizeFeaturePermissions(value: unknown): TenantFeaturePermissions | null {
  if (typeof value === "undefined") {
    return null
  }

  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return null
  }

  const input = value as Record<string, unknown>
  const permissions: TenantFeaturePermissions = {}

  for (const key of TENANT_FEATURE_PERMISSION_KEYS) {
    const permissionValue = input[key]
    if (typeof permissionValue === "boolean") {
      permissions[key] = permissionValue
    }
  }

  return permissions
}

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
    const officeIds = normalizeOfficeIds(body.officeIds)
    const featurePermissions = normalizeFeaturePermissions(body.featurePermissions)
    const hasRoleUpdate = typeof role !== "undefined"
    const hasOfficeUpdate = typeof body.officeIds !== "undefined"
    const hasFeaturePermissionsUpdate = typeof body.featurePermissions !== "undefined"

    if (!hasRoleUpdate && !hasOfficeUpdate && !hasFeaturePermissionsUpdate) {
      return NextResponse.json(
        { error: "Role, officeIds, or featurePermissions is required" },
        { status: 400 }
      )
    }

    if (hasRoleUpdate && (typeof role !== "string" || !TENANT_MANAGEABLE_ROLES.includes(role as ManageableRole))) {
      return NextResponse.json(
        { error: "Invalid role" },
        { status: 400 }
      )
    }

    if (hasOfficeUpdate && officeIds === null) {
      return NextResponse.json(
        { error: "Invalid officeIds" },
        { status: 400 }
      )
    }

    if (hasFeaturePermissionsUpdate && featurePermissions === null) {
      return NextResponse.json(
        { error: "Invalid featurePermissions" },
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

    const memberships = actorMemberships || []
    let activeOwnerCount = 0
    if (hasRoleUpdate && targetMember.role === "owner" && role !== "owner") {
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

    if (hasRoleUpdate) {
      const permissionError = getTenantMemberRoleUpdateError({
        currentUserId: user.id,
        targetUserId: targetMember.user_id,
        targetRole: targetMember.role,
        actorMemberships: memberships,
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
    }

    if (hasOfficeUpdate && !canManageTenant(memberships)) {
      return NextResponse.json(
        { error: "所属先を変更する権限がありません" },
        { status: 403 }
      )
    }

    if (hasFeaturePermissionsUpdate && !canManageTenant(memberships)) {
      return NextResponse.json(
        { error: "機能権限を変更する権限がありません" },
        { status: 403 }
      )
    }

    if (hasRoleUpdate) {
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
    }

    if (hasFeaturePermissionsUpdate) {
      const { error: updateError } = await supabase
        .from("user_tenants")
        .update({ feature_permissions: featurePermissions })
        .eq("id", params.memberId)
        .eq("tenant_id", params.tenantId)

      if (updateError) {
        console.error("Error updating feature permissions:", updateError)
        return NextResponse.json(
          { error: "Failed to update feature permissions" },
          { status: 500 }
        )
      }
    }

    if (hasOfficeUpdate) {
      const nextOfficeIds = officeIds || []

      if (nextOfficeIds.length > 0) {
        const { data: offices, error: officesError } = await supabase
          .from("tenant_offices")
          .select("id")
          .eq("tenant_id", params.tenantId)
          .eq("is_active", true)
          .in("id", nextOfficeIds)

        if (officesError) {
          console.error("Error verifying member offices:", officesError)
          return NextResponse.json(
            { error: "Failed to verify affiliations" },
            { status: 500 }
          )
        }

        if ((offices || []).length !== nextOfficeIds.length) {
          return NextResponse.json(
            { error: "Invalid officeIds" },
            { status: 400 }
          )
        }
      }

      const { error: deleteOfficeError } = await supabase
        .from("user_tenant_offices")
        .delete()
        .eq("tenant_id", params.tenantId)
        .eq("user_tenant_id", params.memberId)

      if (deleteOfficeError) {
        console.error("Error deleting member office assignments:", deleteOfficeError)
        return NextResponse.json(
          { error: "Failed to update member affiliations" },
          { status: 500 }
        )
      }

      if (nextOfficeIds.length > 0) {
        const { error: insertOfficeError } = await supabase
          .from("user_tenant_offices")
          .insert(nextOfficeIds.map((officeId) => ({
            tenant_id: params.tenantId,
            user_tenant_id: params.memberId,
            tenant_office_id: officeId,
          })))

        if (insertOfficeError) {
          console.error("Error inserting member office assignments:", insertOfficeError)
          return NextResponse.json(
            { error: "Failed to update member affiliations" },
            { status: 500 }
          )
        }
      }
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
      .select("id, user_id, role, email")
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

    const memberships = actorMemberships || []
    const canManageAllMembers = canManageTenant(memberships)

    if (!canManageAllMembers) {
      return NextResponse.json(
        { error: "メンバーを削除する権限がありません" },
        { status: 403 }
      )
    }

    const permissionError = getTenantMemberRemovalError({
      currentUserId: user.id,
      targetUserId: targetMember.user_id,
      targetRole: targetMember.role,
      actorMemberships: memberships,
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
