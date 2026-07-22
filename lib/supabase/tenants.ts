import { createClient, createAdminClient } from './client'
import type { TenantFeaturePermissions } from '@/lib/tenant-access'

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

export interface TenantOffice {
  id: string
  tenant_id: string
  name: string
  slug?: string | null
  address?: string | null
  is_active: boolean
  created_at: string
  updated_at: string
}

export interface UserTenant {
  id: string
  user_id: string
  tenant_id: string
  email?: string
  user?: {
    email?: string
    user_metadata?: {
      name?: string
      [key: string]: any
    }
  }
  role: 'owner' | 'admin' | 'member' | 'guest' | 'supporter'
  feature_permissions?: TenantFeaturePermissions | null
  status: 'active' | 'pending' | 'suspended'
  invited_by?: string
  invited_at?: string
  joined_at?: string
  created_at: string
  updated_at: string
  tenant?: Tenant
  offices?: TenantOffice[]
}

interface UserTenantOfficeAssignment {
  user_tenant_id: string
  tenant_office_id: string
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
    feature_permissions: ut.feature_permissions,
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
  // Exclude 'supporter' role as they are internal users and should not be shown in UI
  const { data: members, error } = await supabase
    .from('user_tenants')
    .select()
    .eq('tenant_id', tenantId)
    .neq('role', 'supporter')
    .order('created_at', { ascending: false })
  
  if (error) {
    console.error('Error fetching tenant members:', error)
    throw error
  }

  if (!members || members.length === 0) {
    return []
  }

  const memberIds = members.map((member: UserTenant) => member.id)

  const { data: assignments, error: assignmentsError } = await supabase
    .from('user_tenant_offices')
    .select('user_tenant_id, tenant_office_id')
    .eq('tenant_id', tenantId)
    .in('user_tenant_id', memberIds)

  if (assignmentsError) {
    console.error('Error fetching tenant member office assignments:', assignmentsError)
    throw assignmentsError
  }

  const assignmentRecords = (assignments || []) as UserTenantOfficeAssignment[]
  const officeIds = Array.from(
    new Set(assignmentRecords.map((assignment) => assignment.tenant_office_id))
  )

  const officesById = new Map<string, TenantOffice>()
  if (officeIds.length > 0) {
    const { data: officeRecords, error: officesError } = await supabase
      .from('tenant_offices')
      .select('id, tenant_id, name, slug, address, is_active, created_at, updated_at')
      .eq('tenant_id', tenantId)
      .in('id', officeIds)

    if (officesError) {
      console.error('Error fetching tenant member offices:', officesError)
      throw officesError
    }

    for (const office of officeRecords || []) {
      officesById.set(office.id, office)
    }
  }

  const officeIdsByMemberId = new Map<string, string[]>()
  for (const assignment of assignmentRecords) {
    const currentOfficeIds = officeIdsByMemberId.get(assignment.user_tenant_id) || []
    currentOfficeIds.push(assignment.tenant_office_id)
    officeIdsByMemberId.set(assignment.user_tenant_id, currentOfficeIds)
  }

  return members.map((member: UserTenant) => ({
    ...member,
    offices: (officeIdsByMemberId.get(member.id) || [])
      .map((officeId) => officesById.get(officeId))
      .filter((office): office is TenantOffice => Boolean(office)),
  }))
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

export async function getTenantOffices(tenantId: string): Promise<TenantOffice[]> {
  if (!tenantId || tenantId === 'null') {
    return []
  }

  const response = await fetch(`/api/tenants/${tenantId}/offices`)
  const result = await response.json()

  if (!response.ok) {
    throw new Error(result.error || 'Failed to fetch affiliations')
  }

  return result.offices || []
}

export async function createTenantInvitation(
  tenantId: string,
  email: string,
  role: 'admin' | 'member' | 'guest',
  officeIds: string[] = []
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
        role,
        officeIds,
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
  tenantId: string,
  userTenantId: string,
  role: 'owner' | 'admin' | 'member' | 'guest'
): Promise<void> {
  const response = await fetch(`/api/tenants/${tenantId}/members/${userTenantId}`, {
    method: 'PATCH',
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ role }),
  })

  const result = await response.json()

  if (!response.ok) {
    throw new Error(result.error || 'Failed to update user tenant role')
  }
}

export async function updateUserTenantFeaturePermissions(
  tenantId: string,
  userTenantId: string,
  featurePermissions: TenantFeaturePermissions
): Promise<void> {
  const response = await fetch(`/api/tenants/${tenantId}/members/${userTenantId}`, {
    method: 'PATCH',
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ featurePermissions }),
  })

  const result = await response.json()

  if (!response.ok) {
    throw new Error(result.error || 'Failed to update feature permissions')
  }
}

export async function updateUserTenantOffices(
  tenantId: string,
  userTenantId: string,
  officeIds: string[]
): Promise<void> {
  const response = await fetch(`/api/tenants/${tenantId}/members/${userTenantId}`, {
    method: 'PATCH',
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ officeIds }),
  })

  const result = await response.json()

  if (!response.ok) {
    throw new Error(result.error || 'Failed to update member affiliations')
  }
}

export async function removeUserFromTenant(tenantId: string, userTenantId: string): Promise<void> {
  const response = await fetch(`/api/tenants/${tenantId}/members/${userTenantId}`, {
    method: 'DELETE',
  })

  const result = await response.json()

  if (!response.ok) {
    throw new Error(result.error || 'Failed to remove user from tenant')
  }
}

export async function resendTenantInvitation(
  tenantId: string,
  userTenantId: string
): Promise<void> {
  const response = await fetch(`/api/tenants/${tenantId}/members/${userTenantId}/resend`, {
    method: "POST",
  })

  let result: { error?: string; message?: string } | null = null
  let rawBody = ""

  const contentType = response.headers.get("content-type") || ""
  if (contentType.includes("application/json")) {
    try {
      result = await response.json()
    } catch (error) {
      console.error("Error parsing resend invitation response JSON:", error)
    }
  } else {
    rawBody = await response.text()
  }

  if (!response.ok) {
    const fallbackMessage = rawBody.trim()
      ? `${response.status} ${response.statusText}: ${rawBody.trim()}`
      : `${response.status} ${response.statusText}`

    throw new Error(result?.error || result?.message || fallbackMessage || "Failed to resend invitation")
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
  invitedEmail?: string | null
  isActive: boolean
  isExpired: boolean
}

type InvitationMembershipCandidate = {
  id: string
  status: string
  role?: string | null
  user_id?: string | null
  email?: string | null
}

export function getTenantMembershipIdentityFilter(userId: string, userEmail: string): string {
  const normalizedEmail = userEmail.trim().toLowerCase()
  return normalizedEmail ? `user_id.eq.${userId},email.eq.${normalizedEmail}` : `user_id.eq.${userId}`
}

export function pickTenantMembershipForInviteAcceptance(
  memberships: InvitationMembershipCandidate[],
  userEmail: string
): InvitationMembershipCandidate | undefined {
  const normalizedEmail = userEmail.trim().toLowerCase()

  return (
    memberships.find(
      (membership) =>
        membership.status === 'pending' &&
        membership.email?.trim().toLowerCase() === normalizedEmail &&
        membership.role !== 'supporter'
    ) ?? memberships.find(
      (membership) => membership.status === 'active' && membership.role !== 'supporter'
    ) ?? memberships.find(
      (membership) => membership.status === 'suspended' && membership.role !== 'supporter'
    )
  )
}

export function pickExistingMembershipForTargetedInvite(
  memberships: InvitationMembershipCandidate[],
  targetRole?: string | null
): InvitationMembershipCandidate | undefined {
  return (
    memberships.find(
      (membership) => membership.status === 'active' && membership.role !== 'supporter'
    ) ?? memberships.find(
      (membership) =>
        membership.status === 'suspended' &&
        membership.role !== 'supporter' &&
        membership.role === targetRole
    )
  )
}

// Public: look up invite link info without authentication (uses admin client)
export async function getInviteLinkInfo(token: string): Promise<{ success: boolean; info?: InviteLinkInfo; error?: string }> {
  try {
    const adminSupabase = createAdminClient()

    const { data, error } = await adminSupabase
      .from('tenant_invite_links')
      .select('tenant_id, default_role, expires_at, is_active, target_user_tenant_id, tenants(name)')
      .eq('token', token)
      .single()

    if (error || !data) {
      return { success: false, error: '招待リンクが見つかりません' }
    }

    let invitedEmail: string | null = null
    if (data.target_user_tenant_id) {
      const { data: targetMembership, error: targetMembershipError } = await adminSupabase
        .from('user_tenants')
        .select('email, status')
        .eq('id', data.target_user_tenant_id)
        .eq('tenant_id', data.tenant_id)
        .maybeSingle()

      if (targetMembershipError) {
        console.error('Error fetching target invite email:', targetMembershipError)
        return { success: false, error: '招待情報の確認に失敗しました' }
      }

      if (!targetMembership || targetMembership.status !== 'pending') {
        return { success: false, error: 'この招待リンクは無効化されています' }
      }

      invitedEmail = targetMembership.email ?? null
    }

    const isExpired = data.expires_at ? new Date(data.expires_at) < new Date() : false
    const tenant = (
      Array.isArray(data.tenants) ? data.tenants[0] : data.tenants
    ) as { name: string } | null | undefined

    return {
      success: true,
      info: {
        tenantId: data.tenant_id,
        tenantName: tenant?.name ?? '不明なテナント',
        defaultRole: data.default_role as 'admin' | 'member' | 'guest',
        invitedEmail,
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
      .select('id, tenant_id, default_role, expires_at, is_active, target_user_tenant_id')
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

    const normalizedUserEmail = userEmail.trim().toLowerCase()
    const deactivateTargetedInviteLink = async () => {
      const { error: deactivateError } = await adminSupabase
        .from('tenant_invite_links')
        .update({ is_active: false })
        .eq('id', link.id)
        .eq('target_user_tenant_id', link.target_user_tenant_id)

      if (deactivateError) {
        console.error('Error deactivating targeted invite link:', deactivateError)
        return false
      }

      return true
    }

    if (link.target_user_tenant_id) {
      const { data: targetMembership, error: targetMembershipError } = await adminSupabase
        .from('user_tenants')
        .select('id, status, email, user_id, role')
        .eq('id', link.target_user_tenant_id)
        .eq('tenant_id', link.tenant_id)
        .maybeSingle()

      if (targetMembershipError) {
        console.error('Error fetching target invite membership:', targetMembershipError)
        return { success: false, error: '招待情報の確認に失敗しました' }
      }

      if (!targetMembership) {
        return { success: false, error: '招待情報が見つかりません' }
      }

      if (targetMembership.email?.trim().toLowerCase() !== normalizedUserEmail) {
        return { success: false, error: '招待されたメールアドレスでログインしてください' }
      }

      if (targetMembership.status === 'active') {
        if (targetMembership.user_id === userId) {
          await deactivateTargetedInviteLink()
          return { success: true, tenantId: link.tenant_id }
        }
        return { success: false, error: 'すでにこのテナントのメンバーです' }
      }

      if (targetMembership.status !== 'pending') {
        return { success: false, error: 'この招待リンクは利用できません' }
      }

      const { data: existingMemberships, error: existingMembershipError } = await adminSupabase
        .from('user_tenants')
        .select('id, status, role')
        .eq('tenant_id', link.tenant_id)
        .eq('user_id', userId)
        .in('status', ['active', 'suspended'])
        .neq('role', 'supporter')

      if (existingMembershipError) {
        console.error('Error checking existing memberships for targeted invite:', existingMembershipError)
        return { success: false, error: '既存メンバー情報の確認に失敗しました' }
      }

      const existingMembership = pickExistingMembershipForTargetedInvite(
        existingMemberships || [],
        targetMembership.role
      )

      if (existingMembership) {
        if (existingMembership.status === 'suspended') {
          const { data: targetOfficeAssignments, error: targetOfficeAssignmentsError } = await adminSupabase
            .from('user_tenant_offices')
            .select('tenant_office_id')
            .eq('tenant_id', link.tenant_id)
            .eq('user_tenant_id', targetMembership.id)

          if (targetOfficeAssignmentsError) {
            console.error('Error fetching targeted invite office assignments:', targetOfficeAssignmentsError)
            return { success: false, error: '所属先情報の確認に失敗しました' }
          }

          const { error: deleteExistingOfficesError } = await adminSupabase
            .from('user_tenant_offices')
            .delete()
            .eq('tenant_id', link.tenant_id)
            .eq('user_tenant_id', existingMembership.id)

          if (deleteExistingOfficesError) {
            console.error('Error clearing existing suspended membership offices:', deleteExistingOfficesError)
            return { success: false, error: '所属先情報の更新に失敗しました' }
          }

          if ((targetOfficeAssignments || []).length > 0) {
            const { error: moveTargetOfficesError } = await adminSupabase
              .from('user_tenant_offices')
              .update({ user_tenant_id: existingMembership.id })
              .eq('tenant_id', link.tenant_id)
              .eq('user_tenant_id', targetMembership.id)

            if (moveTargetOfficesError) {
              console.error('Error moving targeted invite office assignments:', moveTargetOfficesError)
              return { success: false, error: '所属先情報の更新に失敗しました' }
            }
          }

          const { error: reactivateError } = await adminSupabase
            .from('user_tenants')
            .update({
              email: normalizedUserEmail,
              status: 'active',
              joined_at: new Date().toISOString(),
            })
            .eq('id', existingMembership.id)

          if (reactivateError) {
            console.error('Error reactivating existing targeted invite membership:', reactivateError)
            return { success: false, error: 'テナント参加処理に失敗しました' }
          }
        }

        const { error: deletePendingError } = await adminSupabase
          .from('user_tenants')
          .delete()
          .eq('id', targetMembership.id)
          .eq('status', 'pending')

        if (deletePendingError) {
          console.error('Error deleting duplicate pending targeted invite:', deletePendingError)
        }

        await deactivateTargetedInviteLink()
        return { success: true, tenantId: link.tenant_id }
      }

      const { error: updateError } = await adminSupabase
        .from('user_tenants')
        .update({
          user_id: userId,
          email: normalizedUserEmail,
          status: 'active',
          joined_at: new Date().toISOString(),
        })
        .eq('id', targetMembership.id)

      if (updateError) {
        console.error('Error activating target membership:', updateError)
        return { success: false, error: 'テナント参加処理に失敗しました' }
      }

      await deactivateTargetedInviteLink()
      return { success: true, tenantId: link.tenant_id }
    }

    // 2. Check if user is already a member or has a pending invite for this email
    const { data: existingMemberships, error: existingError } = await adminSupabase
      .from('user_tenants')
      .select('id, status, role, email')
      .eq('tenant_id', link.tenant_id)
      .or(getTenantMembershipIdentityFilter(userId, userEmail))

    if (existingError) {
      console.error('Error fetching existing membership:', existingError)
      return { success: false, error: '既存メンバー情報の確認に失敗しました' }
    }

    const existing = pickTenantMembershipForInviteAcceptance(existingMemberships || [], userEmail)

    if (existing) {
      if (existing.status === 'active') {
        return { success: false, error: 'すでにこのテナントのメンバーです' }
      }
      // Activate pending membership and attach it to the authenticated user.
      const { error: updateError } = await adminSupabase
        .from('user_tenants')
        .update({
          user_id: userId,
          email: userEmail.trim().toLowerCase(),
          status: 'active',
          joined_at: new Date().toISOString(),
        })
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
