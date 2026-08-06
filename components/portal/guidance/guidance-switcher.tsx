'use client'

import { useTransition } from 'react'
import { useRouter, useSearchParams } from 'next/navigation'
import { cn } from '@/lib/utils'
import type { GuidanceCondition } from '@/lib/portal/guidance'
import type { ApplicationCategory, EntityType } from '@/lib/portal/types'

interface GuidanceSwitcherProps {
  condition: GuidanceCondition
}

const ENTITY_OPTIONS: { value: EntityType; label: string }[] = [
  { value: 'corporate', label: '法人' },
  { value: 'sole_proprietor', label: '個人事業主' },
]

const CATEGORY_OPTIONS: { value: ApplicationCategory; label: string }[] = [
  { value: 'initial', label: '初めて受け入れる' },
  { value: 'renewal', label: '既に受け入れ済み' },
]

export function GuidanceSwitcher({ condition }: GuidanceSwitcherProps) {
  const router = useRouter()
  const searchParams = useSearchParams()
  // force-dynamic なページへの遷移はサーバー往復を伴うため、待っている間の状態を出す。
  const [isPending, startTransition] = useTransition()

  const update = (key: 'entity' | 'category', value: string) => {
    const params = new URLSearchParams(searchParams.toString())
    params.set(key, value)
    // 分野は案件由来の値をそのまま引き継ぐ（トグルでは変えない）
    if (condition.field && !params.has('field')) {
      params.set('field', condition.field)
    }
    startTransition(() => {
      router.replace(`/applications/guide?${params.toString()}`, { scroll: false })
    })
  }

  return (
    <div className="flex flex-wrap items-start gap-6">
      <ToggleGroup
        label="事業形態"
        options={ENTITY_OPTIONS}
        selected={condition.entityType}
        onSelect={(value) => update('entity', value)}
        isPending={isPending}
      />
      <ToggleGroup
        label="受け入れ状況"
        options={CATEGORY_OPTIONS}
        selected={condition.category}
        onSelect={(value) => update('category', value)}
        isPending={isPending}
      />
    </div>
  )
}

function ToggleGroup({
  label,
  options,
  selected,
  onSelect,
  isPending,
}: {
  label: string
  options: readonly { value: string; label: string }[]
  selected: string
  onSelect: (value: string) => void
  isPending: boolean
}) {
  return (
    <div>
      <span className="text-xs text-muted-foreground">{label}</span>
      <div
        role="group"
        aria-label={label}
        aria-busy={isPending}
        className={cn(
          'mt-1 flex gap-1 rounded-lg bg-muted p-1 transition-opacity',
          isPending && 'opacity-70'
        )}
      >
        {options.map((option) => (
          <button
            key={option.value}
            type="button"
            aria-pressed={selected === option.value}
            onClick={() => onSelect(option.value)}
            className={cn(
              'rounded-md px-3 py-1.5 text-sm transition-colors',
              selected === option.value
                ? 'bg-background font-medium text-foreground shadow-sm'
                : 'text-muted-foreground hover:text-foreground'
            )}
          >
            {option.label}
          </button>
        ))}
      </div>
    </div>
  )
}
