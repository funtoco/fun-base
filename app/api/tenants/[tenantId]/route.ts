import { NextRequest, NextResponse } from "next/server"
import { createClient } from "@/lib/supabase/server"
import { createAdminClient } from "@/lib/supabase/client"
import { canManageTenant, isTenantOwner } from "@/lib/tenant-access"

export async function DELETE(
  request: NextRequest,
  { params }: { params: { tenantId: string } }
) {
  try {
    const supabase = await createClient()
    const { data: { user }, error: authError } = await supabase.auth.getUser()

    if (authError || !user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
    }

    // Check if user is owner of the tenant
    const { data: currentUserMemberships, error: currentUserMembershipsError } = await supabase
      .from('user_tenants')
      .select('role')
      .eq('tenant_id', params.tenantId)
      .eq('user_id', user.id)
      .eq('status', 'active')

    if (currentUserMembershipsError) {
      console.error('Error checking tenant ownership:', currentUserMembershipsError)
      return NextResponse.json(
        { error: "Failed to verify tenant ownership" },
        { status: 500 }
      )
    }

    if (!currentUserMemberships || currentUserMemberships.length === 0) {
      return NextResponse.json(
        { error: "Tenant not found or access denied" },
        { status: 404 }
      )
    }

    if (!isTenantOwner(currentUserMemberships)) {
      return NextResponse.json(
        { error: "Only tenant owners can delete tenants" },
        { status: 403 }
      )
    }

    // Use admin client for deletion to ensure all related data is deleted
    let adminSupabase;
    try {
      adminSupabase = createAdminClient()
    } catch (adminError) {
      console.error('Error creating admin client:', adminError)
      return NextResponse.json(
        { error: "Configuration error: Failed to initialize admin client" },
        { status: 500 }
      )
    }
    
    const { error: deleteError } = await adminSupabase
      .from('tenants')
      .delete()
      .eq('id', params.tenantId)

    if (deleteError) {
      console.error('Error deleting tenant:', deleteError)
      return NextResponse.json(
        { error: "Failed to delete tenant" },
        { status: 500 }
      )
    }

    return NextResponse.json({ 
      success: true, 
      message: "Tenant deleted successfully" 
    })
  } catch (error) {
    console.error("Internal exception in tenant deletion:", error)
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 }
    )
  }
}

export async function PATCH(
  request: NextRequest,
  { params }: { params: { tenantId: string } }
) {
  try {
    const supabase = await createClient()
    const { data: { user }, error: authError } = await supabase.auth.getUser()

    if (authError || !user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
    }

    // Check if user has permission (owner or admin)
    const { data: currentUserMemberships, error: currentUserMembershipsError } = await supabase
      .from('user_tenants')
      .select('role')
      .eq('tenant_id', params.tenantId)
      .eq('user_id', user.id)
      .eq('status', 'active')

    if (currentUserMembershipsError) {
      console.error('Error checking tenant permissions:', currentUserMembershipsError)
      return NextResponse.json(
        { error: "Failed to verify tenant permissions" },
        { status: 500 }
      )
    }

    if (!currentUserMemberships || currentUserMemberships.length === 0) {
      return NextResponse.json(
        { error: "Tenant not found or access denied" },
        { status: 404 }
      )
    }

    if (!canManageTenant(currentUserMemberships)) {
      return NextResponse.json(
        { error: "Insufficient permissions" },
        { status: 403 }
      )
    }

    const body = await request.json()
    const { name, description, slug } = body

    // Validate required fields
    if (!name || typeof name !== 'string' || !name.trim()) {
      return NextResponse.json(
        { error: "Tenant name is required" },
        { status: 400 }
      )
    }

    if (!slug || typeof slug !== 'string' || !slug.trim()) {
      return NextResponse.json(
        { error: "Slug is required" },
        { status: 400 }
      )
    }

    if (!/^[a-z0-9][a-z0-9-]*[a-z0-9]$|^[a-z0-9]$/.test(slug)) {
      return NextResponse.json(
        { error: "Slug must contain only lowercase letters, numbers, and hyphens" },
        { status: 400 }
      )
    }

    const updatePayload: Record<string, any> = {
      name: name.trim(),
      slug: slug.trim(),
      updated_at: new Date().toISOString()
    }
    if (description !== undefined) {
      updatePayload.description = description
    }

    const { data, error: updateError } = await supabase
      .from('tenants')
      .update(updatePayload)
      .eq('id', params.tenantId)
      .select()
      .single()

    if (updateError) {
      console.error('Error updating tenant:', updateError)
      return NextResponse.json(
        { error: "Failed to update tenant" },
        { status: 500 }
      )
    }

    return NextResponse.json({ 
      success: true, 
      tenant: data
    })
  } catch (error) {
    console.error("Error in tenant update API:", error)
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 }
    )
  }
}
