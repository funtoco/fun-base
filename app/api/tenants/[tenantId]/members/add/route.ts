import { NextRequest, NextResponse } from "next/server"
import { createClient } from "@/lib/supabase/server"
import { createAdminClient } from "@/lib/supabase/client"
import { canManageTenant } from "@/lib/tenant-access"

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

    if (!userId || !role) {
      return NextResponse.json(
        { error: "UserId and role are required" },
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

    if (pendingMembership) {
        // If pending, update to active with new role
        const { error: updateError } = await supabase
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

        return NextResponse.json({ 
          success: true, 
          message: "Member added successfully" 
        })
    }

    // Get user email from auth.users
    const adminSupabase = createAdminClient()
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
    const { error: insertError } = await supabase
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

    if (insertError) {
      console.error('Error adding member:', insertError)
      return NextResponse.json(
        { error: "Failed to add member" },
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
