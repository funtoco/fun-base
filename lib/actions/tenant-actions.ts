"use server"

import { createClient } from "@/lib/supabase/server"
import { createAdminClient } from "@/lib/supabase/client"
import { revalidatePath } from "next/cache"
import { redirect } from "next/navigation"
import { Tenant } from "@/tenant-management/types/tenant"
import { TENANT_INVITABLE_ROLES, TENANT_MANAGEABLE_ROLES } from "@/lib/tenant-access"

export interface CreateTenantData {
  name: string
  slug: string
  description?: string
}

export interface InviteMemberData {
  tenantId: string
  email: string
  role: 'admin' | 'member' | 'guest'
}

export interface UpdateMemberRoleData {
  userTenantId: string
  role: 'owner' | 'admin' | 'member' | 'guest'
}

export interface RemoveMemberData {
  userTenantId: string
}

// Check if user is owner of any tenant
export async function isUserOwnerOfAnyTenant(): Promise<boolean> {
  const supabase = await createClient()
  
  const { data: { user }, error: authError } = await supabase.auth.getUser()
  if (authError || !user) {
    return false
  }

  // Get user's tenants with owner role
  const { data: userTenants, error: userTenantsError } = await supabase
    .from('user_tenants')
    .select('role')
    .eq('user_id', user.id)
    .eq('role', 'owner')
    .eq('status', 'active')

  if (userTenantsError || !userTenants || userTenants.length === 0) {
    return false
  }

  return true
}

// Create new tenant
export async function createTenantAction(data: CreateTenantData) {
  const supabase = await createClient()
  
  const { data: { user }, error: authError } = await supabase.auth.getUser()
  if (authError || !user) {
    throw new Error('認証が必要です')
  }

  // Check if user is owner of any tenant
  const isOwner = await isUserOwnerOfAnyTenant()
  if (!isOwner) {
    throw new Error('テナントを作成する権限がありません。オーナーのみがテナントを作成できます。')
  }

  try {
    // Pre-generate the tenant id so we can insert without RETURNING.
    // tenants has RLS enabled; the creator is not yet a member, so an implicit
    // SELECT (via .select() / RETURNING) would fail the SELECT policy and
    // surface as "new row violates row-level security policy". Inserting
    // without RETURNING relies only on the INSERT WITH CHECK policy.
    const tenantId = crypto.randomUUID()

    const { error: tenantError } = await supabase
      .from('tenants')
      .insert({
        id: tenantId,
        name: data.name,
        slug: data.slug,
        description: data.description,
        max_members: 50
      })

    if (tenantError) {
      console.error('Insert tenant error:', tenantError)
      if (tenantError.code === '23505') {
        throw new Error('このスラッグは既に使用されています')
      }
      throw new Error('テナントの作成に失敗しました')
    }

    // Add the creator as owner in user_tenants table
    const { error: userTenantError } = await supabase
      .from('user_tenants')
      .insert({
        user_id: user.id,
        tenant_id: tenantId,
        email: user.email,
        role: 'owner',
        status: 'active',
        joined_at: new Date().toISOString()
      })

    if (userTenantError) {
      console.error('Error adding user to tenant:', userTenantError)
      // If user_tenants insertion fails, we should clean up the tenant
      await supabase.from('tenants').delete().eq('id', tenantId)
      throw new Error('ユーザーをテナントに追加できませんでした')
    }

    // Update user metadata with tenant name
    const { error: updateError } = await supabase.auth.updateUser({
      data: {
        tenant_name: data.name,
        tenant_id: tenantId
      }
    })

    if (updateError) {
      console.error('Error updating user metadata:', updateError)
      // Don't throw error here, tenant creation was successful
    }

    revalidatePath('/admin/tenants')
    // Return only serializable data (no Date objects) to avoid Server Components render error
    return { success: true }
  } catch (error) {
    console.error('Create tenant error:', error)
    throw error
  }
}

// Get tenants for current user
export async function getTenantsAction(): Promise<Tenant[]> {
  const supabase = await createClient()
  
  // Get current user
  const { data: { user }, error: authError } = await supabase.auth.getUser()
  if (authError || !user) {
    console.error('Authentication error:', authError)
    return []
  }

  // Get user's tenants from user_tenants table
  const { data: userTenants, error: userTenantsError } = await supabase
    .from('user_tenants')
    .select(`
      *,
      tenant:tenant_id (*)
    `)
    .eq('user_id', user.id)
    .eq('status', 'active')

  if (userTenantsError) {
    console.error('Get user tenants error:', userTenantsError)
    return []
  }

  if (!userTenants || userTenants.length === 0) {
    return []
  }

  // Extract tenant information from user_tenants and ensure serializable (no Date objects)
  const tenants = userTenants
    .map(ut => (ut as any).tenant)
    .filter(tenant => tenant !== null && tenant !== undefined) as Tenant[]

  return JSON.parse(JSON.stringify(tenants))
}

// Get tenant members
export async function getTenantMembersAction(tenantId: string) {
  const supabase = await createClient()
  
  const { data: { user }, error: authError } = await supabase.auth.getUser()
  if (authError || !user) {
    throw new Error('認証が必要です')
  }

  // Check if user has access to this tenant via user_metadata
  const userTenantId = user.user_metadata?.tenant_id

  if (userTenantId !== tenantId) {
    throw new Error('このテナントにアクセスする権限がありません')
  }

  // Get user's role in this tenant
  const { data: userTenant, error: userTenantError } = await supabase
    .from('user_tenants')
    .select('role')
    .eq('user_id', user.id)
    .eq('tenant_id', tenantId)
    .eq('status', 'active')
    .single()

  if (userTenantError || !userTenant) {
    throw new Error('このテナントにアクセスする権限がありません')
  }

  // Get members from user_tenants table
  const { data: members, error } = await supabase
    .from('user_tenants')
    .select()
    .eq('tenant_id', tenantId)
    .eq('status', 'active')
    .order('created_at', { ascending: false })

  if (error) {
    console.error('Get members error:', error)
    throw new Error('メンバーの取得に失敗しました')
  }

  return { members: members || [], currentUserRole: userTenant.role }
}

// Invite member to tenant
export async function inviteMemberAction(data: InviteMemberData) {
  const supabase = await createClient()
  
  const { data: { user }, error: authError } = await supabase.auth.getUser()
  if (authError || !user) {
    throw new Error('認証が必要です')
  }

  if (!TENANT_INVITABLE_ROLES.includes(data.role)) {
    throw new Error('無効なロールです')
  }

  // Check if user has permission to invite
  const { data: userTenant } = await supabase
    .from('user_tenants')
    .select('role')
    .eq('user_id', user.id)
    .eq('tenant_id', data.tenantId)
    .eq('status', 'active')
    .single()

  if (!userTenant || !['owner', 'admin'].includes(userTenant.role)) {
    throw new Error('メンバーを招待する権限がありません')
  }

  // Check if email is already a member
  const { data: existingMember } = await supabase
    .from('user_tenants')
    .select('id')
    .eq('tenant_id', data.tenantId)
    .eq('email', data.email)
    .eq('status', 'active')
    .single()

  if (existingMember) {
    throw new Error('このメールアドレスは既にメンバーです')
  }

  // Generate invitation token
  const token = Array.from(crypto.getRandomValues(new Uint8Array(32)))
    .map(b => b.toString(16).padStart(2, '0'))
    .join('')

  const { error } = await supabase
    .from('tenant_invitations')
    .insert({
      tenant_id: data.tenantId,
      email: data.email,
      role: data.role,
      token,
      invited_by: user.id,
      expires_at: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString()
    })

  if (error) {
    if (error.code === '23505') {
      throw new Error('このメールアドレスには既に招待を送信しています')
    }
    throw new Error('招待の送信に失敗しました')
  }

  revalidatePath(`/admin/tenants`)
  return { success: true }
}

// Update member role
export async function updateMemberRoleAction(data: UpdateMemberRoleData) {
  const supabase = await createClient()
  
  const { data: { user }, error: authError } = await supabase.auth.getUser()
  if (authError || !user) {
    throw new Error('認証が必要です')
  }

  if (!TENANT_MANAGEABLE_ROLES.includes(data.role)) {
    throw new Error('無効なロールです')
  }

  // Get current user's role in the tenant
  const { data: userTenant } = await supabase
    .from('user_tenants')
    .select(`
      role,
      tenant_id,
      user_tenants!inner(role, user_id)
    `)
    .eq('id', data.userTenantId)
    .single()

  if (!userTenant) {
    throw new Error('メンバーが見つかりません')
  }

  // Check if current user has permission
  const currentUserTenant = userTenant.user_tenants.find((ut: any) => ut.user_id === user.id)
  if (!currentUserTenant || !['owner', 'admin'].includes(currentUserTenant.role)) {
    throw new Error('ロールを変更する権限がありません')
  }

  // Check if trying to change own role
  if (currentUserTenant.user_id === user.id) {
    throw new Error('自分のロールは変更できません')
  }

  // Check if trying to change owner role without being owner
  if (userTenant.role === 'owner' && currentUserTenant.role !== 'owner') {
    throw new Error('オーナーのロールは変更できません')
  }

  // Check if this is the last owner
  if (userTenant.role === 'owner' && data.role !== 'owner') {
    const { data: ownerCount } = await supabase
      .from('user_tenants')
      .select('id', { count: 'exact' })
      .eq('tenant_id', userTenant.tenant_id)
      .eq('role', 'owner')
      .eq('status', 'active')

    if (ownerCount && ownerCount.length <= 1) {
      throw new Error('最後のオーナーは削除・降格できません')
    }
  }

  const { error } = await supabase
    .from('user_tenants')
    .update({ role: data.role })
    .eq('id', data.userTenantId)

  if (error) {
    throw new Error('ロールの更新に失敗しました')
  }

  revalidatePath(`/admin/tenants`)
  return { success: true }
}

// Remove member from tenant
export async function removeMemberAction(data: RemoveMemberData) {
  const supabase = await createClient()
  
  const { data: { user }, error: authError } = await supabase.auth.getUser()
  if (authError || !user) {
    throw new Error('認証が必要です')
  }

  // Get member info
  const { data: memberTenant } = await supabase
    .from('user_tenants')
    .select(`
      role,
      tenant_id,
      user_id,
      user_tenants!inner(role, user_id)
    `)
    .eq('id', data.userTenantId)
    .single()

  if (!memberTenant) {
    throw new Error('メンバーが見つかりません')
  }

  // Check if current user has permission
  const currentUserTenant = memberTenant.user_tenants.find((ut: any) => ut.user_id === user.id)
  if (!currentUserTenant || !['owner', 'admin'].includes(currentUserTenant.role)) {
    throw new Error('メンバーを削除する権限がありません')
  }

  // Check if trying to remove self
  if (memberTenant.user_id === user.id) {
    throw new Error('自分自身を削除することはできません')
  }

  // Check if trying to remove owner
  if (memberTenant.role === 'owner') {
    throw new Error('オーナーは削除できません')
  }

  const { error } = await supabase
    .from('user_tenants')
    .delete()
    .eq('id', data.userTenantId)

  if (error) {
    throw new Error('メンバーの削除に失敗しました')
  }

  revalidatePath(`/admin/tenants`)
  return { success: true }
}

// Accept invitation
export async function acceptInvitationAction(token: string) {
  const supabase = await createClient()
  
  const { data: { user }, error: authError } = await supabase.auth.getUser()
  if (authError || !user) {
    throw new Error('認証が必要です')
  }

  const { data, error } = await supabase.rpc('accept_tenant_invitation', {
    invitation_token: token
  })

  if (error) {
    throw new Error('招待の受け入れに失敗しました')
  }

  if (!data.success) {
    throw new Error(data.error || '招待の受け入れに失敗しました')
  }

  revalidatePath('/admin/tenants')
  return { success: true, tenantId: data.tenant_id }
}
