import { createClient, createAdminClient } from './client'

export interface Tenant {
  id: string
  name: string
  slug: string
  description?: string
  settings: Record<string, any>
  max_members: number
  created_at: string
  updated_at: string
}

export interface UserTenant {
  id: string
  user_id: string
  tenant_id: string
  email?: string
  role: 'owner' | 'admin' | 'member' | 'guest'
  status: 'active' | 'pending' | 'suspended'
  invited_by?: string
  invited_at?: string
  joined_at?: string
  created_at: string
  updated_at: string
  tenant?: Tenant
}


export async function getTenants(): Promise<Tenant[]> {
  const supabase = createClient()
  
  const { data, error } = await supabase
    .from('tenants')
    .select()
    .order('created_at', { ascending: false })
  
  if (error) {
    console.error('Error fetching tenants:', error)
    throw error
  }
  
  return data || []
}

export async function getTenantById(id: string | null | undefined): Promise<Tenant | null> {
  console.log('[tenant] getTenantById called with:', id)
  if (!id || id === 'null') {
    console.log('[tenant] getTenantById: skip fetch (no id)')
    return null
  }
  const supabase = createClient()
  
  const { data, error } = await supabase
    .from('tenants')
    .select()
    .eq('id', id)
    .single()
  
  if (error) {
    console.error('Error fetching tenant:', error)
    return null
  }
  
  return data
}

export async function getCurrentUserTenants(): Promise<UserTenant[]> {
  const supabase = createClient()
  
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) {
    return []
  }

  // Get user_tenants records for the current user
  const { data: userTenants, error: userTenantsError } = await supabase
    .from('user_tenants')
    .select(`
      *,
      tenant:tenant_id (*)
    `)
    .eq('user_id', user.id)
    .eq('status', 'active')
  
  if (userTenantsError) {
    console.error('Error fetching user tenants:', userTenantsError)
    return []
  }
  
  if (!userTenants || userTenants.length === 0) {
    return []
  }
  
  return userTenants.map((ut: UserTenant) => ({
    id: ut.id,
    user_id: ut.user_id,
    tenant_id: ut.tenant_id,
    email: ut.email,
    role: ut.role,
    status: ut.status,
    created_at: ut.created_at,
    updated_at: ut.updated_at,
    tenant: ut.tenant
  }))
}

export async function getTenantMembers(tenantId: string): Promise<UserTenant[]> {
  console.log('[tenant] getTenantMembers called with:', tenantId)
  if (!tenantId || tenantId === 'null') {
    console.log('[tenant] getTenantMembers: skip fetch (no tenantId)')
    return []
  }
  const supabase = createClient()
  
  // Get all members from user_tenants table (active, pending, suspended)
  const { data: members, error } = await supabase
    .from('user_tenants')
    .select()
    .eq('tenant_id', tenantId)
    .order('created_at', { ascending: false })
  
  if (error) {
    console.error('Error fetching tenant members:', error)
    throw error
  }

  if (!members || members.length === 0) {
    return []
  }

  return members
}

export async function getTenantInvitations(tenantId: string): Promise<UserTenant[]> {
  const supabase = createClient()
  
  const { data, error } = await supabase
    .from('user_tenants')
    .select()
    .eq('tenant_id', tenantId)
    .eq('status', 'pending')
    .order('created_at', { ascending: false })
  
  if (error) {
    console.error('Error fetching tenant invitations:', error)
    throw error
  }
  
  return data || []
}

export async function createTenantInvitation(
  tenantId: string,
  email: string,
  role: 'admin' | 'member' | 'guest'
): Promise<{ success: boolean; error?: string }> {
  try {
    // Call the API route instead of using admin client directly
    const response = await fetch(`/api/tenants/${tenantId}/members`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        email,
        role
      })
    })

    const result = await response.json()
    
    if (!response.ok) {
      return { success: false, error: result.error || 'Failed to send invitation' }
    }
    
    return { success: true }
  } catch (error) {
    console.error('Error in createTenantInvitation:', error)
    return { success: false, error: error instanceof Error ? error.message : 'Unknown error' }
  }
}


export async function activateUserTenantMembership(
  userId: string,
  email: string
): Promise<{ success: boolean; error?: string }> {
  const supabase = createAdminClient()
  try {
    const identityFilter = email
      ? `user_id.eq.${userId},email.eq.${email}`
      : `user_id.eq.${userId}`

    // Find pending user_tenants records for this user/email
    const { data: pendingMemberships, error: fetchError } = await supabase
      .from('user_tenants')
      .select()
      .or(identityFilter)

    if (fetchError) {
      console.error('Error fetching pending memberships:', fetchError)
      return { success: false, error: fetchError.message }
    }

    if (!pendingMemberships || pendingMemberships.length === 0) {
      const { data: userInfo, error: userError } = await supabase.auth.admin.getUserById(userId)

      if (userError) {
        console.error('Error fetching user metadata:', userError)
        return { success: false, error: userError.message }
      }

      const metadata = userInfo?.user?.user_metadata ?? {}
      const tenantId = metadata.tenant_id as string | undefined
      const role = (metadata.role as UserTenant['role'] | undefined) ?? 'member'
      const invitedBy = metadata.invited_by as string | undefined

      if (!tenantId) {
        return { success: false, error: 'No pending memberships found for user' }
      }

      const { error: insertError } = await supabase
        .from('user_tenants')
        .insert({
          user_id: userId,
          tenant_id: tenantId,
          email,
          role,
          status: 'active',
          invited_by: invitedBy,
          joined_at: new Date().toISOString()
        })

      if (insertError) {
        console.error('Error inserting user tenant membership:', insertError)
        return { success: false, error: insertError.message }
      }

      return { success: true }
    }

    // Update each pending membership with the user ID and activate
    for (const membership of pendingMemberships) {
      if (membership.status === 'active') {
        continue
      }

      const { error: updateError } = await supabase
        .from('user_tenants')
        .update({
          user_id: userId,
          email,
          status: 'active',
          joined_at: new Date().toISOString()
        })
        .eq('id', membership.id)

      if (updateError) {
        console.error('Error updating user tenant membership:', updateError)
        return { success: false, error: updateError.message }
      }
    }

    return { success: true }
  } catch (error) {
    console.error('Error in activateUserTenantMembership:', error)
    return { success: false, error: error instanceof Error ? error.message : 'Unknown error' }
  }
}

export async function updateUserTenantRole(
  userTenantId: string,
  role: 'owner' | 'admin' | 'member' | 'guest'
): Promise<void> {
  const supabase = createClient()
  
  const { error } = await supabase
    .from('user_tenants')
    .update({ role })
    .eq('id', userTenantId)
  
  if (error) {
    console.error('Error updating user tenant role:', error)
    throw error
  }
}

export async function removeUserFromTenant(userTenantId: string): Promise<void> {
  const supabase = createClient()
  
  const { error } = await supabase
    .from('user_tenants')
    .delete()
    .eq('id', userTenantId)
  
  if (error) {
    console.error('Error removing user from tenant:', error)
    throw error
  }
}

export async function cancelTenantInvitation(invitationId: string): Promise<void> {
  const supabase = createClient()
  
  const { error } = await supabase
    .from('user_tenants')
    .delete()
    .eq('id', invitationId)
    .eq('status', 'pending')
  
  if (error) {
    console.error('Error canceling invitation:', error)
    throw error
  }
}

export async function createTenant(tenantData: {
  name: string
  slug: string
  description?: string
}): Promise<Tenant> {
  const supabase = createClient()
  
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) {
    throw new Error('User not authenticated')
  }
  
  const { data, error } = await supabase
    .from('tenants')
    .insert({
      name: tenantData.name,
      slug: tenantData.slug,
      description: tenantData.description,
      max_members: 50
    })
    .select()
    .single()
  
  if (error) {
    console.error('Error creating tenant:', error)
    throw error
  }
  
  // Add the creator as owner
  const { error: userTenantError } = await supabase
    .from('user_tenants')
    .insert({
      user_id: user.id,
      tenant_id: data.id,
      role: 'owner',
      status: 'active',
      joined_at: new Date().toISOString()
    })
  
  if (userTenantError) {
    console.error('Error adding user to tenant:', userTenantError)
    throw userTenantError
  }
  
  return data
}

export async function deleteTenant(tenantId: string): Promise<{ success: boolean; error?: string }> {
  try {
    const response = await fetch(`/api/tenants/${tenantId}`, {
      method: 'DELETE',
      headers: {
        'Content-Type': 'application/json',
      },
    })

    const contentType = response.headers.get("content-type")
    if (contentType && contentType.includes("text/html")) {
      return { success: false, error: `Server error (${response.status}): Unexpected response format` }
    }

    const result = await response.json()
    
    if (!response.ok) {
      return { success: false, error: result.error || 'Failed to delete tenant' }
    }
    
    return { success: true }
  } catch (error) {
    console.error('Error in deleteTenant:', error)
    return { success: false, error: error instanceof Error ? error.message : 'Unknown error' }
  }
}

export interface InviteLinkInfo {
  tenantId: string
  tenantName: string
  defaultRole: 'admin' | 'member' | 'guest'
  isActive: boolean
  isExpired: boolean
}

// Public: look up invite link info without authentication (uses admin client)
export async function getInviteLinkInfo(token: string): Promise<{ success: boolean; info?: InviteLinkInfo; error?: string }> {
  try {
    const adminSupabase = createAdminClient()

    const { data, error } = await adminSupabase
      .from('tenant_invite_links')
      .select('tenant_id, default_role, expires_at, is_active, tenants(name)')
      .eq('token', token)
      .single()

    if (error || !data) {
      return { success: false, error: '招待リンクが見つかりません' }
    }

    const isExpired = data.expires_at ? new Date(data.expires_at) < new Date() : false
    const tenant = data.tenants as { name: string } | null

    return {
      success: true,
      info: {
        tenantId: data.tenant_id,
        tenantName: tenant?.name ?? '不明なテナント',
        defaultRole: data.default_role as 'admin' | 'member' | 'guest',
        isActive: data.is_active,
        isExpired,
      },
    }
  } catch (error) {
    console.error('Error in getInviteLinkInfo:', error)
    return { success: false, error: 'サーバーエラーが発生しました' }
  }
}

// Accept an invite link: add the authenticated user to the tenant
export async function acceptTenantInvitation(
  token: string,
  userId: string,
  userEmail: string
): Promise<{ success: boolean; tenantId?: string; error?: string }> {
  try {
    const adminSupabase = createAdminClient()

    // 1. Look up the invite link
    const { data: link, error: linkError } = await adminSupabase
      .from('tenant_invite_links')
      .select('id, tenant_id, default_role, expires_at, is_active')
      .eq('token', token)
      .single()

    if (linkError || !link) {
      return { success: false, error: '招待リンクが見つかりません' }
    }

    if (!link.is_active) {
      return { success: false, error: 'この招待リンクは無効化されています' }
    }

    if (link.expires_at && new Date(link.expires_at) < new Date()) {
      return { success: false, error: 'この招待リンクは期限切れです' }
    }

    // 2. Check if user is already a member
    const { data: existing, error: existingError } = await adminSupabase
      .from('user_tenants')
      .select('id, status')
      .eq('tenant_id', link.tenant_id)
      .eq('user_id', userId)
      .maybeSingle()

    if (existingError) {
      console.error('Error fetching existing membership:', existingError)
      return { success: false, error: '既存メンバー情報の確認に失敗しました' }
    }

    if (existing) {
      if (existing.status === 'active') {
        return { success: false, error: 'すでにこのテナントのメンバーです' }
      }
      // Activate pending membership
      const { error: updateError } = await adminSupabase
        .from('user_tenants')
        .update({ status: 'active', joined_at: new Date().toISOString() })
        .eq('id', existing.id)

      if (updateError) {
        console.error('Error activating membership:', updateError)
        return { success: false, error: 'テナント参加処理に失敗しました' }
      }

      return { success: true, tenantId: link.tenant_id }
    }

    // 3. Add user to tenant
    const { error: insertError } = await adminSupabase.from('user_tenants').insert({
      user_id: userId,
      tenant_id: link.tenant_id,
      email: userEmail,
      role: link.default_role,
      status: 'active',
      joined_at: new Date().toISOString(),
    })

    if (insertError) {
      if (insertError.code === '23505') {
        return { success: true, tenantId: link.tenant_id }
      }
      console.error('Error inserting user_tenants:', insertError)
      return { success: false, error: 'テナントへの参加に失敗しました' }
    }

    return { success: true, tenantId: link.tenant_id }
  } catch (error) {
    console.error('Error in acceptTenantInvitation:', error)
    return { success: false, error: 'サーバーエラーが発生しました' }
  }
}

export async function updateTenant(
  tenantId: string,
  tenantData: {
    name?: string
    slug?: string
    description?: string
  }
): Promise<{ success: boolean; tenant?: Tenant; error?: string }> {
  try {
    const response = await fetch(`/api/tenants/${tenantId}`, {
      method: 'PATCH',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(tenantData)
    })

    const contentType = response.headers.get("content-type")
    if (contentType && contentType.includes("text/html")) {
      return { success: false, error: `Server error (${response.status}): Unexpected response format` }
    }

    const result = await response.json()
    
    if (!response.ok) {
      return { success: false, error: result.error || 'Failed to update tenant' }
    }
    
    return { success: true, tenant: result.tenant }
  } catch (error) {
    console.error('Error in updateTenant:', error)
    return { success: false, error: error instanceof Error ? error.message : 'Unknown error' }
  }
}
