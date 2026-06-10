import { NextRequest, NextResponse } from "next/server"
import { createClient } from "@/lib/supabase/server"
import { createAdminClient } from "@/lib/supabase/client"
import { getInviteRedirectUrl } from "@/lib/supabase/invite-redirect"
import {
  canManageCompanyContacts,
  canManageTenant,
  isCompanyContactEmail,
} from "@/lib/tenant-access"

const INVITABLE_ROLES = new Set(["admin", "member", "guest"])

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
    const officeIds = normalizeOfficeIds(body.officeIds)
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

    if (officeIds.length > 0) {
      const { data: offices, error: officesError } = await supabase
        .from("tenant_offices")
        .select("id")
        .eq("tenant_id", params.tenantId)
        .eq("is_active", true)
        .in("id", officeIds)

      if (officesError) {
        console.error("Error verifying invitation offices:", officesError)
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

    let redirectTo: string
    try {
      redirectTo = getInviteRedirectUrl({ requestOrigin: request.nextUrl.origin })
    } catch (error) {
      console.error("Error resolving invitation redirect URL:", error)
      return NextResponse.json(
        { error: error instanceof Error ? error.message : "Failed to resolve redirect URL" },
        { status: 500 }
      )
    }

    // Use admin client to send invitation
    const adminSupabase = createAdminClient()
    
    try {
      // Use Supabase auth admin to send invitation email
      const { data, error } = await adminSupabase.auth.admin.inviteUserByEmail(normalizedEmail, {
        data: {
          tenant_id: params.tenantId,
          role: role,
          invited_by: user.id,
          office_ids: officeIds,
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
      const { data: userTenant, error: userTenantError } = await adminSupabase
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
        .select("id")
        .single()
      
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

      if (officeIds.length > 0) {
        const { error: officeAssignmentError } = await adminSupabase
          .from("user_tenant_offices")
          .insert(officeIds.map((officeId) => ({
            tenant_id: params.tenantId,
            user_tenant_id: userTenant.id,
            tenant_office_id: officeId,
          })))

        if (officeAssignmentError) {
          console.error("Error creating user tenant office assignments:", officeAssignmentError)
          return NextResponse.json(
            { error: "Failed to assign affiliations" },
            { status: 500 }
          )
        }
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
