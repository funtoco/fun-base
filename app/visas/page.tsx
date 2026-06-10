"use client"

import { useState, useEffect } from "react"
import { useRouter, useSearchParams } from "next/navigation"
import { Input } from "@/components/ui/input"
import { Badge } from "@/components/ui/badge"
import { ResultCountBadge } from "@/components/ui/result-count-badge"
import { Button } from "@/components/ui/button"
import { Card, CardContent } from "@/components/ui/card"
import { FilterMultiSelectPopover } from "@/components/ui/filter-multi-select-popover"
import { BoardLoadingSkeleton } from "@/components/ui/funbase-loading"
import { useNavigationProgress } from "@/components/navigation-progress"
import { Search, Filter as FilterIcon, X, ChevronDown, ChevronUp, Building2 } from "lucide-react"
import { getPeople } from "@/lib/supabase/people"
import { getVisas } from "@/lib/supabase/visas"
import { matchesPersonSearch } from "@/lib/person-search"
import { cn, formatDate, isExpiringSoon } from "@/lib/utils"
import { toggleQueryMultiValue } from "@/lib/interview-list-query"
import { getLatestVisaActivityDate } from "@/lib/visa-display"
import { buildVisaFilterQuery, parseVisaFilterQuery } from "@/lib/visa-filter-query"
import type { VisaStatus, Person, Visa } from "@/lib/models"

const visaStatuses: VisaStatus[] = [
  "書類準備中",
  "書類作成中",
  "書類確認中",
  "申請準備中",
  "ビザ申請準備中",
  "申請中",
  "ビザ取得済み",
]

interface ExtendedKanbanColumn {
  id: string
  title: string
  items: any[]
  totalCount: number
  displayedCount: number
  isExpanded: boolean
}

export default function VisasPage() {
  const router = useRouter()
  const { startNavigation } = useNavigationProgress()
  const searchParams = useSearchParams()
  const [searchTerm, setSearchTerm] = useState("")
  const [typeFilter, setTypeFilter] = useState<string[]>([])
  const [expiryFilter, setExpiryFilter] = useState<string[]>([])
  const [companyFilter, setCompanyFilter] = useState<string[]>([])
  const [affiliationFilter, setAffiliationFilter] = useState<string[]>([])
  const [people, setPeople] = useState<Person[]>([])
  const [visas, setVisas] = useState<Visa[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [expandedColumns, setExpandedColumns] = useState<Set<string>>(new Set())

  // URLパラメータから初期値を設定
  useEffect(() => {
    const filters = parseVisaFilterQuery(new URLSearchParams(searchParams.toString()))
    setSearchTerm(filters.search)
    setTypeFilter(filters.types)
    setExpiryFilter(filters.expiries)
    setCompanyFilter(filters.companies)
    setAffiliationFilter(filters.affiliations)
  }, [searchParams])

  useEffect(() => {
    async function fetchData() {
      try {
        setLoading(true)
        const [peopleData, visaData] = await Promise.all([
          getPeople(),
          getVisas()
        ])
        setPeople(peopleData)
        setVisas(visaData)
      } catch (err) {
        console.error('Error fetching data:', err)
        setError('データの取得に失敗しました')
      } finally {
        setLoading(false)
      }
    }

    fetchData()
  }, [])

  // URLパラメータを更新
  const updateUrl = (filters: {
    search?: string
    types?: string[]
    expiries?: string[]
    companies?: string[]
    affiliations?: string[]
  }) => {
    const query = buildVisaFilterQuery({
      search: filters.search ?? searchTerm,
      types: filters.types ?? typeFilter,
      expiries: filters.expiries ?? expiryFilter,
      companies: filters.companies ?? companyFilter,
      affiliations: filters.affiliations ?? affiliationFilter,
    })

    router.replace(`/visas${query ? `?${query}` : ""}`, { scroll: false })
  }

  // フィルター変更時のハンドラ
  const handleSearchChange = (value: string) => {
    setSearchTerm(value)
    updateUrl({
      search: value,
    })
  }

  const handleTypeFilterToggle = (value: string) => {
    const nextTypes = toggleQueryMultiValue(typeFilter, value)
    setTypeFilter(nextTypes)
    updateUrl({
      types: nextTypes,
    })
  }

  const handleExpiryFilterToggle = (value: string) => {
    const nextExpiries = toggleQueryMultiValue(expiryFilter, value)
    setExpiryFilter(nextExpiries)
    updateUrl({
      expiries: nextExpiries,
    })
  }

  const handleCompanyFilterChange = (value: string) => {
    const newCompanyFilter = companyFilter.includes(value)
      ? companyFilter.filter((v) => v !== value)
      : [...companyFilter, value]
    setCompanyFilter(newCompanyFilter)
    updateUrl({
      companies: newCompanyFilter,
    })
  }

  const handleAffiliationFilterChange = (value: string) => {
    const newAffiliationFilter = affiliationFilter.includes(value)
      ? affiliationFilter.filter((v) => v !== value)
      : [...affiliationFilter, value]
    setAffiliationFilter(newAffiliationFilter)
    updateUrl({
      affiliations: newAffiliationFilter,
    })
  }

  // Filter visas based on search and filters
  const filteredVisas = visas.filter((visa) => {
    const person = people.find((p) => p.id === visa.personId)
    if (!person) return false

    // Search filter
    if (searchTerm) {
      if (!matchesPersonSearch(person, searchTerm)) return false
    }

    // Type filter
    if (typeFilter.length > 0 && !typeFilter.includes(visa.type)) return false

    // Expiry filter
    if (expiryFilter.length > 0) {
      if (!visa.expiryDate) return false

      const matchesExpiry = expiryFilter.some((expiry) => {
        const days = Number.parseInt(expiry, 10)
        return Number.isFinite(days) && isExpiringSoon(visa.expiryDate!, days)
      })
      if (!matchesExpiry) return false
    }

    // Company filter
    if (companyFilter.length > 0 && !companyFilter.includes(person.tenantName || '')) return false

    // Affiliation filter
    if (affiliationFilter.length > 0 && !affiliationFilter.includes(person.company || '')) return false

    return true
  })

  // Group visas by status for kanban columns with priority-based display
  const kanbanColumns: ExtendedKanbanColumn[] = visaStatuses.map((status) => {
    const statusVisas = filteredVisas.filter((visa) => visa.status === status)

    // Sort by priority: urgent first, then by date
    const sortedVisas = statusVisas
      .map((visa) => {
        const person = people.find((p) => p.id === visa.personId)
        if (!person) return null

        const isUrgent = visa.expiryDate && isExpiringSoon(visa.expiryDate, 7)
        const isWarning = visa.expiryDate && isExpiringSoon(visa.expiryDate, 30)
        const latestActivityDate = getLatestVisaActivityDate(visa)

        return {
          id: visa.id,
          title: person.name,
          subtitle: visa.type,
          badge: undefined,
          badgeVariant: isUrgent ? ("destructive" as const) : ("secondary" as const),
          metadata: {
            personId: person.id,
            expiryDate: visa.expiryDate,
            type: visa.type,
            manager: visa.manager,
            isUrgent,
            isWarning,
            latestActivityDate,
          },
          visa,
        }
      })
      .filter((item): item is NonNullable<typeof item> => Boolean(item))
      .sort((a, b) => {
        // Priority: urgent > warning > normal
        if (a.metadata.isUrgent && !b.metadata.isUrgent) return -1
        if (!a.metadata.isUrgent && b.metadata.isUrgent) return 1
        if (a.metadata.isWarning && !b.metadata.isWarning) return -1
        if (!a.metadata.isWarning && b.metadata.isWarning) return 1
        
        // Secondary sort by expiry date
        if (a.visa.expiryDate && b.visa.expiryDate) {
          return new Date(a.visa.expiryDate).getTime() - new Date(b.visa.expiryDate).getTime()
        }
        return 0
      })

    // Limit display to 5 items unless expanded
    const isExpanded = expandedColumns.has(status)
    const displayItems = isExpanded ? sortedVisas : sortedVisas.slice(0, 5)

    return {
      id: status,
      title: status,
      items: displayItems,
      totalCount: sortedVisas.length,
      displayedCount: displayItems.length,
      isExpanded,
    }
  })

  const toggleColumnExpansion = (columnId: string) => {
    setExpandedColumns(prev => {
      const newSet = new Set(prev)
      if (newSet.has(columnId)) {
        newSet.delete(columnId)
      } else {
        newSet.add(columnId)
      }
      return newSet
    })
  }

  // フィルター適用前の処理：他のフィルターでフィルタリングして選択肢を生成
  const getFilteredDataForOptions = () => {
    return visas.filter((visa) => {
      const person = people.find((p) => p.id === visa.personId)
      if (!person) return false

      // Search filter
      if (searchTerm) {
        if (!matchesPersonSearch(person, searchTerm)) return false
      }

      // Type filter
      if (typeFilter.length > 0 && !typeFilter.includes(visa.type)) return false

      // Expiry filter
      if (expiryFilter.length > 0) {
        if (!visa.expiryDate) return false

        const matchesExpiry = expiryFilter.some((expiry) => {
          const days = Number.parseInt(expiry, 10)
          return Number.isFinite(days) && isExpiringSoon(visa.expiryDate!, days)
        })
        if (!matchesExpiry) return false
      }

      // 会社と所属先のフィルターは除外（選択肢生成のため）
      return true
    }).map((visa) => {
      const person = people.find((p) => p.id === visa.personId)
      return person
    }).filter(Boolean)
  }

  const handleItemClick = (item: any) => {
    startNavigation()
    router.push(`/people/${item.metadata.personId}`)
  }

  const clearAllFilters = () => {
    setSearchTerm("")
    setTypeFilter([])
    setExpiryFilter([])
    setCompanyFilter([])
    setAffiliationFilter([])
    router.replace('/visas', { scroll: false })
  }

  // 個別のフィルターを削除
  const removeFilter = (filterType: string, value?: string) => {
    switch (filterType) {
      case 'type':
        if (value) {
          handleTypeFilterToggle(value)
        } else {
          setTypeFilter([])
          updateUrl({ types: [] })
        }
        break
      case 'expiry':
        if (value) {
          handleExpiryFilterToggle(value)
        } else {
          setExpiryFilter([])
          updateUrl({ expiries: [] })
        }
        break
      case 'company':
        if (value) {
          handleCompanyFilterChange(value)
        } else {
          setCompanyFilter([])
          updateUrl({
            companies: [],
          })
        }
        break
      case 'affiliation':
        if (value) {
          handleAffiliationFilterChange(value)
        } else {
          setAffiliationFilter([])
          updateUrl({
            affiliations: [],
          })
        }
        break
      case 'search':
        handleSearchChange('')
        break
    }
  }

  // アクティブなフィルターを取得
  const activeFilters: Array<{ key: string; label: string; value: string }> = []
  typeFilter.forEach((type) => {
    activeFilters.push({ key: 'type', label: `ビザ種別: ${type}`, value: type })
  })
  expiryFilter.forEach((expiry) => {
    activeFilters.push({ key: 'expiry', label: `期限: ${expiry}日以内`, value: expiry })
  })
  companyFilter.forEach((company) => {
    activeFilters.push({ key: 'company', label: `会社: ${company}`, value: company })
  })
  affiliationFilter.forEach((affiliation) => {
    activeFilters.push({ key: 'affiliation', label: `所属先: ${affiliation}`, value: affiliation })
  })
  if (searchTerm) activeFilters.push({ key: 'search', label: `検索: ${searchTerm}`, value: searchTerm })

  // Get unique values for filters
  const visaTypes = Array.from(new Set(visas.map((v) => v.type)))
  const expiryOptions = [
    { value: "7", label: "7日以内" },
    { value: "30", label: "30日以内" },
    { value: "60", label: "60日以内" },
    { value: "90", label: "90日以内" },
  ]
  
  // 会社の選択肢（会社フィルターを除いた他のフィルターに基づいて動的に生成）
  const companies = Array.from(new Set(
    getFilteredDataForOptions()
      .map((person) => person?.tenantName)
      .filter(Boolean)
  ))
  
  // 所属先の選択肢（会社フィルターと所属先フィルターを除いた他のフィルターに基づいて動的に生成）
  const affiliations = Array.from(new Set(
    getFilteredDataForOptions()
      .filter((person) => {
        // 会社フィルターが設定されている場合は、その会社の所属先のみを表示
        if (companyFilter.length > 0) {
          return person?.tenantName && companyFilter.includes(person.tenantName)
        }
        return true
      })
      .map((person) => person?.company)
      .filter(Boolean)
  ))

  if (loading) {
    return (
      <div className="p-6 space-y-6">
        <div>
          <h1 className="text-3xl font-bold text-foreground">ビザ進捗管理</h1>
          <p className="text-muted-foreground mt-2">ビザ申請の進捗状況確認</p>
        </div>
        <BoardLoadingSkeleton />
      </div>
    )
  }

  if (error) {
    return (
      <div className="p-6 space-y-6">
        <div>
          <h1 className="text-3xl font-bold text-foreground">ビザ進捗管理</h1>
          <p className="text-muted-foreground mt-2">ビザ申請の進捗状況確認</p>
        </div>
        <div className="flex items-center justify-center py-8">
          <div className="text-red-500">{error}</div>
        </div>
      </div>
    )
  }

  return (
    <div className="p-6 space-y-6">
      {/* Page Header */}
      <div>
        <h1 className="text-3xl font-bold text-foreground">ビザ進捗管理</h1>
        <p className="text-muted-foreground mt-2">ビザ申請の進捗状況確認</p>
      </div>

      {/* Filters */}
      <div className="space-y-3">
        <div className="flex items-center gap-3 flex-wrap">
          <div className="relative">
            <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
            <Input
              placeholder="人材名、法人名、事業所名で検索..."
              value={searchTerm}
              onChange={(e) => handleSearchChange(e.target.value)}
              className="pl-10 w-64"
            />
          </div>

          <FilterMultiSelectPopover
            label="ビザ種別"
            options={visaTypes.map((type) => ({ value: type, label: type }))}
            selectedValues={typeFilter}
            onToggle={handleTypeFilterToggle}
            triggerIcon={<FilterIcon className="mr-2 h-4 w-4 flex-shrink-0" />}
          />

          <FilterMultiSelectPopover
            label="期限"
            options={expiryOptions}
            selectedValues={expiryFilter}
            onToggle={handleExpiryFilterToggle}
            triggerIcon={<FilterIcon className="mr-2 h-4 w-4 flex-shrink-0" />}
          />

          <FilterMultiSelectPopover
            label="会社"
            options={companies.map((company) => ({
              value: company || "",
              label: company || "",
            }))}
            selectedValues={companyFilter}
            onToggle={handleCompanyFilterChange}
            triggerIcon={<Building2 className="mr-2 h-4 w-4 flex-shrink-0" />}
          />

          <FilterMultiSelectPopover
            label="所属先"
            options={affiliations.map((affiliation) => ({
              value: affiliation || "",
              label: affiliation || "",
            }))}
            selectedValues={affiliationFilter}
            onToggle={handleAffiliationFilterChange}
            triggerIcon={<Building2 className="mr-2 h-4 w-4 flex-shrink-0" />}
          />

          <ResultCountBadge count={filteredVisas.length} total={visas.length} />
        </div>

        {/* Active Filters */}
        {activeFilters.length > 0 && (
          <div className="flex items-center gap-2 flex-wrap">
            <span className="text-sm text-muted-foreground">フィルタ:</span>
            {activeFilters.map((filter, index) => (
              <Badge
                key={`${filter.key}-${filter.value}-${index}`}
                variant="secondary"
                className="cursor-pointer hover:bg-secondary/80"
                onClick={() => removeFilter(filter.key, filter.value)}
              >
                {filter.label} ×
              </Badge>
            ))}
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
      </div>

      {/* Enhanced Kanban Board with Priority Display */}
      <div className="flex gap-6 overflow-x-auto pb-4">
        {kanbanColumns.map((column) => (
          <div key={column.id} className="flex-shrink-0 w-80">
            {/* Column Header */}
            <div className="flex items-center justify-between mb-4 pb-3 border-b-2 border-primary/20">
              <h3 className="font-semibold text-sm text-foreground">{column.title}</h3>
              <Badge variant="secondary" className="ml-2 text-xs">
                {column.totalCount}
              </Badge>
            </div>

            {/* Column Items */}
            <div className="space-y-3">
              {column.items.length === 0 ? (
                <Card className="border-dashed">
                  <CardContent className="flex items-center justify-center py-8">
                    <p className="text-muted-foreground text-sm">項目がありません</p>
                  </CardContent>
                </Card>
              ) : (
                <>
                  {column.items.map((item) => (
                    <Card
                      key={item.id}
                      className={cn(
                        "cursor-pointer hover:shadow-md transition-all border-l-3",
                        item.metadata.isUrgent
                          ? "border-l-red-500 bg-red-50/30"
                          : item.metadata.isWarning
                            ? "border-l-amber-500 bg-amber-50/20"
                            : "border-l-transparent"
                      )}
                      onClick={() => handleItemClick(item)}
                    >
                      <CardContent className="p-4">
                        <div className="flex items-start justify-between">
                          <div className="flex-1">
                            <h4 className="font-medium text-sm">{item.title}</h4>
                            {item.subtitle && (
                              <p className="text-xs text-muted-foreground mt-1">
                                {item.subtitle}
                              </p>
                            )}
                            {item.metadata.latestActivityDate && (
                              <p className="mt-2 text-xs text-muted-foreground">
                                最新対応: {formatDate(item.metadata.latestActivityDate)}
                              </p>
                            )}
                          </div>
                          {item.badge && (
                            <Badge variant={item.badgeVariant} className="ml-2 text-xs">
                              {item.badge}
                            </Badge>
                          )}
                        </div>
                      </CardContent>
                    </Card>
                  ))}

                  {/* Expand/Collapse Button */}
                  {column.totalCount > 5 && (
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() => toggleColumnExpansion(column.id)}
                      className="w-full justify-center gap-2 text-xs text-muted-foreground hover:text-foreground"
                    >
                      {column.isExpanded ? (
                        <>
                          <ChevronUp className="h-3 w-3" />
                          折りたたむ
                        </>
                      ) : (
                        <>
                          <ChevronDown className="h-3 w-3" />
                          +{column.totalCount - 5}件を表示
                        </>
                      )}
                    </Button>
                  )}
                </>
              )}
            </div>
          </div>
        ))}
      </div>
    </div>
  )
}
