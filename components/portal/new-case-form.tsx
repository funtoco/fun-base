'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import {
  APPLICATION_CATEGORY_LABELS,
  ENTITY_TYPE_LABELS,
  FIELD_LABELS,
  type AccessibleOffice,
  type ApplicationCategory,
  type EntityType,
  type Field,
} from '@/lib/portal/types'

const ENTITY_OPTIONS = Object.entries(ENTITY_TYPE_LABELS) as [EntityType, string][]
const CATEGORY_OPTIONS = Object.entries(
  APPLICATION_CATEGORY_LABELS
) as [ApplicationCategory, string][]
const FIELD_OPTIONS = Object.entries(FIELD_LABELS) as [Field, string][]

export function NewCaseForm({ offices }: { offices: AccessibleOffice[] }) {
  const router = useRouter()
  const [officeId, setOfficeId] = useState('')
  const [entityType, setEntityType] = useState<EntityType | ''>('')
  const [category, setCategory] = useState<ApplicationCategory | ''>('')
  const [field, setField] = useState<Field | ''>('')
  const [managementNumber, setManagementNumber] = useState('')
  const [title, setTitle] = useState('')
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const hasOffices = offices.length > 0
  const canSubmit = Boolean(officeId && entityType && category && field) && !submitting

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    if (!canSubmit) return
    setSubmitting(true)
    setError(null)

    try {
      const res = await fetch('/api/applications', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          tenant_office_id: officeId,
          entity_type: entityType,
          application_category: category,
          field,
          management_number: managementNumber || null,
          title: title || null,
        }),
      })
      const result = await res.json().catch(() => ({}))
      if (!res.ok) {
        setError(result.error || '案件の作成に失敗しました')
        setSubmitting(false)
        return
      }
      router.push(`/applications/${result.id}`)
    } catch {
      setError('案件の作成に失敗しました。時間をおいて再度お試しください。')
      setSubmitting(false)
    }
  }

  return (
    <form onSubmit={handleSubmit} className="max-w-xl space-y-6">
      {!hasOffices && (
        <div className="rounded-lg border border-amber-300 bg-amber-50 px-4 py-3 text-sm text-amber-800">
          案件を作成できる事業所がありません。担当者に事業所の割り当てをご確認ください。
        </div>
      )}

      <div className="space-y-2">
        <Label htmlFor="office">事業所 *</Label>
        <Select value={officeId} onValueChange={setOfficeId} disabled={!hasOffices}>
          <SelectTrigger id="office" className="w-full">
            <SelectValue placeholder="事業所を選んでください" />
          </SelectTrigger>
          <SelectContent>
            {offices.map((office) => (
              <SelectItem key={office.id} value={office.id}>
                {office.name}
                {office.tenantName ? `（${office.tenantName}）` : ''}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      <div className="space-y-2">
        <Label htmlFor="entity-type">申請者の種別 *</Label>
        <Select value={entityType} onValueChange={(v) => setEntityType(v as EntityType)}>
          <SelectTrigger id="entity-type" className="w-full">
            <SelectValue placeholder="法人 / 個人事業主" />
          </SelectTrigger>
          <SelectContent>
            {ENTITY_OPTIONS.map(([value, label]) => (
              <SelectItem key={value} value={value}>
                {label}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      <div className="space-y-2">
        <Label htmlFor="category">申請の種類 *</Label>
        <Select value={category} onValueChange={(v) => setCategory(v as ApplicationCategory)}>
          <SelectTrigger id="category" className="w-full">
            <SelectValue placeholder="初回 / 更新" />
          </SelectTrigger>
          <SelectContent>
            {CATEGORY_OPTIONS.map(([value, label]) => (
              <SelectItem key={value} value={value}>
                {label}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      <div className="space-y-2">
        <Label htmlFor="field">分野 *</Label>
        <Select value={field} onValueChange={(v) => setField(v as Field)}>
          <SelectTrigger id="field" className="w-full">
            <SelectValue placeholder="分野を選んでください" />
          </SelectTrigger>
          <SelectContent>
            {FIELD_OPTIONS.map(([value, label]) => (
              <SelectItem key={value} value={value}>
                {label}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      <div className="space-y-2">
        <Label htmlFor="management-number">管理番号（任意）</Label>
        <Input
          id="management-number"
          value={managementNumber}
          onChange={(e) => setManagementNumber(e.target.value)}
          placeholder="例：A-100"
        />
      </div>

      <div className="space-y-2">
        <Label htmlFor="title">タイトル（任意）</Label>
        <Input
          id="title"
          value={title}
          onChange={(e) => setTitle(e.target.value)}
          placeholder="例：近江舞子しょうぶ苑 初回申請"
        />
      </div>

      {error && (
        <div className="rounded-lg border border-destructive/30 bg-destructive/10 px-4 py-3 text-sm text-destructive">
          {error}
        </div>
      )}

      <div className="flex items-center gap-3">
        <Button type="submit" disabled={!canSubmit}>
          {submitting ? '作成中...' : '案件を作成'}
        </Button>
        <Button
          type="button"
          variant="outline"
          onClick={() => router.push('/applications')}
        >
          キャンセル
        </Button>
      </div>
    </form>
  )
}
