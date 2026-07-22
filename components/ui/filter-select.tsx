"use client"

import type React from "react"

import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
} from "@/components/ui/select"
import type { FilterSelectOption } from "@/lib/filter-select-label"
import { getFilterSelectDisplayLabel } from "@/lib/filter-select-label"
import { cn } from "@/lib/utils"

interface FilterSelectProps {
  label: string
  value: string
  options: FilterSelectOption[]
  onValueChange: (value: string) => void
  triggerIcon?: React.ReactNode
  className?: string
}

export function FilterSelect({
  label,
  value,
  options,
  onValueChange,
  triggerIcon,
  className,
}: FilterSelectProps) {
  const displayLabel = getFilterSelectDisplayLabel({ label, value, options })

  return (
    <Select value={value} onValueChange={onValueChange}>
      <SelectTrigger
        aria-label={label}
        className={cn("min-w-[140px] max-w-[240px]", className)}
      >
        <span className="flex min-w-0 items-center gap-2">
          {triggerIcon}
          <span className="truncate">{displayLabel}</span>
        </span>
      </SelectTrigger>
      <SelectContent>
        {options.map((option) => (
          <SelectItem key={option.value} value={option.value}>
            {option.label}
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  )
}
