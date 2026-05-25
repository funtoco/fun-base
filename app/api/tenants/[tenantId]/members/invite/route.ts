import { NextRequest, NextResponse } from "next/server"
import { createClient } from "@/lib/supabase/server"
import { createAdminClient } from "@/lib/supabase/client"
import {
  canManageCompanyContacts,
  canManageTenant,
  isCompanyContactEmail,
} from "@/lib/tenant-access"

const INVITABLE_ROLES = new Set(["admin", "member", "guest"])

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
    const { email, role } = body
    const normalizedEmail = typeof email === "string" ? email.toLowerCase().trim() : ""

    if (!normalizedEmail || !role) {
      return NextResponse.json(
        { error: "Email and role are required" },
        { status: 400 }
      )
    }

    if (!INVITABLE_ROLES.has(role)) {
      return NextResponse.json(
        { error: "Invalid role" },
        { status: 400 }
      )
    }

    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(normalizedEmail)) {
      return NextResponse.json(
        { error: "Invalid email" },
        { status: 400 }
      )
    }

    // Check if user has permission to invite
    const { data: currentUserMemberships, error: currentUserMembershipsError } = await supabase
      .from('user_tenants')
      .select('role')
      .eq('user_id', user.id)
      .eq('tenant_id', params.tenantId)
      .eq('status', 'active')

    if (currentUserMembershipsError) {
      console.error('Error checking inviter membership:', currentUserMembershipsError)
      return NextResponse.json(
        { error: "Failed to verify inviter membership" },
        { status: 500 }
      )
    }

    const actorMemberships = currentUserMemberships || []
    const canManageAllMembers = canManageTenant(actorMemberships)
    const canManageCompanyContactInvite = canManageCompanyContacts(
      actorMemberships,
      user.email
    )

    if (!canManageAllMembers && !canManageCompanyContactInvite) {
      return NextResponse.json(
        { error: "You don't have permission to invite members" },
        { status: 403 }
      )
    }

    if (!canManageAllMembers) {
      if (role !== "member") {
        return NextResponse.json(
          { error: "You can only invite company contacts as members" },
          { status: 403 }
        )
      }

      if (!isCompanyContactEmail(normalizedEmail)) {
        return NextResponse.json(
          { error: "You can only invite external company contact emails" },
          { status: 403 }
        )
      }
    }

    // Check if email is already a member
    const { data: existingMemberships, error: existingMembershipsError } = await supabase
      .from('user_tenants')
      .select('id, status, role')
      .eq('tenant_id', params.tenantId)
      .eq('email', normalizedEmail)

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

    if (existingAppMemberships.some((membership) => membership.status === 'pending')) {
        return NextResponse.json(
          { error: "Invitation already sent (pending)" },
          { status: 400 }
        )
    }

    const redirectTo = new URL("/auth/set-password", request.nextUrl.origin).toString()

    // Use admin client to send invitation
    const adminSupabase = createAdminClient()
    
    try {
      // Use Supabase auth admin to send invitation email
      const { data, error } = await adminSupabase.auth.admin.inviteUserByEmail(normalizedEmail, {
        data: {
          tenant_id: params.tenantId,
          role: role,
          invited_by: user.id
        },
        redirectTo
      })
      
      if (error) {
        console.error('Error sending invitation:', error)
        return NextResponse.json(
          { error: error.message || "Failed to send invitation" },
          { status: 500 }
        )
      }
      
      // Store the invitation metadata in user_tenants with pending status
      const { error: userTenantError } = await supabase
        .from('user_tenants')
        .insert({
          user_id: data.user.id,
          tenant_id: params.tenantId,
          email: normalizedEmail,
          role: role,
          status: 'pending',
          invited_by: user.id,
          invited_at: new Date().toISOString()
        })
      
      if (userTenantError) {
        console.error('Error creating user tenant record:', userTenantError)
        // Check if it's a duplicate key error
        if (userTenantError.code === '23505') {
          return NextResponse.json(
            { error: "This user is already a member or has a pending invitation" },
            { status: 400 }
          )
        }
        return NextResponse.json(
          { error: "Failed to create user tenant record" },
          { status: 500 }
        )
      }
      
      return NextResponse.json({ 
        success: true, 
        message: "Invitation sent successfully" 
      })
    } catch (error) {
      console.error('Error in invitation process:', error)
      return NextResponse.json(
        { error: "Failed to send invitation" },
        { status: 500 }
      )
    }
  } catch (error) {
    console.error("Error creating invitation:", error)
    return NextResponse.json(
      { error: "Failed to create invitation" },
      { status: 500 }
    )
  }
}
