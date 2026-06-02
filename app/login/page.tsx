"use client"

import type React from "react"

import { useState } from "react"
import { useAuth } from "@/contexts/auth-context"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Alert, AlertDescription } from "@/components/ui/alert"
import { getSafeRedirectPath } from "@/lib/auth-route-guards"
import Link from "next/link"
import Image from "next/image"
import { useSearchParams } from "next/navigation"
import { BellRing, MessageSquareText, TrendingUp } from "lucide-react"

const serviceHighlights = [
  {
    label: "進捗を見える化",
    icon: TrendingUp,
  },
  {
    label: "面談記録を一元管理",
    icon: MessageSquareText,
  },
  {
    label: "対応漏れに早く気づく",
    icon: BellRing,
  },
]

export default function LoginPage() {
  const [email, setEmail] = useState("")
  const [password, setPassword] = useState("")
  const [error, setError] = useState("")
  const [loading, setLoading] = useState(false)
  const { signIn } = useAuth()
  const searchParams = useSearchParams()

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setLoading(true)
    setError("")

    const { error } = await signIn(email, password, getSafeRedirectPath(searchParams.get("next")))

    if (error) {
      setError("ログインに失敗しました。メールアドレスとパスワードを確認してください。")
    }

    setLoading(false)
  }

  return (
    <div className="min-h-screen bg-slate-50 px-4 py-10 text-slate-900">
      <div className="mx-auto grid min-h-[calc(100vh-5rem)] w-full max-w-6xl items-center gap-10 lg:grid-cols-[1fr_448px] lg:gap-16">
        <section className="mx-auto w-full max-w-2xl text-center lg:mx-0 lg:text-left">
          <p className="text-sm font-semibold text-primary">外国人材の育成・定着支援プラットフォーム</p>
          <h1 className="mt-4 text-3xl font-bold leading-tight tracking-normal text-slate-950 sm:text-4xl lg:text-5xl">
            外国人材の成長と定着を、ひとつの画面で。
          </h1>
          <p className="mt-5 max-w-xl text-base leading-8 text-slate-600 lg:text-lg">
            FunBaseは、進捗・面談記録・在留資格の情報をつなぎ、本人・支援者・企業が同じ目線で支援を進められるサービスです。
          </p>
          <div className="mt-8 flex flex-wrap justify-center gap-3 lg:justify-start">
            {serviceHighlights.map(({ label, icon: Icon }) => (
              <div
                key={label}
                className="inline-flex min-h-11 items-center gap-2 rounded-full border border-primary/20 bg-white px-4 text-sm font-medium text-slate-800 shadow-sm shadow-primary/10"
              >
                <Icon className="h-4 w-4 text-primary" aria-hidden="true" />
                <span>{label}</span>
              </div>
            ))}
          </div>
        </section>

        <Card className="mx-auto w-full max-w-md rounded-2xl border-slate-200 bg-white shadow-sm">
          <CardHeader className="text-center">
            <div className="flex justify-center mb-4">
              <Image src="/funstudio-logo.webp" alt="FunBase" width={120} height={32} className="h-8 w-auto" />
            </div>
            <CardTitle className="text-2xl">ログイン</CardTitle>
            <CardDescription className="mx-auto max-w-xs leading-relaxed">
              アカウント情報を入力してログインしてください
            </CardDescription>
          </CardHeader>
          <CardContent>
            <form onSubmit={handleSubmit} className="space-y-4">
              {error && (
                <Alert variant="destructive">
                  <AlertDescription>{error}</AlertDescription>
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
                  disabled={loading}
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
                  disabled={loading}
                />
              </div>

              <Button type="submit" className="w-full" disabled={loading}>
                {loading ? "ログイン中..." : "ログイン"}
              </Button>
            </form>

            <div className="mt-4 text-center text-sm">
              <Link href="/auth/reset-password" className="text-primary hover:underline">
                パスワードをお忘れの方はこちら
              </Link>
            </div>

            <div className="mt-4 text-center text-sm">
              アカウントをお持ちでない方は{" "}
              <Link href="/signup" className="text-primary hover:underline">
                新規登録
              </Link>
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  )
}
