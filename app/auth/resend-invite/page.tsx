"use client"

import Link from "next/link"
import { ArrowLeft, KeyRound, MailWarning } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"

export default function ResendInvitePage() {
  return (
    <div className="min-h-screen flex items-center justify-center bg-gray-50 p-4">
      <Card className="w-full max-w-lg">
        <CardHeader className="text-center">
          <MailWarning className="mx-auto h-12 w-12 text-amber-500 mb-4" />
          <CardTitle>招待メール再送のご案内</CardTitle>
          <CardDescription>
            この画面から招待メールを直接再送することはできません。
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="rounded-lg border bg-white p-4 text-sm text-muted-foreground space-y-3">
            <p>
              招待リンクが無効になった場合は、所属企業の担当者または Funtoco 担当者へ
              招待メールの再送をご依頼ください。
            </p>
            <p>
              すでに一度ログイン設定を完了している場合は、招待メールの再送ではなく
              パスワード再設定をご利用ください。
            </p>
          </div>

          <Button asChild className="w-full">
            <Link href="/auth/reset-password">
              <KeyRound className="h-4 w-4 mr-2" />
              パスワード再設定へ
            </Link>
          </Button>

          <div className="text-center">
            <Link
              href="/login"
              className="text-sm text-blue-600 hover:text-blue-800 inline-flex items-center"
            >
              <ArrowLeft className="h-4 w-4 mr-1" />
              ログインページに戻る
            </Link>
          </div>
        </CardContent>
      </Card>
    </div>
  )
}
