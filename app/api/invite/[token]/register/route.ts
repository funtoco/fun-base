import { NextRequest, NextResponse } from "next/server"
import { createAdminClient } from "@/lib/supabase/client"
import { isExistingAccountSignUpError } from "@/lib/supabase/auth-errors"
import { getInviteLinkInfo } from "@/lib/supabase/tenants"

async function authUserExistsByEmail(
  adminSupabase: ReturnType<typeof createAdminClient>,
  email: string
): Promise<boolean> {
  const targetEmail = email.trim().toLowerCase()
  let page = 1
  const perPage = 1000

  while (true) {
    const { data, error } = await adminSupabase.auth.admin.listUsers({ page, perPage })

    if (error) {
      throw error
    }

    if (data.users.some((user) => user.email?.trim().toLowerCase() === targetEmail)) {
      return true
    }

    if (!data.nextPage) {
      return false
    }

    page = data.nextPage
  }
}

export async function POST(
  request: NextRequest,
  { params }: { params: { token: string } }
) {
  try {
    const inviteResult = await getInviteLinkInfo(params.token)

    if (!inviteResult.success || !inviteResult.info) {
      return NextResponse.json({ error: inviteResult.error }, { status: 404 })
    }

    if (!inviteResult.info.isActive) {
      return NextResponse.json({ error: "この招待リンクは無効化されています" }, { status: 410 })
    }

    if (inviteResult.info.isExpired) {
      return NextResponse.json({ error: "この招待リンクは期限切れです" }, { status: 410 })
    }

    const invitedEmail = inviteResult.info.invitedEmail?.trim().toLowerCase()
    if (!invitedEmail) {
      return NextResponse.json({ error: "招待メールアドレスを確認できません" }, { status: 400 })
    }

    const body = await request.json()
    const email = typeof body.email === "string" ? body.email.trim().toLowerCase() : ""
    const password = typeof body.password === "string" ? body.password : ""

    if (email !== invitedEmail) {
      return NextResponse.json({ error: "招待されたメールアドレスで登録してください" }, { status: 400 })
    }

    const adminSupabase = createAdminClient()
    const userExists = await authUserExistsByEmail(adminSupabase, email)

    if (userExists) {
      return NextResponse.json({ error: "Account already exists" }, { status: 409 })
    }

    if (password.length < 8) {
      return NextResponse.json({ error: "パスワードは8文字以上で入力してください" }, { status: 400 })
    }

    const { error: createUserError } = await adminSupabase.auth.admin.createUser({
      email,
      password,
      email_confirm: true,
      user_metadata: {
        invited_via: "tenant_invite_link",
      },
    })

    if (createUserError) {
      if (isExistingAccountSignUpError(createUserError.message)) {
        return NextResponse.json({ error: "Account already exists" }, { status: 409 })
      }

      console.error("Error creating invited auth user:", createUserError)
      return NextResponse.json({ error: "アカウント作成に失敗しました" }, { status: 500 })
    }

    return NextResponse.json({ success: true })
  } catch (error) {
    console.error("Error in invite register POST:", error)
    return NextResponse.json({ error: "アカウント作成に失敗しました" }, { status: 500 })
  }
}
