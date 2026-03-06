"use client"

import { useState, useEffect, type FormEvent } from "react"
import { useParams, useRouter } from "next/navigation"
import { createClient } from "@/lib/supabase/client"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Alert, AlertDescription } from "@/components/ui/alert"
import { Badge } from "@/components/ui/badge"
import { CheckCircle, XCircle, Loader2, UserPlus, Building2 } from "lucide-react"

type PageStatus =
  | "loadingInvite"
  | "inviteInvalid"
  | "notLoggedIn"
  | "accepting"
  | "success"
  | "error"
  | "signupSent"

interface InviteInfo {
  tenantName: string
  defaultRole: string
}

const roleLabel: Record<string, string> = {
  admin: "Admin（管理者）",
  member: "Member（一般）",
  guest: "Guest（閲覧のみ）",
}

export default function InviteAcceptancePage() {
  const params = useParams()
  const router = useRouter()
  const token = params.token as string
  const supabase = createClient()

  const [status, setStatus] = useState<PageStatus>("loadingInvite")
  const [inviteInfo, setInviteInfo] = useState<InviteInfo | null>(null)
  const [inviteError, setInviteError] = useState("")
  const [acceptError, setAcceptError] = useState("")

  // Auth form state
  const [authMode, setAuthMode] = useState<"login" | "register">("login")
  const [email, setEmail] = useState("")
  const [password, setPassword] = useState("")
  const [authLoading, setAuthLoading] = useState(false)
  const [authError, setAuthError] = useState("")

  // Step 1: fetch invite info and check login state
  useEffect(() => {
    const init = async () => {
      try {
        // Fetch invite info (public endpoint)
        const res = await fetch(`/api/invite/${token}`)
        const data = await res.json()

        if (!res.ok) {
          setInviteError(data.error || "招待リンクが見つかりません")
          setStatus("inviteInvalid")
          return
        }

        setInviteInfo({ tenantName: data.tenantName, defaultRole: data.defaultRole })

        // Check if user is logged in
        const { data: { user } } = await supabase.auth.getUser()

        if (user) {
          setStatus("accepting")
          await acceptInvite()
        } else {
          setStatus("notLoggedIn")
        }
      } catch (error) {
        console.error("Error initializing invite page:", error)
        setInviteError("招待情報の取得に失敗しました")
        setStatus("inviteInvalid")
      }
    }

    init()
  }, [token])

  const acceptInvite = async () => {
    try {
      setStatus("accepting")
      const res = await fetch(`/api/invite/${token}`, { method: "POST" })
      const data = await res.json()

      if (res.ok && data.success) {
        setStatus("success")
      } else {
        setAcceptError(data.error || "招待の受け入れに失敗しました")
        setStatus("error")
      }
    } catch (error) {
      console.error("Error accepting invite:", error)
      setAcceptError(error instanceof Error ? error.message : "招待の受け入れに失敗しました")
      setStatus("error")
    }
  }

  const handleLogin = async (e: FormEvent) => {
    e.preventDefault()
    setAuthLoading(true)
    setAuthError("")

    try {
      const { error } = await supabase.auth.signInWithPassword({ email, password })

      if (error) {
        setAuthError("ログインに失敗しました。メールアドレスとパスワードを確認してください。")
        return
      }

      // Logged in successfully → accept invite
      await acceptInvite()
    } catch (error) {
      console.error("Error during login:", error)
      setAuthError("ログイン中にエラーが発生しました。")
    } finally {
      setAuthLoading(false)
    }
  }

  const handleRegister = async (e: FormEvent) => {
    e.preventDefault()
    setAuthLoading(true)
    setAuthError("")

    const origin = window.location.origin
    // After email confirmation, redirect back to this invite page
    const emailRedirectTo = `${origin}/auth/callback?next=/invite/${token}`

    try {
      const { data, error } = await supabase.auth.signUp({
        email,
        password,
        options: { emailRedirectTo },
      })

      if (error) {
        setAuthError("アカウント作成に失敗しました。メールアドレスを確認してください。")
        return
      }

      if (data.session) {
        await acceptInvite()
        return
      }

      setStatus("signupSent")
    } catch (error) {
      console.error("Error during signup:", error)
      setAuthError("アカウント作成中にエラーが発生しました。")
    } finally {
      setAuthLoading(false)
    }
  }

  // --- Render ---

  if (status === "loadingInvite" || status === "accepting") {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gray-50">
        <Card className="w-full max-w-md">
          <CardContent className="pt-6">
            <div className="flex flex-col items-center space-y-4">
              <Loader2 className="h-8 w-8 animate-spin text-blue-600" />
              <p className="text-center text-muted-foreground">
                {status === "loadingInvite" ? "招待情報を確認中..." : "参加処理中..."}
              </p>
            </div>
          </CardContent>
        </Card>
      </div>
    )
  }

  if (status === "inviteInvalid") {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gray-50">
        <Card className="w-full max-w-md">
          <CardHeader className="text-center">
            <XCircle className="h-12 w-12 text-red-500 mx-auto mb-2" />
            <CardTitle>招待リンクが無効です</CardTitle>
          </CardHeader>
          <CardContent className="text-center">
            <p className="text-muted-foreground">{inviteError}</p>
          </CardContent>
        </Card>
      </div>
    )
  }

  if (status === "success") {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gray-50">
        <Card className="w-full max-w-md">
          <CardHeader className="text-center">
            <CheckCircle className="h-12 w-12 text-green-500 mx-auto mb-2" />
            <CardTitle>参加完了</CardTitle>
            <CardDescription>
              {inviteInfo?.tenantName} に参加しました！
            </CardDescription>
          </CardHeader>
          <CardContent className="text-center">
            <Button className="w-full" onClick={() => router.push("/people")}>
              ダッシュボードへ
            </Button>
          </CardContent>
        </Card>
      </div>
    )
  }

  if (status === "error") {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gray-50">
        <Card className="w-full max-w-md">
          <CardHeader className="text-center">
            <XCircle className="h-12 w-12 text-red-500 mx-auto mb-2" />
            <CardTitle>参加に失敗しました</CardTitle>
          </CardHeader>
          <CardContent className="text-center space-y-4">
            <p className="text-muted-foreground">{acceptError}</p>
            <Button variant="outline" className="w-full" onClick={() => router.push("/people")}>
              ダッシュボードへ
            </Button>
          </CardContent>
        </Card>
      </div>
    )
  }

  if (status === "signupSent") {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gray-50">
        <Card className="w-full max-w-md">
          <CardHeader className="text-center">
            <CheckCircle className="h-12 w-12 text-blue-500 mx-auto mb-2" />
            <CardTitle>確認メールを送信しました</CardTitle>
            <CardDescription>
              {email} に確認メールを送りました。<br />
              メール内のリンクをクリックすると、自動的に {inviteInfo?.tenantName} に参加します。
            </CardDescription>
          </CardHeader>
        </Card>
      </div>
    )
  }

  // status === "notLoggedIn"
  return (
    <div className="min-h-screen flex items-center justify-center bg-gray-50 p-4">
      <Card className="w-full max-w-md">
        <CardHeader className="text-center">
          <UserPlus className="h-8 w-8 mx-auto mb-2 text-blue-600" />
          <CardTitle>テナントへの招待</CardTitle>
          {inviteInfo && (
            <CardDescription className="space-y-1">
              <span className="flex items-center justify-center gap-1 font-medium text-foreground">
                <Building2 className="h-4 w-4" />
                {inviteInfo.tenantName}
              </span>
              <span>
                ロール:{" "}
                <Badge variant="outline">{roleLabel[inviteInfo.defaultRole] ?? inviteInfo.defaultRole}</Badge>
              </span>
            </CardDescription>
          )}
        </CardHeader>
        <CardContent>
          {/* Mode tabs */}
          <div className="flex rounded-lg border mb-4 overflow-hidden">
            <button
              type="button"
              className={`flex-1 py-2 text-sm font-medium transition-colors ${
                authMode === "login" ? "bg-primary text-primary-foreground" : "bg-background hover:bg-muted"
              }`}
              onClick={() => { setAuthMode("login"); setAuthError("") }}
            >
              ログイン
            </button>
            <button
              type="button"
              className={`flex-1 py-2 text-sm font-medium transition-colors ${
                authMode === "register" ? "bg-primary text-primary-foreground" : "bg-background hover:bg-muted"
              }`}
              onClick={() => { setAuthMode("register"); setAuthError("") }}
            >
              新規登録
            </button>
          </div>

          <form onSubmit={authMode === "login" ? handleLogin : handleRegister} className="space-y-4">
            {authError && (
              <Alert variant="destructive">
                <AlertDescription>{authError}</AlertDescription>
              </Alert>
            )}

            <div className="space-y-2">
              <Label htmlFor="email">メールアドレス</Label>
              <Input
                id="email"
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                required
                disabled={authLoading}
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="password">パスワード</Label>
              <Input
                id="password"
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                required
                disabled={authLoading}
                minLength={authMode === "register" ? 6 : undefined}
              />
              {authMode === "register" && (
                <p className="text-xs text-muted-foreground">6文字以上で入力してください</p>
              )}
            </div>

            <Button type="submit" className="w-full" disabled={authLoading}>
              {authLoading
                ? authMode === "login" ? "ログイン中..." : "登録中..."
                : authMode === "login" ? "ログインして参加" : "アカウントを作成して参加"}
            </Button>
          </form>
        </CardContent>
      </Card>
    </div>
  )
}
