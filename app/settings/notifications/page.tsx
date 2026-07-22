"use client"

import { useEffect, useState } from "react"
import { useRouter } from "next/navigation"
import { ArrowLeft, Bell } from "lucide-react"

import { Button } from "@/components/ui/button"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Label } from "@/components/ui/label"
import { Switch } from "@/components/ui/switch"
import { useAuth } from "@/contexts/auth-context"
import { useToast } from "@/lib/hooks/use-toast"
import { INTERVIEW_RECORD_EMAIL_NOTIFICATION_TYPE } from "@/lib/notifications/interview-record-notifications"
import {
  getNotificationPreferences,
  updateNotificationPreference,
} from "@/lib/supabase/notification-preferences"

export default function NotificationSettingsPage() {
  const router = useRouter()
  const { user, loading: authLoading } = useAuth()
  const { toast } = useToast()
  const [interviewEmailEnabled, setInterviewEmailEnabled] = useState(false)
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)

  useEffect(() => {
    if (authLoading) return
    if (!user) {
      router.replace("/login")
      return
    }

    const load = async () => {
      try {
        const preferences = await getNotificationPreferences()
        const interviewPreference = preferences.find(
          (preference) => preference.notificationType === INTERVIEW_RECORD_EMAIL_NOTIFICATION_TYPE
        )
        setInterviewEmailEnabled(interviewPreference?.enabled ?? false)
      } catch (error) {
        console.error("Failed to load notification settings:", error)
        toast({ title: "通知設定の読み込みに失敗しました", variant: "destructive" })
      } finally {
        setLoading(false)
      }
    }

    load()
  }, [authLoading, router, toast, user])

  const handleInterviewEmailChange = async (enabled: boolean) => {
    const previous = interviewEmailEnabled
    setInterviewEmailEnabled(enabled)
    setSaving(true)

    try {
      await updateNotificationPreference(INTERVIEW_RECORD_EMAIL_NOTIFICATION_TYPE, enabled)
      toast({ title: enabled ? "面談通知メールを有効にしました" : "面談通知メールを停止しました" })
    } catch (error) {
      console.error("Failed to update notification settings:", error)
      setInterviewEmailEnabled(previous)
      toast({ title: "通知設定の保存に失敗しました", variant: "destructive" })
    } finally {
      setSaving(false)
    }
  }

  return (
    <div className="container mx-auto max-w-3xl px-4 py-6">
      <div className="mb-6 flex items-center gap-4">
        <Button variant="ghost" size="icon" onClick={() => router.back()}>
          <ArrowLeft className="h-5 w-5" />
        </Button>
        <div>
          <h1 className="flex items-center gap-2 text-2xl font-bold">
            <Bell className="h-6 w-6" />
            通知設定
          </h1>
          <p className="mt-1 text-sm text-muted-foreground">
            FunBaseから届くメール通知を設定します
          </p>
        </div>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>面談通知</CardTitle>
          <CardDescription>
            新しい面談記録がFunBaseに追加されたときのメール通知です。
          </CardDescription>
        </CardHeader>
        <CardContent>
          <div className="flex items-center justify-between gap-4 rounded-lg border p-4">
            <div className="space-y-1">
              <Label htmlFor="interview-email-notification" className="font-medium">
                面談記録の新着メールを受け取る
              </Label>
              <p className="text-sm text-muted-foreground">
                オフにしても、FunBase内のお知らせには表示されます。
              </p>
            </div>
            <Switch
              id="interview-email-notification"
              checked={interviewEmailEnabled}
              disabled={loading || saving}
              onCheckedChange={handleInterviewEmailChange}
            />
          </div>
        </CardContent>
      </Card>
    </div>
  )
}
