"use client"

import type React from "react"

import { useEffect, useState } from "react"
import { ChevronDown as ChevronDownIcon, Search } from "lucide-react"

import { Checkbox } from "@/components/ui/checkbox"
import { Input } from "@/components/ui/input"
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover"

interface FilterOption {
  value: string
  label: string
}

interface FilterMultiSelectPopoverProps {
  label: string
  options: FilterOption[]
  selectedValues: string[]
  onToggle: (value: string) => void
  triggerIcon?: React.ReactNode
  emptyMessage?: string
  noResultsMessage?: string
}

export function FilterMultiSelectPopover({
  label,
  options,
  selectedValues,
  onToggle,
  triggerIcon,
  emptyMessage = "オプションがありません",
  noResultsMessage = "該当する候補がありません",
}: FilterMultiSelectPopoverProps) {
  const [isOpen, setIsOpen] = useState(false)
  const [searchTerm, setSearchTerm] = useState("")

  const normalizedSearchTerm = searchTerm.trim().toLowerCase()
  const filteredOptions = normalizedSearchTerm
    ? options.filter((option) => {
        const optionLabel = option.label.toLowerCase()
        const optionValue = option.value.toLowerCase()
        return optionLabel.includes(normalizedSearchTerm) || optionValue.includes(normalizedSearchTerm)
      })
    : options

  const selectedCount = selectedValues.length
  const showSearchInput = options.length > 8

  useEffect(() => {
    if (!showSearchInput && searchTerm) {
      setSearchTerm("")
    }
  }, [showSearchInput, searchTerm])

  return (
    <Popover
      open={isOpen}
      onOpenChange={(open) => {
        setIsOpen(open)
        if (!open) {
          setSearchTerm("")
        }
      }}
    >
      <PopoverTrigger asChild>
        <button
          type="button"
          className="inline-flex h-9 min-w-[140px] max-w-[240px] justify-between gap-2 whitespace-nowrap rounded-md border bg-background px-4 py-2 text-sm font-medium shadow-xs transition-all outline-none hover:bg-accent hover:text-accent-foreground focus-visible:border-ring focus-visible:ring-[3px] focus-visible:ring-ring/50 disabled:pointer-events-none disabled:opacity-50 dark:border-input dark:bg-input/30 dark:hover:bg-input/50"
        >
          {triggerIcon}
          <span className="truncate">
            {label}
            {selectedCount > 0 && (
              <span className="ml-1 text-muted-foreground">
                ({selectedCount})
              </span>
            )}
          </span>
          <ChevronDownIcon className="ml-2 h-4 w-4 flex-shrink-0 opacity-50" />
        </button>
      </PopoverTrigger>
      <PopoverContent className="w-80 max-w-[90vw] overflow-hidden p-0" align="start">
        <div className="border-b px-4 py-3">
          <div className="text-sm font-medium">{label}</div>
          {showSearchInput && (
            <div className="relative mt-3">
              <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
              <Input
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                placeholder={`${label}を検索...`}
                className="pl-10"
              />
            </div>
          )}
        </div>

        {options.length === 0 ? (
          <div className="px-4 py-6 text-center text-sm text-muted-foreground">
            {emptyMessage}
          </div>
        ) : filteredOptions.length === 0 ? (
          <div className="px-4 py-6 text-center text-sm text-muted-foreground">
            {noResultsMessage}
          </div>
        ) : (
          <div className="max-h-72 overflow-y-auto overscroll-contain p-2">
            <div className="space-y-1">
              {filteredOptions.map((option) => {
                const isSelected = selectedValues.includes(option.value)

                return (
                  <label
                    key={option.value}
                    className="flex cursor-pointer items-start gap-3 rounded-sm px-2 py-2 text-left hover:bg-accent"
                  >
                    <Checkbox
                      checked={isSelected}
                      onCheckedChange={() => onToggle(option.value)}
                      className="mt-0.5"
                    />
                    <span className="flex-1 select-none text-sm leading-5 [overflow-wrap:anywhere]">
                      {option.label}
                    </span>
                  </label>
                )
              })}
            </div>
          </div>
        )}
      </PopoverContent>
    </Popover>
  )
}
