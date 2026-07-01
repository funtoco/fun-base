"use client"

import { FormEvent, useEffect, useMemo, useState } from "react"
import { useRouter } from "next/navigation"
import { AlertTriangle, ArrowLeft, CheckCircle, Save, Upload, X } from "lucide-react"
import { Alert, AlertDescription } from "@/components/ui/alert"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import { Textarea } from "@/components/ui/textarea"
import { FunBaseLoading } from "@/components/ui/funbase-loading"
import { useNavigationProgress } from "@/components/navigation-progress"
import { getCurrentUserTenants, getTenantOffices, type TenantOffice, type UserTenant } from "@/lib/supabase/tenants"

const workingStatusOptions = ["入社待ち", "在籍中", "退職", "内定取消", "内定辞退", "支援終了"]

type FormState = {
  name: string
  kana: string
  tenantId: string
  nationality: string
  dob: string
  employeeNumber: string
  workingStatus: string
  specificSkillField: string
  residenceCardNo: string
  residenceCardIssuedDate: string
  residenceCardExpiryDate: string
  email: string
  phone: string
  address: string
  company: string
  note: string
  employmentNotificationDate: string
  employmentChangeNotificationDate: string
  interviewDate: string
  jobOfferDate: string
  applicationNumber: string
  departureProcedureStatus: string
  entryConfirmedDate: string
  joiningDate: string
  insuranceNumber: string
  insuranceAcquiredDate: string
}

const initialForm: FormState = {
  name: "",
  kana: "",
  tenantId: "",
  nationality: "",
  dob: "",
  employeeNumber: "",
  workingStatus: "入社待ち",
  specificSkillField: "",
  residenceCardNo: "",
  residenceCardIssuedDate: "",
  residenceCardExpiryDate: "",
  email: "",
  phone: "",
  address: "",
  company: "",
  note: "",
  employmentNotificationDate: "",
  employmentChangeNotificationDate: "",
  interviewDate: "",
  jobOfferDate: "",
  applicationNumber: "",
  departureProcedureStatus: "",
  entryConfirmedDate: "",
  joiningDate: "",
  insuranceNumber: "",
  insuranceAcquiredDate: "",
}

export default function NewPersonPage() {
  const router = useRouter()
  const { startNavigation } = useNavigationProgress()
  const [form, setForm] = useState<FormState>(initialForm)
  const [tenants, setTenants] = useState<UserTenant[]>([])
  const [offices, setOffices] = useState<TenantOffice[]>([])
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [success, setSuccess] = useState(false)
  const [imageFile, setImageFile] = useState<File | null>(null)
  const [imagePreviewUrl, setImagePreviewUrl] = useState<string | null>(null)

  const selectedTenant = useMemo(
    () => tenants.find((tenant) => tenant.tenant_id === form.tenantId),
    [form.tenantId, tenants]
  )

  useEffect(() => {
    async function loadTenants() {
      try {
        setLoading(true)
        setError(null)
        const userTenants = await getCurrentUserTenants()
        setTenants(userTenants)
        if (userTenants.length === 1) {
          setForm((current) => ({ ...current, tenantId: userTenants[0].tenant_id }))
        }
      } catch (err) {
        console.error("Error loading tenants:", err)
        setError(err instanceof Error ? err.message : "会社情報の取得に失敗しました")
      } finally {
        setLoading(false)
      }
    }

    loadTenants()
  }, [])

  useEffect(() => {
    async function loadOffices() {
      if (!form.tenantId) {
        setOffices([])
        return
      }

      try {
        const tenantOffices = await getTenantOffices(form.tenantId)
        setOffices(tenantOffices)
      } catch (err) {
        console.error("Error loading offices:", err)
        setOffices([])
      }
    }

    loadOffices()
  }, [form.tenantId])

  useEffect(() => {
    if (!imageFile) {
      setImagePreviewUrl(null)
      return
    }

    const previewUrl = URL.createObjectURL(imageFile)
    setImagePreviewUrl(previewUrl)

    return () => {
      URL.revokeObjectURL(previewUrl)
    }
  }, [imageFile])

  const updateField = (field: keyof FormState, value: string) => {
    setForm((current) => ({ ...current, [field]: value }))
  }

  const updateImageFile = (file: File | null) => {
    setImageFile(file)
  }

  const handleSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    if (saving) return

    try {
      setSaving(true)
      setError(null)
      setSuccess(false)

      const requestBody = new FormData()
      Object.entries(form).forEach(([key, value]) => {
        requestBody.append(key, value)
      })
      if (imageFile) {
        requestBody.append("image", imageFile)
      }

      const response = await fetch("/api/people", {
        method: "POST",
        body: requestBody,
      })
      const result = await response.json()

      if (!response.ok) {
        throw new Error(result.error || "登録に失敗しました")
      }

      setSuccess(true)
      startNavigation()
      router.push(`/people/${result.person.id}`)
      router.refresh()
    } catch (err) {
      console.error("Create person error:", err)
      setError(err instanceof Error ? err.message : "登録に失敗しました")
      setSaving(false)
    }
  }

  if (loading) {
    return (
      <div className="p-6">
        <FunBaseLoading
          variant="inline"
          title="登録画面を読み込み中"
          description="会社情報を確認しています"
        />
      </div>
    )
  }

  return (
    <form onSubmit={handleSubmit} className="py-6 px-4 sm:px-8 space-y-6 max-w-4xl mx-auto">
      <div className="flex items-center justify-between gap-4">
        <div className="flex items-center gap-3">
          <Button
            type="button"
            variant="ghost"
            size="icon"
            onClick={() => {
              startNavigation()
              router.push("/people")
            }}
          >
            <ArrowLeft className="h-4 w-4" />
          </Button>
          <div>
            <h1 className="text-2xl font-bold">人材の新規登録</h1>
            <p className="text-sm text-muted-foreground mt-1">
              {selectedTenant?.tenant?.name ?? "登録先の会社"}に人材情報を追加します
            </p>
          </div>
        </div>
      </div>

      {error && (
        <Alert className="border-red-200 bg-red-50">
          <AlertTriangle className="h-4 w-4 text-red-600" />
          <AlertDescription className="text-red-800">{error}</AlertDescription>
        </Alert>
      )}

      {success && (
        <Alert className="border-green-200 bg-green-50">
          <CheckCircle className="h-4 w-4 text-green-600" />
          <AlertDescription className="text-green-800">正常に登録されました</AlertDescription>
        </Alert>
      )}

      <Card>
        <CardHeader>
          <CardTitle>基本情報</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid gap-2 sm:grid-cols-[150px_1fr] sm:items-start">
            <Label htmlFor="image" className="sm:text-right sm:pt-2">写真</Label>
            <div className="space-y-3">
              <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
                <div className="flex h-20 w-20 shrink-0 items-center justify-center overflow-hidden rounded-full border bg-muted">
                  {imagePreviewUrl ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img src={imagePreviewUrl} alt="選択中の写真" className="h-full w-full object-cover" />
                  ) : (
                    <Upload className="h-6 w-6 text-muted-foreground" />
                  )}
                </div>
                <div className="flex flex-wrap items-center gap-2">
                  <Input
                    id="image"
                    type="file"
                    accept="image/png,image/jpeg,image/webp,image/heic,image/heif"
                    onChange={(event) => updateImageFile(event.target.files?.[0] ?? null)}
                    disabled={saving}
                    className="max-w-sm"
                  />
                  {imageFile && (
                    <Button
                      type="button"
                      variant="outline"
                      size="icon"
                      onClick={() => updateImageFile(null)}
                      disabled={saving}
                    >
                      <X className="h-4 w-4" />
                    </Button>
                  )}
                </div>
              </div>
              <p className="text-xs text-muted-foreground">PNG、JPEG、WebP、HEIC、HEIF形式。5MBまで。</p>
            </div>
          </div>

          <div className="grid gap-2 sm:grid-cols-[150px_1fr] sm:items-center">
            <Label htmlFor="name" className="sm:text-right">氏名</Label>
            <Input
              id="name"
              value={form.name}
              onChange={(event) => updateField("name", event.target.value)}
              placeholder="氏名を入力"
              required
              disabled={saving}
            />
          </div>

          <div className="grid gap-2 sm:grid-cols-[150px_1fr] sm:items-center">
            <Label htmlFor="kana" className="sm:text-right">フリガナ</Label>
            <Input
              id="kana"
              value={form.kana}
              onChange={(event) => updateField("kana", event.target.value)}
              placeholder="フリガナを入力"
              disabled={saving}
            />
          </div>

          <div className="grid gap-2 sm:grid-cols-[150px_1fr] sm:items-center">
            <Label htmlFor="tenantId" className="sm:text-right">会社</Label>
            <Select
              value={form.tenantId}
              onValueChange={(value) => updateField("tenantId", value)}
              disabled={saving || tenants.length === 0}
            >
              <SelectTrigger id="tenantId" className="w-full">
                <SelectValue placeholder="会社を選択" />
              </SelectTrigger>
              <SelectContent>
                {tenants.map((tenant) => (
                  <SelectItem key={tenant.tenant_id} value={tenant.tenant_id}>
                    {tenant.tenant?.name ?? tenant.tenant_id}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div className="grid gap-2 sm:grid-cols-[150px_1fr] sm:items-center">
            <Label htmlFor="company" className="sm:text-right">所属先</Label>
            <Input
              id="company"
              value={form.company}
              onChange={(event) => updateField("company", event.target.value)}
              placeholder={offices.length > 0 ? "所属先を入力または下から選択" : "所属先を入力"}
              disabled={saving}
              list="tenant-offices"
            />
            <datalist id="tenant-offices">
              {offices.map((office) => (
                <option key={office.id} value={office.name} />
              ))}
            </datalist>
          </div>

          <div className="grid gap-2 sm:grid-cols-[150px_1fr] sm:items-center">
            <Label htmlFor="workingStatus" className="sm:text-right">ステータス</Label>
            <Select
              value={form.workingStatus}
              onValueChange={(value) => updateField("workingStatus", value)}
              disabled={saving}
            >
              <SelectTrigger id="workingStatus" className="w-full">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {workingStatusOptions.map((status) => (
                  <SelectItem key={status} value={status}>
                    {status}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div className="grid gap-2 sm:grid-cols-[150px_1fr] sm:items-center">
            <Label htmlFor="nationality" className="sm:text-right">国籍</Label>
            <Input
              id="nationality"
              value={form.nationality}
              onChange={(event) => updateField("nationality", event.target.value)}
              placeholder="国籍を入力"
              disabled={saving}
            />
          </div>

          <div className="grid gap-2 sm:grid-cols-[150px_1fr] sm:items-center">
            <Label htmlFor="dob" className="sm:text-right">生年月日</Label>
            <Input
              id="dob"
              type="date"
              value={form.dob}
              onChange={(event) => updateField("dob", event.target.value)}
              disabled={saving}
            />
          </div>

          <div className="grid gap-2 sm:grid-cols-[150px_1fr] sm:items-center">
            <Label htmlFor="employeeNumber" className="sm:text-right">従業員番号</Label>
            <Input
              id="employeeNumber"
              value={form.employeeNumber}
              onChange={(event) => updateField("employeeNumber", event.target.value)}
              placeholder="従業員番号を入力"
              disabled={saving}
            />
          </div>

          <div className="grid gap-2 sm:grid-cols-[150px_1fr] sm:items-center">
            <Label htmlFor="specificSkillField" className="sm:text-right">特定技能分野</Label>
            <Input
              id="specificSkillField"
              value={form.specificSkillField}
              onChange={(event) => updateField("specificSkillField", event.target.value)}
              placeholder="特定技能分野を入力"
              disabled={saving}
            />
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>在留カード情報</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid gap-2 sm:grid-cols-[150px_1fr] sm:items-center">
            <Label htmlFor="residenceCardNo" className="sm:text-right">在留カード番号</Label>
            <Input
              id="residenceCardNo"
              value={form.residenceCardNo}
              onChange={(event) => updateField("residenceCardNo", event.target.value)}
              placeholder="在留カード番号を入力"
              disabled={saving}
            />
          </div>

          <div className="grid gap-2 sm:grid-cols-[150px_1fr] sm:items-center">
            <Label htmlFor="residenceCardIssuedDate" className="sm:text-right">在留カード発行日</Label>
            <Input
              id="residenceCardIssuedDate"
              type="date"
              value={form.residenceCardIssuedDate}
              onChange={(event) => updateField("residenceCardIssuedDate", event.target.value)}
              disabled={saving}
            />
          </div>

          <div className="grid gap-2 sm:grid-cols-[150px_1fr] sm:items-center">
            <Label htmlFor="residenceCardExpiryDate" className="sm:text-right">在留カード有効期限</Label>
            <Input
              id="residenceCardExpiryDate"
              type="date"
              value={form.residenceCardExpiryDate}
              onChange={(event) => updateField("residenceCardExpiryDate", event.target.value)}
              disabled={saving}
            />
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>連絡先情報</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid gap-2 sm:grid-cols-[150px_1fr] sm:items-center">
            <Label htmlFor="email" className="sm:text-right">メールアドレス</Label>
            <Input
              id="email"
              type="email"
              value={form.email}
              onChange={(event) => updateField("email", event.target.value)}
              placeholder="メールアドレスを入力"
              disabled={saving}
            />
          </div>

          <div className="grid gap-2 sm:grid-cols-[150px_1fr] sm:items-center">
            <Label htmlFor="phone" className="sm:text-right">電話番号</Label>
            <Input
              id="phone"
              value={form.phone}
              onChange={(event) => updateField("phone", event.target.value)}
              placeholder="電話番号を入力"
              disabled={saving}
            />
          </div>

          <div className="grid gap-2 sm:grid-cols-[150px_1fr] sm:items-start">
            <Label htmlFor="address" className="sm:text-right sm:pt-2">住所</Label>
            <Textarea
              id="address"
              value={form.address}
              onChange={(event) => updateField("address", event.target.value)}
              placeholder="住所を入力"
              disabled={saving}
              rows={3}
            />
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>進捗情報</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid gap-2 sm:grid-cols-[150px_1fr] sm:items-center">
            <Label htmlFor="interviewDate" className="sm:text-right">面接日</Label>
            <Input
              id="interviewDate"
              type="date"
              value={form.interviewDate}
              onChange={(event) => updateField("interviewDate", event.target.value)}
              disabled={saving}
            />
          </div>

          <div className="grid gap-2 sm:grid-cols-[150px_1fr] sm:items-center">
            <Label htmlFor="jobOfferDate" className="sm:text-right">内定日</Label>
            <Input
              id="jobOfferDate"
              type="date"
              value={form.jobOfferDate}
              onChange={(event) => updateField("jobOfferDate", event.target.value)}
              disabled={saving}
            />
          </div>

          <div className="grid gap-2 sm:grid-cols-[150px_1fr] sm:items-center">
            <Label htmlFor="applicationNumber" className="sm:text-right">申請番号</Label>
            <Input
              id="applicationNumber"
              value={form.applicationNumber}
              onChange={(event) => updateField("applicationNumber", event.target.value)}
              placeholder="申請番号を入力"
              disabled={saving}
            />
          </div>

          <div className="grid gap-2 sm:grid-cols-[150px_1fr] sm:items-center">
            <Label htmlFor="departureProcedureStatus" className="sm:text-right">出国手続きの状況</Label>
            <Input
              id="departureProcedureStatus"
              value={form.departureProcedureStatus}
              onChange={(event) => updateField("departureProcedureStatus", event.target.value)}
              placeholder="出国手続きの状況を入力"
              disabled={saving}
            />
          </div>

          <div className="grid gap-2 sm:grid-cols-[150px_1fr] sm:items-center">
            <Label htmlFor="entryConfirmedDate" className="sm:text-right">入国確定日</Label>
            <Input
              id="entryConfirmedDate"
              type="date"
              value={form.entryConfirmedDate}
              onChange={(event) => updateField("entryConfirmedDate", event.target.value)}
              disabled={saving}
            />
          </div>

          <div className="grid gap-2 sm:grid-cols-[150px_1fr] sm:items-center">
            <Label htmlFor="joiningDate" className="sm:text-right">入社日</Label>
            <Input
              id="joiningDate"
              type="date"
              value={form.joiningDate}
              onChange={(event) => updateField("joiningDate", event.target.value)}
              disabled={saving}
            />
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>届出・保険情報</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid gap-2 sm:grid-cols-[150px_1fr] sm:items-center">
            <Label htmlFor="employmentNotificationDate" className="sm:text-right">雇用状況届出日</Label>
            <Input
              id="employmentNotificationDate"
              type="date"
              value={form.employmentNotificationDate}
              onChange={(event) => updateField("employmentNotificationDate", event.target.value)}
              disabled={saving}
            />
          </div>

          <div className="grid gap-2 sm:grid-cols-[150px_1fr] sm:items-center">
            <Label htmlFor="employmentChangeNotificationDate" className="sm:text-right">変更届出日</Label>
            <Input
              id="employmentChangeNotificationDate"
              type="date"
              value={form.employmentChangeNotificationDate}
              onChange={(event) => updateField("employmentChangeNotificationDate", event.target.value)}
              disabled={saving}
            />
          </div>

          <div className="grid gap-2 sm:grid-cols-[150px_1fr] sm:items-center">
            <Label htmlFor="insuranceNumber" className="sm:text-right">保険番号</Label>
            <Input
              id="insuranceNumber"
              value={form.insuranceNumber}
              onChange={(event) => updateField("insuranceNumber", event.target.value)}
              placeholder="保険番号を入力"
              disabled={saving}
            />
          </div>

          <div className="grid gap-2 sm:grid-cols-[150px_1fr] sm:items-center">
            <Label htmlFor="insuranceAcquiredDate" className="sm:text-right">保険取得日</Label>
            <Input
              id="insuranceAcquiredDate"
              type="date"
              value={form.insuranceAcquiredDate}
              onChange={(event) => updateField("insuranceAcquiredDate", event.target.value)}
              disabled={saving}
            />
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>メモ</CardTitle>
        </CardHeader>
        <CardContent>
          <Textarea
            id="note"
            value={form.note}
            onChange={(event) => updateField("note", event.target.value)}
            placeholder="メモを入力"
            disabled={saving}
            rows={4}
          />
        </CardContent>
      </Card>

      <div className="flex items-center justify-end gap-3">
        <Button
          type="button"
          variant="outline"
          onClick={() => {
            startNavigation()
            router.push("/people")
          }}
          disabled={saving}
        >
          キャンセル
        </Button>
        <Button type="submit" disabled={saving || tenants.length === 0} className="min-w-[120px] gap-2">
          <Save className="h-4 w-4" />
          {saving ? "登録中..." : "登録"}
        </Button>
      </div>
    </form>
  )
}
