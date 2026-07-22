import { NextRequest, NextResponse } from "next/server"
import { createClient } from "@/lib/supabase/server"
import { createAdminClient } from "@/lib/supabase/client"
import { sendEmail } from "@/lib/notifications/email"
import { getInviteRedirectUrl } from "@/lib/supabase/invite-redirect"
import { buildTenantInvitationEmail, buildTenantInviteUrl } from "@/lib/tenant-invitation-email"
import {
  canManageTenant,
  TENANT_INVITABLE_ROLES,
} from "@/lib/tenant-access"

const INVITABLE_ROLES = new Set(TENANT_INVITABLE_ROLES)

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

    if (!canManageAllMembers) {
      return NextResponse.json(
        { error: "You don't have permission to invite members" },
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

    const adminSupabase = createAdminClient()
    let createdUserTenantId: string | null = null

    try {
      const { data: tenant, error: tenantError } = await adminSupabase
        .from("tenants")
        .select("name")
        .eq("id", params.tenantId)
        .single()

      if (tenantError || !tenant) {
        console.error("Error fetching tenant for invitation email:", tenantError)
        return NextResponse.json({ error: "Failed to fetch tenant" }, { status: 500 })
      }

      // Store the invitation metadata before sending the reusable app invite link.
      const { data: userTenant, error: userTenantError } = await adminSupabase
        .from('user_tenants')
        .insert({
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

      createdUserTenantId = userTenant.id

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
          throw new Error("Failed to assign affiliations")
        }
      }

      const { data: link, error: inviteLinkError } = await adminSupabase
        .from("tenant_invite_links")
        .insert({
          tenant_id: params.tenantId,
          default_role: role,
          is_active: true,
          created_by: user.id,
          target_user_tenant_id: userTenant.id,
        })
        .select("token")
        .single()

      if (inviteLinkError || !link) {
        console.error("Error creating reusable invite link:", inviteLinkError)
        throw new Error("Failed to create invite link")
      }

      const baseUrl = getInviteRedirectUrl({ requestOrigin: request.nextUrl.origin })
      const inviteUrl = buildTenantInviteUrl(baseUrl, link.token)
      const emailMessage = buildTenantInvitationEmail({
        tenantName: tenant.name ?? "FunBase",
        inviteUrl,
      })

      await sendEmail({
        to: normalizedEmail,
        ...emailMessage,
      })

      return NextResponse.json({
        success: true,
        message: "Invitation sent successfully"
      })
    } catch (error) {
      console.error('Error in invitation process:', error)

      if (createdUserTenantId) {
        const { error: cleanupLinkError } = await adminSupabase
          .from("tenant_invite_links")
          .delete()
          .eq("target_user_tenant_id", createdUserTenantId)

        if (cleanupLinkError) {
          console.error("Error cleaning up failed invite link:", cleanupLinkError)
        }

        const { error: cleanupOfficesError } = await adminSupabase
          .from("user_tenant_offices")
          .delete()
          .eq("user_tenant_id", createdUserTenantId)

        if (cleanupOfficesError) {
          console.error("Error cleaning up failed invite office assignments:", cleanupOfficesError)
        }

        const { error: cleanupMemberError } = await adminSupabase
          .from("user_tenants")
          .delete()
          .eq("id", createdUserTenantId)
          .eq("status", "pending")

        if (cleanupMemberError) {
          console.error("Error cleaning up failed pending invitation:", cleanupMemberError)
        }
      }

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
