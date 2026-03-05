"use client"

import type React from "react"

import { useState, useEffect, useRef } from "react"
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover"
import { Checkbox } from "@/components/ui/checkbox"
import { Badge } from "@/components/ui/badge"
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from "@/components/ui/dropdown-menu"
import { Search, FilterIcon, Download, ChevronUp, ChevronDown, X, ChevronDown as ChevronDownIcon } from "lucide-react"
import { cn } from "@/lib/utils"
import Encoding from "encoding-japanese"

export interface Column<T> {
  key: keyof T | string
  label: string
  sortable?: boolean
  filterable?: boolean
  render?: (value: any, row: T) => React.ReactNode
}

interface DataTableProps<T> {
  data: T[]
  columns: Column<T>[]
  csvColumns?: Column<T>[]
  filters?: Filter[]
  searchKeys?: (keyof T)[]
  onRowClick?: (row: T) => void
  className?: string
  // URLパラメータ永続化用
  initialSearchTerm?: string
  initialActiveFilters?: Record<string, string[]>
  onFilterChange?: (filters: Record<string, string[]>, searchTerm: string) => void
}

interface Filter {
  key: string
  label: string
  options: { value: string; label: string }[]
  multiple?: boolean
}

export function DataTable<T extends Record<string, any>>({
  data,
  columns,
  csvColumns,
  filters = [],
  searchKeys = [],
  onRowClick,
  className,
  initialSearchTerm = "",
  initialActiveFilters = {},
  onFilterChange,
}: DataTableProps<T>) {
  const [searchTerm, setSearchTerm] = useState(initialSearchTerm)
  const [sortConfig, setSortConfig] = useState<{
    key: string
    direction: "asc" | "desc"
  } | null>(null)
  const [activeFilters, setActiveFilters] = useState<Record<string, string[]>>(initialActiveFilters)
  const isInitialMount = useRef(true)

  // 初期値が変更されたときに状態を更新（URLパラメータ変更時）
  useEffect(() => {
    const wasInitial = isInitialMount.current
    setSearchTerm(initialSearchTerm)
    setActiveFilters(initialActiveFilters)
    if (wasInitial) {
      isInitialMount.current = false
    }
  }, [initialSearchTerm, initialActiveFilters])

  // URLパラメータ同期: フィルター状態の変更を親に通知（初回レンダリング時は除く）
  useEffect(() => {
    if (onFilterChange && !isInitialMount.current) {
      onFilterChange(activeFilters, searchTerm)
    }
  }, [activeFilters, searchTerm, onFilterChange])

  // Filter data based on search and filters
  const filteredData = data.filter((row) => {
    // Search filter
    if (searchTerm) {
      const searchMatch = searchKeys.some((key) => {
        const value = row[key]
        return value?.toString().toLowerCase().includes(searchTerm.toLowerCase())
      })
      if (!searchMatch) return false
    }

    // Column filters
    for (const [filterKey, filterValues] of Object.entries(activeFilters)) {
      if (filterValues.length > 0) {
        const rowValue = row[filterKey]?.toString()
        if (!filterValues.includes(rowValue)) return false
      }
    }

    return true
  })

  // Sort data
  const sortedData = sortConfig
    ? [...filteredData].sort((a, b) => {
        const aValue = a[sortConfig.key]
        const bValue = b[sortConfig.key]

        if (aValue < bValue) return sortConfig.direction === "asc" ? -1 : 1
        if (aValue > bValue) return sortConfig.direction === "asc" ? 1 : -1
        return 0
      })
    : filteredData

  const handleSort = (key: string) => {
    setSortConfig((current) => {
      if (current?.key === key) {
        return current.direction === "asc" ? { key, direction: "desc" } : null
      }
      return { key, direction: "asc" }
    })
  }

  const handleFilterChange = (filterKey: string, value: string) => {
    setActiveFilters((current) => {
      const currentValues = current[filterKey] || []
      const newValues = currentValues.includes(value)
        ? currentValues.filter((v) => v !== value)
        : [...currentValues, value]

      return { ...current, [filterKey]: newValues }
    })
  }

  const removeFilter = (filterKey: string, value: string) => {
    setActiveFilters((current) => {
      const currentValues = current[filterKey] || []
      const newValues = currentValues.filter((v) => v !== value)
      return { ...current, [filterKey]: newValues }
    })
  }

  const clearAllFilters = () => {
    setActiveFilters({})
    setSearchTerm("")
  }

  const exportToCsv = (encoding: "utf8" | "sjis" = "utf8") => {
    const exportColumns = csvColumns ?? columns
    const headers = exportColumns
      .map((col) => `"${col.label?.toString().replace(/"/g, '""') || ""}"`)
      .join(",")
    const exportData = sortedData
    const rows = exportData.map((row) =>
      exportColumns
        .map((col) => {
          const value = typeof col.key === "string" ? row[col.key] : ""
          return `"${value?.toString().replace(/"/g, '""') || ""}"`
        })
        .join(","),
    )

    const csv = [headers, ...rows].join("\n")

    let blob: Blob
    if (encoding === "sjis") {
      const unicodeArray = Encoding.stringToCode(csv)
      const sjisArray = Encoding.convert(unicodeArray, { to: "SJIS", from: "UNICODE" })
      blob = new Blob([new Uint8Array(sjisArray)], { type: "text/csv;charset=shift_jis;" })
    } else {
      // UTF-8 BOM を付与して Excel での文字化けを防止
      const bom = "\uFEFF"
      blob = new Blob([bom + csv], { type: "text/csv;charset=utf-8;" })
    }

    const url = URL.createObjectURL(blob)
    const a = document.createElement("a")
    a.href = url
    const timestamp = new Date().toISOString().slice(0, 10)
    a.download = `export_${timestamp}.csv`
    a.click()
    URL.revokeObjectURL(url)
  }

  return (
    <div className={cn("space-y-4", className)}>
      {/* Toolbar */}
      <div className="flex items-center justify-between gap-4">
        <div className="flex items-center gap-2 flex-1">
          {/* Search */}
          {searchKeys.length > 0 && (
            <div className="relative max-w-sm">
              <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
              <Input
                placeholder="検索..."
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                className="pl-10"
              />
            </div>
          )}

          {/* Filters */}
          {filters.map((filter) => {
            const selectedValues = activeFilters[filter.key] || []
            const selectedCount = selectedValues.length
            
            return (
              <Popover key={filter.key}>
                <PopoverTrigger asChild>
                  <button
                    type="button"
                    className="inline-flex items-center justify-center gap-2 whitespace-nowrap rounded-md text-sm font-medium transition-all disabled:pointer-events-none disabled:opacity-50 outline-none focus-visible:border-ring focus-visible:ring-ring/50 focus-visible:ring-[3px] border bg-background shadow-xs hover:bg-accent hover:text-accent-foreground dark:bg-input/30 dark:border-input dark:hover:bg-input/50 h-9 px-4 py-2 min-w-[140px] max-w-[240px] justify-between"
                  >
                    <FilterIcon className="h-4 w-4 flex-shrink-0 mr-2" />
                    <span className="truncate">
                      {filter.label}
                      {selectedCount > 0 && (
                        <span className="ml-1 text-muted-foreground">
                          ({selectedCount})
                        </span>
                      )}
                    </span>
                    <ChevronDownIcon className="h-4 w-4 flex-shrink-0 opacity-50 ml-2" />
                  </button>
                </PopoverTrigger>
                <PopoverContent className="w-[240px] p-4" align="start">
                  <div className="space-y-1">
                    {filter.options.length === 0 ? (
                      <div className="text-sm text-muted-foreground text-center">
                        オプションがありません
                      </div>
                    ) : (
                      filter.options.map((option) => {
                        const isSelected = selectedValues.includes(option.value)
                        return (
                          <div
                            key={option.value}
                            className="flex items-center gap-2 rounded-sm px-2 py-1.5 hover:bg-accent cursor-pointer"
                            onClick={() => handleFilterChange(filter.key, option.value)}
                          >
                            <Checkbox
                              checked={isSelected}
                              onCheckedChange={() => {}}
                            />
                            <span className="flex-1 text-sm cursor-pointer select-none">
                              {option.label}
                            </span>
                          </div>
                        )
                      })
                    )}
                  </div>
                </PopoverContent>
              </Popover>
            )
          })}
        </div>

        {/* Export */}
        <DropdownMenu>
          <DropdownMenuTrigger className="inline-flex items-center gap-2 rounded-md border border-border bg-background px-4 py-2 text-sm font-medium shadow-sm hover:bg-muted h-9">
            <Download className="h-4 w-4" />
            CSV出力
            <ChevronDownIcon className="h-4 w-4 opacity-50" />
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end">
            <DropdownMenuItem onClick={() => exportToCsv("utf8")}>
              UTF-8
            </DropdownMenuItem>
            <DropdownMenuItem onClick={() => exportToCsv("sjis")}>
              Shift-JIS
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      </div>

      {/* Active Filters */}
      {Object.entries(activeFilters).some(([_, values]) => values.length > 0) && (
        <div className="flex items-center gap-2 flex-wrap">
          <span className="text-sm text-muted-foreground">フィルタ:</span>
          {Object.entries(activeFilters).map(([key, values]) =>
            values.map((value) => (
              <Badge
                key={`${key}-${value}`}
                variant="secondary"
                className="cursor-pointer hover:bg-secondary/80"
                onClick={() => removeFilter(key, value)}
              >
                {value} ×
              </Badge>
            )),
          )}
          <Button
            variant="ghost"
            size="sm"
            onClick={clearAllFilters}
            className="h-6 px-2 text-xs text-muted-foreground hover:text-foreground"
          >
            <X className="h-3 w-3 mr-1" />
            全てクリア
          </Button>
        </div>
      )}

      {/* Table */}
      <div className="rounded-md border">
        <Table>
          <TableHeader>
            <TableRow>
              {columns.map((column) => (
                <TableHead
                  key={column.key.toString()}
                  className={cn(column.sortable && "cursor-pointer select-none hover:bg-muted/50")}
                  onClick={() => column.sortable && handleSort(column.key.toString())}
                >
                  <div className="flex items-center gap-2">
                    {column.label}
                    {column.sortable && (
                      <div className="flex flex-col">
                        <ChevronUp
                          className={cn(
                            "h-3 w-3",
                            sortConfig?.key === column.key && sortConfig.direction === "asc"
                              ? "text-foreground"
                              : "text-muted-foreground",
                          )}
                        />
                        <ChevronDown
                          className={cn(
                            "h-3 w-3 -mt-1",
                            sortConfig?.key === column.key && sortConfig.direction === "desc"
                              ? "text-foreground"
                              : "text-muted-foreground",
                          )}
                        />
                      </div>
                    )}
                  </div>
                </TableHead>
              ))}
            </TableRow>
          </TableHeader>
          <TableBody>
            {sortedData.length === 0 ? (
              <TableRow>
                <TableCell colSpan={columns.length} className="text-center py-8 text-muted-foreground">
                  データがありません
                </TableCell>
              </TableRow>
            ) : (
              sortedData.map((row, index) => (
                <TableRow
                  key={index}
                  className={cn(onRowClick && "cursor-pointer hover:bg-muted/50")}
                  onClick={() => onRowClick?.(row)}
                >
                  {columns.map((column) => (
                    <TableCell key={column.key.toString()}>
                      {column.render ? column.render(row[column.key], row) : row[column.key]?.toString() || ""}
                    </TableCell>
                  ))}
                </TableRow>
              ))
            )}
          </TableBody>
        </Table>
      </div>

      {/* Results count */}
      <div className="flex items-center justify-between text-sm text-muted-foreground">
        <div>
          {data.length !== sortedData.length ? (
            <>
              <span className="font-medium text-foreground">{sortedData.length}</span> 件を表示 
              <span className="mx-1">•</span> 
              合計 <span className="font-medium text-foreground">{data.length}</span> 件
            </>
          ) : (
            <>
              合計 <span className="font-medium text-foreground">{data.length}</span> 件
            </>
          )}
        </div>
        {data.length !== sortedData.length && (
          <div className="text-xs">
            {Math.round((sortedData.length / data.length) * 100)}% を表示中
          </div>
        )}
      </div>
    </div>
  )
}
