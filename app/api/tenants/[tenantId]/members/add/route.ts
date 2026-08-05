import { NextRequest, NextResponse } from "next/server"
import { createClient } from "@/lib/supabase/server"
import { createAdminClient } from "@/lib/supabase/client"
import { canManageTenant, TENANT_INVITABLE_ROLES } from "@/lib/tenant-access"

function normalizeOfficeIds(value: unknown): string[] {
  if (!Array.isArray(value)) {
    return []
  }

  return Array.from(
    new Set(
      value
        .filter((id): id is string => typeof id === "string")
        .map((id) => id.trim())
        .filter(Boolean)
    )
  )
}

async function replaceOfficeAssignments(
  adminSupabase: ReturnType<typeof createAdminClient>,
  tenantId: string,
  userTenantId: string,
  officeIds: string[]
): Promise<string | null> {
  const { error: deleteError } = await adminSupabase
    .from("user_tenant_offices")
    .delete()
    .eq("tenant_id", tenantId)
    .eq("user_tenant_id", userTenantId)

  if (deleteError) {
    console.error("Error deleting member office assignments:", deleteError)
    return "Failed to update member affiliations"
  }

  if (officeIds.length === 0) {
    return null
  }

  const { error: insertError } = await adminSupabase
    .from("user_tenant_offices")
    .insert(officeIds.map((officeId) => ({
      tenant_id: tenantId,
      user_tenant_id: userTenantId,
      tenant_office_id: officeId,
    })))

  if (insertError) {
    console.error("Error inserting member office assignments:", insertError)
    return "Failed to update member affiliations"
  }

  return null
}

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

    const body = await request.json()
    const { userId, role } = body
    const officeIds = normalizeOfficeIds(body.officeIds)

    if (!userId || !role) {
      return NextResponse.json(
        { error: "UserId and role are required" },
        { status: 400 }
      )
    }

    if (typeof role !== "string" || !TENANT_INVITABLE_ROLES.includes(role as any)) {
      return NextResponse.json(
        { error: "Invalid role" },
        { status: 400 }
      )
    }

    // Check if user has permission to add members
    const { data: currentUserMemberships, error: currentUserMembershipsError } = await supabase
      .from('user_tenants')
      .select('role')
      .eq('user_id', user.id)
      .eq('tenant_id', params.tenantId)
      .eq('status', 'active')

    if (currentUserMembershipsError) {
      console.error('Error checking current user membership:', currentUserMembershipsError)
      return NextResponse.json(
        { error: "Failed to verify current user membership" },
        { status: 500 }
      )
    }

    if (!currentUserMemberships || !canManageTenant(currentUserMemberships)) {
      return NextResponse.json(
        { error: "You don't have permission to add members" },
        { status: 403 }
      )
    }

    if (officeIds.length > 0) {
      const { data: offices, error: officesError } = await supabase
        .from("tenant_offices")
        .select("id")
        .eq("tenant_id", params.tenantId)
        .eq("is_active", true)
        .in("id", officeIds)

      if (officesError) {
        console.error("Error verifying member offices:", officesError)
        return NextResponse.json(
          { error: "Failed to verify affiliations" },
          { status: 500 }
        )
      }

      if ((offices || []).length !== officeIds.length) {
        return NextResponse.json(
          { error: "Invalid officeIds" },
          { status: 400 }
        )
      }
    }

    // Check if the user is already a member
    const { data: existingMemberships, error: existingMembershipsError } = await supabase
      .from('user_tenants')
      .select('id, status, role')
      .eq('user_id', userId)
      .eq('tenant_id', params.tenantId)

    if (existingMembershipsError) {
      console.error('Error checking existing memberships:', existingMembershipsError)
      return NextResponse.json(
        { error: "Failed to verify existing memberships" },
        { status: 500 }
      )
    }

    const existingAppMemberships = (existingMemberships || []).filter(
      (membership) => membership.role !== 'supporter'
    )

    if (existingAppMemberships.some((membership) => membership.status === 'active')) {
      return NextResponse.json(
        { error: "This user is already a member" },
        { status: 400 }
      )
    }

    const pendingMembership = existingAppMemberships.find(
      (membership) => membership.status === 'pending'
    )

    const adminSupabase = createAdminClient()

    if (pendingMembership) {
        // If pending, update to active with new role
        const { error: updateError } = await adminSupabase
          .from('user_tenants')
          .update({
            role: role,
            status: 'active',
            joined_at: new Date().toISOString()
          })
          .eq('id', pendingMembership.id)

        if (updateError) {
          console.error('Error updating member:', updateError)
          return NextResponse.json(
            { error: "Failed to update member" },
            { status: 500 }
          )
        }

        const officeAssignmentError = await replaceOfficeAssignments(
          adminSupabase,
          params.tenantId,
          pendingMembership.id,
          officeIds
        )

        if (officeAssignmentError) {
          return NextResponse.json(
            { error: officeAssignmentError },
            { status: 500 }
          )
        }

        return NextResponse.json({ 
          success: true, 
          message: "Member added successfully" 
        })
    }

    // Get user email from auth.users
    const { data: authUserData, error: authUserError } = await adminSupabase.auth.admin.getUserById(userId)
    
    if (authUserError || !authUserData?.user) {
      return NextResponse.json(
        { error: "User not found" },
        { status: 404 }
      )
    }

    const userEmail = authUserData.user.email

    // Verify that the user is a member of at least one tenant
    // The search API already ensures we only see users from our tenant network
    const { data: targetUserTenants, error: targetUserTenantsError } = await supabase
      .from('user_tenants')
      .select('tenant_id, status')
      .eq('user_id', userId)

    if (targetUserTenantsError) {
      console.error('Error fetching target user tenants:', targetUserTenantsError)
      return NextResponse.json(
        { error: "Failed to verify user" },
        { status: 500 }
      )
    }

    // Check if the user is a member of at least one tenant
    // This ensures we only add users who are part of the system
    const hasAtLeastOneActiveMembership = targetUserTenants?.some(ut => ut.status === 'active')
    
    if (!hasAtLeastOneActiveMembership || !targetUserTenants || targetUserTenants.length === 0) {
      return NextResponse.json(
        { error: "You can only add users who are members of at least one tenant" },
        { status: 403 }
      )
    }

    // Add the user to the tenant
    const { data: userTenant, error: insertError } = await adminSupabase
      .from('user_tenants')
      .insert({
        user_id: userId,
        tenant_id: params.tenantId,
        email: userEmail,
        role: role,
        status: 'active',
        invited_by: user.id,
        joined_at: new Date().toISOString()
      })
      .select("id")
      .single()

    if (insertError) {
      console.error('Error adding member:', insertError)
      return NextResponse.json(
        { error: "Failed to add member" },
        { status: 500 }
      )
    }

    const officeAssignmentError = await replaceOfficeAssignments(
      adminSupabase,
      params.tenantId,
      userTenant.id,
      officeIds
    )

    if (officeAssignmentError) {
      return NextResponse.json(
        { error: officeAssignmentError },
        { status: 500 }
      )
    }

    return NextResponse.json({ 
      success: true, 
      message: "Member added successfully" 
    })
  } catch (error) {
    console.error("Error adding member:", error)
    return NextResponse.json(
      { error: "Failed to add member" },
      { status: 500 }
    )
  }
}
