import { NextRequest, NextResponse } from "next/server"
import { createClient } from "@/lib/supabase/server"
import { createAdminClient } from "@/lib/supabase/client"
import { TENANT_INVITABLE_ROLES } from "@/lib/tenant-access"

export async function POST(request: NextRequest) {
  try {
    // 認証チェック
    const supabase = await createClient()
    const { data: { user }, error: authError } = await supabase.auth.getUser()

    if (authError || !user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
    }

    // リクエストボディの取得
    const body = await request.json()
    const { email, password, tenantId, role } = body

    // バリデーション
    if (!email || !password || !tenantId || !role) {
      return NextResponse.json(
        { error: "Email, password, tenantId, and role are required" },
        { status: 400 }
      )
    }

    if (typeof role !== "string" || !TENANT_INVITABLE_ROLES.includes(role as any)) {
      return NextResponse.json(
        { error: "Invalid role" },
        { status: 400 }
      )
    }

    // パスワードの強度チェック
    if (password.length < 6) {
      return NextResponse.json(
        { error: "Password must be at least 6 characters" },
        { status: 400 }
      )
    }

    // オーナー権限のチェック（オーナーのみ実行可能）
    const { data: userTenant } = await supabase
      .from('user_tenants')
      .select('role')
      .eq('user_id', user.id)
      .eq('tenant_id', tenantId)
      .eq('status', 'active')
      .single()

    if (!userTenant || userTenant.role !== 'owner') {
      return NextResponse.json(
        { error: "Only owners can create users" },
        { status: 403 }
      )
    }

    // メールアドレスの存在チェック
    const adminSupabase = createAdminClient()
    
    // 既存ユーザーをチェック（auth.usersから）
    const { data: existingUser } = await adminSupabase.auth.admin.listUsers()
    const userExists = existingUser?.users?.some(u => u.email === email)

    if (userExists) {
      return NextResponse.json(
        { error: "This email address is already registered" },
        { status: 400 }
      )
    }

    // 新規ユーザーの作成
    const { data: newUser, error: createUserError } = await adminSupabase.auth.admin.createUser({
      email: email.toLowerCase().trim(),
      password: password,
      email_confirm: true, // メール確認をスキップ
      user_metadata: {
        created_by_admin: true,
        tenant_id: tenantId
      }
    })

    if (createUserError) {
      console.error('Error creating user:', createUserError)
      return NextResponse.json(
        { error: createUserError.message || "Failed to create user" },
        { status: 500 }
      )
    }

    if (!newUser.user) {
      return NextResponse.json(
        { error: "User creation failed" },
        { status: 500 }
      )
    }

    // テナントに追加
    const { error: userTenantError } = await supabase
      .from('user_tenants')
      .insert({
        user_id: newUser.user.id,
        tenant_id: tenantId,
        email: email.toLowerCase().trim(),
        role: role, // 'admin', 'member', 'guest'
        status: 'active',
        joined_at: new Date().toISOString()
      })

    if (userTenantError) {
      console.error('Error creating user_tenants record:', userTenantError)
      
      // ユーザー作成に失敗した場合はロールバック（ユーザーを削除）
      await adminSupabase.auth.admin.deleteUser(newUser.user.id)
      
      return NextResponse.json(
        { error: "Failed to add user to tenant" },
        { status: 500 }
      )
    }

    return NextResponse.json({ 
      success: true,
      user: {
        id: newUser.user.id,
        email: newUser.user.email
      },
      message: "User created and added to tenant successfully"
    })
  } catch (error) {
    console.error("Error creating user:", error)
    return NextResponse.json(
      { error: "Failed to create user" },
      { status: 500 }
    )
  }
}
