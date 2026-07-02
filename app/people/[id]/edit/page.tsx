"use client"

import { useState, useEffect } from 'react'
import { useRouter, useParams } from 'next/navigation'
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Textarea } from "@/components/ui/textarea"
import { Alert, AlertDescription } from "@/components/ui/alert"
import { Badge } from "@/components/ui/badge"
import { FunBaseLoading } from "@/components/ui/funbase-loading"
import { PersonAvatar } from "@/components/ui/person-avatar"
import { useNavigationProgress } from "@/components/navigation-progress"
import { ArrowLeft, Save, AlertTriangle, CheckCircle, Upload, X } from "lucide-react"
import { getPersonById } from "@/lib/supabase/people"
import { isManualPersonId } from "@/lib/person-source"
import type { Person } from "@/lib/models"

export default function EditPersonPage() {
  const router = useRouter()
  const params = useParams()
  const { startNavigation } = useNavigationProgress()
  const id = params.id as string

  const [person, setPerson] = useState<Person | null>(null)
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [success, setSuccess] = useState(false)

  // フォーム状態
  const [name, setName] = useState('')
  const [kana, setKana] = useState('')
  const [nationality, setNationality] = useState('')
  const [dob, setDob] = useState('')
  const [specificSkillField, setSpecificSkillField] = useState('')
  const [phone, setPhone] = useState('')
  const [workingStatus, setWorkingStatus] = useState('')
  const [residenceCardNo, setResidenceCardNo] = useState('')
  const [residenceCardExpiryDate, setResidenceCardExpiryDate] = useState('')
  const [residenceCardIssuedDate, setResidenceCardIssuedDate] = useState('')
  const [email, setEmail] = useState('')
  const [address, setAddress] = useState('')
  const [company, setCompany] = useState('')
  const [note, setNote] = useState('')
  const [employeeNumber, setEmployeeNumber] = useState('')
  const [employmentNotificationDate, setEmploymentNotificationDate] = useState('')
  const [employmentChangeNotificationDate, setEmploymentChangeNotificationDate] = useState('')
  // 入社前
  const [interviewDate, setInterviewDate] = useState('')
  const [jobOfferDate, setJobOfferDate] = useState('')
  const [applicationNumber, setApplicationNumber] = useState('')
  const [departureProcedureStatus, setDepartureProcedureStatus] = useState('')
  const [entryConfirmedDate, setEntryConfirmedDate] = useState('')
  // 入社後
  const [joiningDate, setJoiningDate] = useState('')
  // 社会保険
  const [insuranceNumber, setInsuranceNumber] = useState('')
  const [insuranceAcquiredDate, setInsuranceAcquiredDate] = useState('')
  const [imageFile, setImageFile] = useState<File | null>(null)
  const [imagePreviewUrl, setImagePreviewUrl] = useState<string | null>(null)

  // 初期データ取得
  useEffect(() => {
    async function fetchPerson() {
      try {
        setLoading(true)
        const data = await getPersonById(id)
        if (!data) {
          setError('人物が見つかりませんでした')
          return
        }
        setPerson(data)
        setName(data.name || '')
        setKana(data.kana || '')
        setNationality(data.nationality || '')
        setDob(data.dob || '')
        setSpecificSkillField(data.specificSkillField || '')
        setPhone(data.phone || '')
        setWorkingStatus(data.workingStatus || '')
        setResidenceCardNo(data.residenceCardNo || '')
        setResidenceCardExpiryDate(data.residenceCardExpiryDate || '')
        setResidenceCardIssuedDate(data.residenceCardIssuedDate || '')
        setEmail(data.email || '')
        setAddress(data.address || '')
        setCompany(data.company || '')
        setNote(data.note || '')
        setEmployeeNumber(data.employeeNumber || '')
        setEmploymentNotificationDate(data.employmentNotificationDate || '')
        setEmploymentChangeNotificationDate(data.employmentChangeNotificationDate || '')
        setInterviewDate(data.interviewDate || '')
        setJobOfferDate(data.jobOfferDate || '')
        setApplicationNumber(data.applicationNumber || '')
        setDepartureProcedureStatus(data.departureProcedureStatus || '')
        setEntryConfirmedDate(data.entryConfirmedDate || '')
        setJoiningDate(data.joiningDate || '')
        setInsuranceNumber(data.insuranceNumber || '')
        setInsuranceAcquiredDate(data.insuranceAcquiredDate || '')
      } catch (err) {
        console.error('Error fetching person:', err)
        setError(err instanceof Error ? err.message : 'データの取得に失敗しました')
      } finally {
        setLoading(false)
      }
    }
    fetchPerson()
  }, [id])

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

  // 保存処理
  const handleSave = async () => {
    // 連打防止：既に保存中の場合は何もしない
    if (saving) {
      return
    }

    try {
      setSaving(true)
      setError(null)
      setSuccess(false)

      const isManual = isManualPersonId(id)
      const requestBody = isManual ? new FormData() : null
      if (requestBody) {
        const values: Record<string, string> = {
          name,
          kana,
          nationality,
          dob,
          specificSkillField,
          phone,
          employeeNumber,
          workingStatus,
          residenceCardNo,
          residenceCardExpiryDate,
          residenceCardIssuedDate,
          email,
          address,
          company,
          note,
          employmentNotificationDate,
          employmentChangeNotificationDate,
          interviewDate,
          jobOfferDate,
          applicationNumber,
          departureProcedureStatus,
          entryConfirmedDate,
          joiningDate,
          insuranceNumber,
          insuranceAcquiredDate,
        }
        Object.entries(values).forEach(([key, value]) => requestBody.append(key, value))
        if (imageFile) {
          requestBody.append('image', imageFile)
        }
      }

      const response = await fetch(`/api/people/${id}`, {
        method: 'PUT',
        ...(requestBody
          ? { body: requestBody }
          : {
              headers: {
                'Content-Type': 'application/json',
              },
              body: JSON.stringify({
                employeeNumber: employeeNumber.trim() || null,
                employmentNotificationDate: employmentNotificationDate || null,
                employmentChangeNotificationDate: employmentChangeNotificationDate || null,
                interviewDate: interviewDate || null,
                jobOfferDate: jobOfferDate || null,
                applicationNumber: applicationNumber.trim() || null,
                departureProcedureStatus: departureProcedureStatus.trim() || null,
                entryConfirmedDate: entryConfirmedDate || null,
                joiningDate: joiningDate || null,
                insuranceNumber: insuranceNumber.trim() || null,
                insuranceAcquiredDate: insuranceAcquiredDate || null,
              }),
            }),
      })

      if (!response.ok) {
        const errorData = await response.json()
        throw new Error(errorData.error || '更新に失敗しました')
      }

      setSuccess(true)
      // 1秒後に詳細ページにリダイレクト（キャッシュをリフレッシュ）
      setTimeout(() => {
        // 遷移時にタイムスタンプを追加してキャッシュを回避
        const timestamp = Date.now()
        window.location.href = `/people/${id}?_t=${timestamp}`
      }, 1000)
    } catch (err) {
      console.error('Update error:', err)
      setError(err instanceof Error ? err.message : '更新に失敗しました')
      setSaving(false) // エラー時のみ保存状態を解除
    }
  }

  if (loading) {
    return (
      <div className="p-6">
        <FunBaseLoading
          variant="inline"
          title="編集画面を読み込み中"
          description="人材情報をフォームに反映しています"
        />
      </div>
    )
  }

  if (error && !person) {
    return (
      <div className="p-6">
        <Alert className="border-red-200 bg-red-50">
          <AlertTriangle className="h-4 w-4 text-red-600" />
          <AlertDescription className="text-red-800">
            {error}
          </AlertDescription>
        </Alert>
      </div>
    )
  }

  if (!person) {
    return null
  }

  const isManual = isManualPersonId(person.id)

  return (
    <div className="py-6 px-8 space-y-6 max-w-4xl mx-auto">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-4">
          <Button
            variant="ghost"
            size="icon"
            onClick={() => {
              startNavigation()
              router.push(`/people/${id}`)
            }}
          >
            <ArrowLeft className="h-4 w-4" />
          </Button>
          <div>
            <h1 className="text-2xl font-bold">人物情報の編集</h1>
            <div className="mt-1 flex items-center gap-2">
              <p className="text-muted-foreground">{person.name} さんの情報を編集</p>
              {isManual && (
                <Badge variant="outline" className="border-amber-300 bg-amber-50 text-amber-700">
                  手動登録
                </Badge>
              )}
            </div>
          </div>
        </div>
      </div>

      {/* Alerts */}
      {error && (
        <Alert className="border-red-200 bg-red-50">
          <AlertTriangle className="h-4 w-4 text-red-600" />
          <AlertDescription className="text-red-800">
            {error}
          </AlertDescription>
        </Alert>
      )}

      {success && (
        <Alert className="border-green-200 bg-green-50">
          <CheckCircle className="h-4 w-4 text-green-600" />
          <AlertDescription className="text-green-800">
            正常に更新されました
          </AlertDescription>
        </Alert>
      )}

      {/* Form */}
      <div className="space-y-6">
        {isManual && (
          <Card>
            <CardHeader>
              <CardTitle>写真</CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="grid grid-cols-[150px_1fr] gap-4 items-start">
                <Label htmlFor="image" className="text-right pt-2">写真</Label>
                <div className="space-y-3">
                  <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
                    <div className="flex h-20 w-20 shrink-0 items-center justify-center overflow-hidden rounded-full border bg-muted">
                      {imagePreviewUrl ? (
                        // eslint-disable-next-line @next/next/no-img-element
                        <img src={imagePreviewUrl} alt="選択中の写真" className="h-full w-full object-cover" />
                      ) : person.imagePath ? (
                        <PersonAvatar name={name || person.name} imagePath={person.imagePath} size="xl" />
                      ) : (
                        <Upload className="h-6 w-6 text-muted-foreground" />
                      )}
                    </div>
                    <div className="flex flex-wrap items-center gap-2">
                      <Input
                        id="image"
                        type="file"
                        accept="image/png,image/jpeg,image/webp,image/heic,image/heif"
                        onChange={(event) => setImageFile(event.target.files?.[0] ?? null)}
                        disabled={saving}
                        className="max-w-sm"
                      />
                      {imageFile && (
                        <Button
                          type="button"
                          variant="outline"
                          size="icon"
                          onClick={() => setImageFile(null)}
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
            </CardContent>
          </Card>
        )}

        {/* 基本情報 */}
        <Card>
          <CardHeader>
            <CardTitle>基本情報</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="grid grid-cols-[150px_1fr] gap-4 items-center">
              <Label htmlFor="name" className="text-right">氏名</Label>
              <Input
                id="name"
                value={name}
                onChange={(e) => setName(e.target.value)}
                disabled={!isManual || saving}
              />
            </div>

            <div className="grid grid-cols-[150px_1fr] gap-4 items-center">
              <Label htmlFor="kana" className="text-right">フリガナ</Label>
              <Input
                id="kana"
                value={kana}
                onChange={(e) => setKana(e.target.value)}
                disabled={!isManual || saving}
              />
            </div>

            <div className="grid grid-cols-[150px_1fr] gap-4 items-center">
              <Label htmlFor="dob" className="text-right">生年月日</Label>
              <Input
                id="dob"
                type="date"
                value={dob}
                onChange={(e) => setDob(e.target.value)}
                disabled={!isManual || saving}
                className="w-full"
              />
            </div>

            <div className="grid grid-cols-[150px_1fr] gap-4 items-center">
              <Label htmlFor="employeeNumber" className="text-right">従業員番号</Label>
              <div className="flex-1">
                <Input
                  id="employeeNumber"
                  value={employeeNumber}
                  onChange={(e) => setEmployeeNumber(e.target.value)}
                  placeholder="従業員番号を入力"
                  disabled={saving}
                />
              </div>
            </div>

            <div className="grid grid-cols-[150px_1fr] gap-4 items-center">
              <Label htmlFor="nationality" className="text-right">国籍</Label>
              <Input
                id="nationality"
                value={nationality}
                onChange={(e) => setNationality(e.target.value)}
                disabled={!isManual || saving}
              />
            </div>

            <div className="grid grid-cols-[150px_1fr] gap-4 items-center">
              <Label htmlFor="workingStatus" className="text-right">ステータス</Label>
              <Input
                id="workingStatus"
                value={workingStatus}
                onChange={(e) => setWorkingStatus(e.target.value)}
                disabled={!isManual || saving}
              />
            </div>

            {(isManual || person.specificSkillField) && (
              <div className="grid grid-cols-[150px_1fr] gap-4 items-center">
                <Label htmlFor="specificSkillField" className="text-right">特定技能分野</Label>
                <Input
                  id="specificSkillField"
                  value={specificSkillField}
                  onChange={(e) => setSpecificSkillField(e.target.value)}
                  disabled={!isManual || saving}
                />
              </div>
            )}
          </CardContent>
        </Card>

        {/* 在留カード情報 */}
        <Card>
          <CardHeader>
            <CardTitle>在留カード情報</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="grid grid-cols-[150px_1fr] gap-4 items-center">
              <Label htmlFor="residenceCardNo" className="text-right">在留カード番号</Label>
              <Input
                id="residenceCardNo"
                value={residenceCardNo}
                onChange={(e) => setResidenceCardNo(e.target.value)}
                disabled={!isManual || saving}
              />
            </div>

            <div className="grid grid-cols-[150px_1fr] gap-4 items-center">
              <Label htmlFor="residenceCardIssuedDate" className="text-right">在留カード発行日</Label>
              <Input
                id="residenceCardIssuedDate"
                type="date"
                value={residenceCardIssuedDate}
                onChange={(e) => setResidenceCardIssuedDate(e.target.value)}
                disabled={!isManual || saving}
                className="w-full"
              />
            </div>

            {(isManual || person.residenceCardExpiryDate) && (
              <div className="grid grid-cols-[150px_1fr] gap-4 items-center">
                <Label htmlFor="residenceCardExpiryDate" className="text-right">在留カード有効期限</Label>
                <Input
                  id="residenceCardExpiryDate"
                  type="date"
                  value={residenceCardExpiryDate}
                  onChange={(e) => setResidenceCardExpiryDate(e.target.value)}
                  disabled={!isManual || saving}
                  className="w-full"
                />
              </div>
            )}
          </CardContent>
        </Card>

        {/* 雇用状況届出 */}
        <Card>
          <CardHeader>
            <CardTitle>雇用状況届出</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="grid grid-cols-[150px_1fr] gap-4 items-center">
              <Label htmlFor="employmentNotificationDate" className="text-right">届出日</Label>
              <Input
                id="employmentNotificationDate"
                type="date"
                value={employmentNotificationDate}
                onChange={(e) => setEmploymentNotificationDate(e.target.value)}
                disabled={saving}
                className="w-full"
              />
            </div>

            <div className="grid grid-cols-[150px_1fr] gap-4 items-center">
              <Label htmlFor="employmentChangeNotificationDate" className="text-right">変更届出日</Label>
              <Input
                id="employmentChangeNotificationDate"
                type="date"
                value={employmentChangeNotificationDate}
                onChange={(e) => setEmploymentChangeNotificationDate(e.target.value)}
                disabled={saving}
                className="w-full"
              />
            </div>
          </CardContent>
        </Card>

        {/* 入社前情報 */}
        <Card>
          <CardHeader>
            <CardTitle>入社前情報</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="grid grid-cols-[150px_1fr] gap-4 items-center">
              <Label htmlFor="interviewDate" className="text-right">面接日</Label>
              <Input
                id="interviewDate"
                type="date"
                value={interviewDate}
                onChange={(e) => setInterviewDate(e.target.value)}
                disabled={saving}
                className="w-full"
              />
            </div>

            <div className="grid grid-cols-[150px_1fr] gap-4 items-center">
              <Label htmlFor="jobOfferDate" className="text-right">内定日</Label>
              <Input
                id="jobOfferDate"
                type="date"
                value={jobOfferDate}
                onChange={(e) => setJobOfferDate(e.target.value)}
                disabled={saving}
                className="w-full"
              />
            </div>

            <div className="grid grid-cols-[150px_1fr] gap-4 items-center">
              <Label htmlFor="applicationNumber" className="text-right">申請番号</Label>
              <Input
                id="applicationNumber"
                value={applicationNumber}
                onChange={(e) => setApplicationNumber(e.target.value)}
                placeholder="申請番号を入力"
                disabled={saving}
              />
            </div>

            <div className="grid grid-cols-[150px_1fr] gap-4 items-center">
              <Label htmlFor="departureProcedureStatus" className="text-right">出国手続きの状況</Label>
              <Input
                id="departureProcedureStatus"
                value={departureProcedureStatus}
                onChange={(e) => setDepartureProcedureStatus(e.target.value)}
                placeholder="出国手続きの状況を入力"
                disabled={saving}
              />
            </div>

            <div className="grid grid-cols-[150px_1fr] gap-4 items-center">
              <Label htmlFor="entryConfirmedDate" className="text-right">入国確定日</Label>
              <Input
                id="entryConfirmedDate"
                type="date"
                value={entryConfirmedDate}
                onChange={(e) => setEntryConfirmedDate(e.target.value)}
                disabled={saving}
                className="w-full"
              />
            </div>

          </CardContent>
        </Card>

        {/* 入社後情報 */}
        <Card>
          <CardHeader>
            <CardTitle>入社後情報</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="grid grid-cols-[150px_1fr] gap-4 items-center">
              <Label htmlFor="joiningDate" className="text-right">入社日</Label>
              <Input
                id="joiningDate"
                type="date"
                value={joiningDate}
                onChange={(e) => setJoiningDate(e.target.value)}
                disabled={saving}
                className="w-full"
              />
            </div>
          </CardContent>
        </Card>

        {/* 社会保険／雇用保険 */}
        <Card>
          <CardHeader>
            <CardTitle>社会保険／雇用保険</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="grid grid-cols-[150px_1fr] gap-4 items-center">
              <Label htmlFor="insuranceNumber" className="text-right">保険番号</Label>
              <Input
                id="insuranceNumber"
                value={insuranceNumber}
                onChange={(e) => setInsuranceNumber(e.target.value)}
                placeholder="保険番号を入力"
                disabled={saving}
              />
            </div>

            <div className="grid grid-cols-[150px_1fr] gap-4 items-center">
              <Label htmlFor="insuranceAcquiredDate" className="text-right">取得日</Label>
              <Input
                id="insuranceAcquiredDate"
                type="date"
                value={insuranceAcquiredDate}
                onChange={(e) => setInsuranceAcquiredDate(e.target.value)}
                disabled={saving}
                className="w-full"
              />
            </div>
          </CardContent>
        </Card>

        {/* 連絡先情報 */}
        <Card>
          <CardHeader>
            <CardTitle>連絡先情報</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            {(isManual || person.email) && (
              <div className="grid grid-cols-[150px_1fr] gap-4 items-center">
                <Label htmlFor="email" className="text-right">メールアドレス</Label>
                <Input
                  id="email"
                  type="email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  disabled={!isManual || saving}
                />
              </div>
            )}

            <div className="grid grid-cols-[150px_1fr] gap-4 items-center">
              <Label htmlFor="phone" className="text-right">電話番号</Label>
              <Input
                id="phone"
                value={phone}
                onChange={(e) => setPhone(e.target.value)}
                disabled={!isManual || saving}
              />
            </div>

            <div className="grid grid-cols-[150px_1fr] gap-4 items-start">
              <Label htmlFor="address" className="text-right pt-2">住所</Label>
              <Textarea
                id="address"
                value={address}
                onChange={(e) => setAddress(e.target.value)}
                disabled={!isManual || saving}
                rows={3}
              />
            </div>
          </CardContent>
        </Card>

        {/* 所属情報（非表示のフィールドがある場合のみ表示） */}
        {(person.tenantName || person.company || person.note || isManual) && (
          <Card>
            <CardHeader>
              <CardTitle>所属情報</CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              {person.tenantName && (
                <div className="grid grid-cols-[150px_1fr] gap-4 items-center">
                  <Label htmlFor="tenantName" className="text-right">会社</Label>
                  <Input
                    id="tenantName"
                    value={person.tenantName || ''}
                    disabled
                  />
                </div>
              )}

              {(person.company || isManual) && (
                <div className="grid grid-cols-[150px_1fr] gap-4 items-center">
                  <Label htmlFor="company" className="text-right">所属先</Label>
                  <Input
                    id="company"
                    value={company}
                    onChange={(e) => setCompany(e.target.value)}
                    disabled={!isManual || saving}
                  />
                </div>
              )}

              {(person.note || isManual) && (
                <div className="grid grid-cols-[150px_1fr] gap-4 items-start">
                  <Label htmlFor="note" className="text-right pt-2">メモ</Label>
                  <Textarea
                    id="note"
                    value={note}
                    onChange={(e) => setNote(e.target.value)}
                    disabled={!isManual || saving}
                    rows={4}
                  />
                </div>
              )}
            </CardContent>
          </Card>
        )}
      </div>

      {/* Action Buttons */}
      <div className="flex items-center justify-end gap-4">
        <Button
          variant="outline"
          onClick={() => {
            startNavigation()
            router.push(`/people/${id}`)
          }}
          disabled={saving}
        >
          キャンセル
        </Button>
        <Button
          onClick={handleSave}
          disabled={saving}
          className="min-w-[100px]"
        >
          {saving ? '保存中...' : '保存'}
        </Button>
      </div>
    </div>
  )
}
