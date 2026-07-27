'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { UserPlus } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Checkbox } from '@/components/ui/checkbox'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from '@/components/ui/dialog'

export interface SelectablePerson {
  id: string
  name: string | null
  visaId: string | null
}

export function AddMembersDialog({
  caseId,
  people,
}: {
  caseId: string
  people: SelectablePerson[]
}) {
  const router = useRouter()
  const [open, setOpen] = useState(false)
  const [selected, setSelected] = useState<Record<string, boolean>>({})
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const selectedIds = Object.keys(selected).filter((id) => selected[id])
  const canSubmit = selectedIds.length > 0 && !submitting

  function toggle(id: string) {
    setSelected((prev) => ({ ...prev, [id]: !prev[id] }))
  }

  async function handleAdd() {
    if (!canSubmit) return
    setSubmitting(true)
    setError(null)

    try {
      for (const personId of selectedIds) {
        const person = people.find((p) => p.id === personId)
        const res = await fetch(`/api/applications/${caseId}/members`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            person_id: personId,
            visa_id: person?.visaId ?? null,
          }),
        })
        if (!res.ok) {
          const result = await res.json().catch(() => ({}))
          throw new Error(result.error || '人材の追加に失敗しました')
        }
      }
      setOpen(false)
      setSelected({})
      router.refresh()
    } catch (e) {
      setError(e instanceof Error ? e.message : '人材の追加に失敗しました')
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button className="gap-2">
          <UserPlus className="h-4 w-4" />
          人材を追加
        </Button>
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>人材を追加</DialogTitle>
          <DialogDescription>
            この事業所の人材を選んで追加します。追加すると、その人の必要書類がチェックリストに増えます。
          </DialogDescription>
        </DialogHeader>

        {people.length === 0 ? (
          <p className="py-6 text-center text-sm text-muted-foreground">
            追加できる人材がいません。（すでに全員が追加済み、またはこの事業所に人材が登録されていません）
          </p>
        ) : (
          <div className="max-h-72 space-y-1 overflow-y-auto">
            {people.map((person) => (
              <label
                key={person.id}
                className="flex cursor-pointer items-center gap-3 rounded-lg px-3 py-2 hover:bg-muted"
              >
                <Checkbox
                  checked={Boolean(selected[person.id])}
                  onCheckedChange={() => toggle(person.id)}
                />
                <span className="text-sm">{person.name ?? '（氏名未取得）'}</span>
              </label>
            ))}
          </div>
        )}

        {error && (
          <div className="rounded-lg border border-destructive/30 bg-destructive/10 px-3 py-2 text-sm text-destructive">
            {error}
          </div>
        )}

        <DialogFooter>
          <Button variant="outline" onClick={() => setOpen(false)} type="button">
            キャンセル
          </Button>
          <Button onClick={handleAdd} disabled={!canSubmit} type="button">
            {submitting
              ? '追加中...'
              : `追加${selectedIds.length > 0 ? `（${selectedIds.length}名）` : ''}`}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
