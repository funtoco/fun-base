"use client"

import { useState, useEffect } from "react"
import { useRouter, useSearchParams } from "next/navigation"
import { Input } from "@/components/ui/input"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover"
import { Checkbox } from "@/components/ui/checkbox"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Card, CardContent } from "@/components/ui/card"
import { Search, FileText, Clock, X, ChevronDown, ChevronUp, Building2, FilterIcon, ChevronDown as ChevronDownIcon } from "lucide-react"
import { cn } from "@/lib/utils"
import { getPeople } from "@/lib/supabase/people"
import { getVisas } from "@/lib/supabase/visas"
import { isExpiringSoon } from "@/lib/utils"
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
  const searchParams = useSearchParams()
  const [searchTerm, setSearchTerm] = useState("")
  const [typeFilter, setTypeFilter] = useState<string>("all")
  const [expiryFilter, setExpiryFilter] = useState<string>("all")
  const [companyFilter, setCompanyFilter] = useState<string[]>([])
  const [affiliationFilter, setAffiliationFilter] = useState<string[]>([])
  const [people, setPeople] = useState<Person[]>([])
  const [visas, setVisas] = useState<Visa[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [expandedColumns, setExpandedColumns] = useState<Set<string>>(new Set())

  // URLパラメータから初期値を設定
  useEffect(() => {
    const search = searchParams.get('search')
    const type = searchParams.get('type')
    const expiry = searchParams.get('expiry')
    const company = searchParams.get('company')
    const affiliation = searchParams.get('affiliation')

    if (search !== null) setSearchTerm(search)
    if (type) setTypeFilter(type)
    if (expiry) setExpiryFilter(expiry)
    if (company) setCompanyFilter(company.split(','))
    if (affiliation) setAffiliationFilter(affiliation.split(','))
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
    type?: string
    expiry?: string
    company?: string[]
    affiliation?: string[]
  }) => {
    const newParams = new URLSearchParams()
    
    if (filters.search) newParams.set('search', filters.search)
    if (filters.type && filters.type !== 'all') newParams.set('type', filters.type)
    if (filters.expiry && filters.expiry !== 'all') newParams.set('expiry', filters.expiry)
    if (filters.company && filters.company.length > 0) newParams.set('company', filters.company.join(','))
    if (filters.affiliation && filters.affiliation.length > 0) newParams.set('affiliation', filters.affiliation.join(','))

    router.replace(`/visas?${newParams.toString()}`, { scroll: false })
  }

  // フィルター変更時のハンドラ
  const handleSearchChange = (value: string) => {
    setSearchTerm(value)
    updateUrl({
      search: value,
      type: typeFilter,
      expiry: expiryFilter,
      company: companyFilter,
      affiliation: affiliationFilter,
    })
  }

  const handleTypeFilterChange = (value: string) => {
    setTypeFilter(value)
    updateUrl({
      search: searchTerm,
      type: value,
      expiry: expiryFilter,
      company: companyFilter,
      affiliation: affiliationFilter,
    })
  }

  const handleExpiryFilterChange = (value: string) => {
    setExpiryFilter(value)
    updateUrl({
      search: searchTerm,
      type: typeFilter,
      expiry: value,
      company: companyFilter,
      affiliation: affiliationFilter,
    })
  }

  const handleCompanyFilterChange = (value: string) => {
    const newCompanyFilter = companyFilter.includes(value)
      ? companyFilter.filter((v) => v !== value)
      : [...companyFilter, value]
    setCompanyFilter(newCompanyFilter)
    updateUrl({
      search: searchTerm,
      type: typeFilter,
      expiry: expiryFilter,
      company: newCompanyFilter,
      affiliation: affiliationFilter,
    })
  }

  const handleAffiliationFilterChange = (value: string) => {
    const newAffiliationFilter = affiliationFilter.includes(value)
      ? affiliationFilter.filter((v) => v !== value)
      : [...affiliationFilter, value]
    setAffiliationFilter(newAffiliationFilter)
    updateUrl({
      search: searchTerm,
      type: typeFilter,
      expiry: expiryFilter,
      company: companyFilter,
      affiliation: newAffiliationFilter,
    })
  }

  // Filter visas based on search and filters
  const filteredVisas = visas.filter((visa) => {
    const person = people.find((p) => p.id === visa.personId)
    if (!person) return false

    // Search filter
    if (searchTerm) {
      const searchMatch = person.name.toLowerCase().includes(searchTerm.toLowerCase())
      if (!searchMatch) return false
    }

    // Type filter
    if (typeFilter !== "all" && visa.type !== typeFilter) return false

    // Expiry filter
    if (expiryFilter !== "all" && visa.expiryDate) {
      const days = Number.parseInt(expiryFilter)
      if (!isExpiringSoon(visa.expiryDate, days)) return false
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
        const searchMatch = person.name.toLowerCase().includes(searchTerm.toLowerCase())
        if (!searchMatch) return false
      }

      // Type filter
      if (typeFilter !== "all" && visa.type !== typeFilter) return false

      // Expiry filter
      if (expiryFilter !== "all" && visa.expiryDate) {
        const days = Number.parseInt(expiryFilter)
        if (!isExpiringSoon(visa.expiryDate, days)) return false
      }

      // 会社と所属先のフィルターは除外（選択肢生成のため）
      return true
    }).map((visa) => {
      const person = people.find((p) => p.id === visa.personId)
      return person
    }).filter(Boolean)
  }

  const handleItemClick = (item: any) => {
    window.location.href = `/people/${item.metadata.personId}`
  }

  const clearAllFilters = () => {
    setSearchTerm("")
    setTypeFilter("all")
    setExpiryFilter("all")
    setCompanyFilter([])
    setAffiliationFilter([])
    router.replace('/visas', { scroll: false })
  }

  // 個別のフィルターを削除
  const removeFilter = (filterType: string, value?: string) => {
    switch (filterType) {
      case 'type':
        handleTypeFilterChange('all')
        break
      case 'expiry':
        handleExpiryFilterChange('all')
        break
      case 'company':
        if (value) {
          handleCompanyFilterChange(value)
        } else {
          setCompanyFilter([])
          updateUrl({
            search: searchTerm,
            type: typeFilter,
            expiry: expiryFilter,
            company: [],
            affiliation: affiliationFilter,
          })
        }
        break
      case 'affiliation':
        if (value) {
          handleAffiliationFilterChange(value)
        } else {
          setAffiliationFilter([])
          updateUrl({
            search: searchTerm,
            type: typeFilter,
            expiry: expiryFilter,
            company: companyFilter,
            affiliation: [],
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
  if (typeFilter !== "all") activeFilters.push({ key: 'type', label: `ビザ種別: ${typeFilter}`, value: typeFilter })
  if (expiryFilter !== "all") activeFilters.push({ key: 'expiry', label: `期限: ${expiryFilter}日以内`, value: expiryFilter })
  companyFilter.forEach((company) => {
    activeFilters.push({ key: 'company', label: `会社: ${company}`, value: company })
  })
  affiliationFilter.forEach((affiliation) => {
    activeFilters.push({ key: 'affiliation', label: `所属先: ${affiliation}`, value: affiliation })
  })
  if (searchTerm) activeFilters.push({ key: 'search', label: `検索: ${searchTerm}`, value: searchTerm })

  // Get unique values for filters
  const visaTypes = Array.from(new Set(visas.map((v) => v.type)))
  
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
        <div className="flex items-center justify-center py-8">
          <div className="text-muted-foreground">読み込み中...</div>
        </div>
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
      <div className="space-y-4">
        {/* Search */}
        <div className="flex items-center gap-4 flex-wrap">
          <div className="relative">
            <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
            <Input
              placeholder="人材名で検索..."
              value={searchTerm}
              onChange={(e) => handleSearchChange(e.target.value)}
              className="pl-10 w-64"
            />
          </div>

          {/* Active filters count */}
          {(searchTerm || typeFilter !== "all" || expiryFilter !== "all" || companyFilter.length > 0 || affiliationFilter.length > 0) && (
            <Badge variant="secondary" className="ml-auto">
              {filteredVisas.length} / {visas.length} 件を表示
            </Badge>
          )}
        </div>

        {/* Filter Row */}
        <div className="flex items-center gap-4 flex-wrap">
          <div className="flex items-center gap-2">
            <FileText className="h-4 w-4 text-muted-foreground" />
            <Select value={typeFilter} onValueChange={handleTypeFilterChange}>
              <SelectTrigger className="w-40">
                <SelectValue placeholder="種別" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">すべて</SelectItem>
                {visaTypes.map((type) => (
                  <SelectItem key={type} value={type}>
                    {type}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            <span className="text-xs text-muted-foreground">ビザ種別</span>
          </div>

          <div className="flex items-center gap-2">
            <Clock className="h-4 w-4 text-muted-foreground" />
            <Select value={expiryFilter} onValueChange={handleExpiryFilterChange}>
              <SelectTrigger className="w-32">
                <SelectValue placeholder="期限" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">すべて</SelectItem>
                <SelectItem value="7">7日以内</SelectItem>
                <SelectItem value="30">30日以内</SelectItem>
                <SelectItem value="60">60日以内</SelectItem>
                <SelectItem value="90">90日以内</SelectItem>
              </SelectContent>
            </Select>
            <span className="text-xs text-muted-foreground">期限</span>
          </div>

          <Popover>
            <PopoverTrigger asChild>
              <button
                type="button"
                className="inline-flex items-center justify-center gap-2 whitespace-nowrap rounded-md text-sm font-medium transition-all disabled:pointer-events-none disabled:opacity-50 outline-none focus-visible:border-ring focus-visible:ring-ring/50 focus-visible:ring-[3px] border bg-background shadow-xs hover:bg-accent hover:text-accent-foreground dark:bg-input/30 dark:border-input dark:hover:bg-input/50 h-9 px-4 py-2 min-w-[140px] max-w-[240px] justify-between"
              >
                <Building2 className="h-4 w-4 flex-shrink-0 mr-2" />
                <span className="truncate">
                  会社
                  {companyFilter.length > 0 && (
                    <span className="ml-1 text-muted-foreground">
                      ({companyFilter.length})
                    </span>
                  )}
                </span>
                <ChevronDownIcon className="h-4 w-4 flex-shrink-0 opacity-50 ml-2" />
              </button>
            </PopoverTrigger>
            <PopoverContent className="w-[240px] p-4" align="start">
              <div className="space-y-1">
                {companies.length === 0 ? (
                  <div className="text-sm text-muted-foreground text-center">
                    オプションがありません
                  </div>
                ) : (
                  companies.map((company) => {
                    const isSelected = companyFilter.includes(company || '')
                    return (
                      <div
                        key={company}
                        className="flex items-center gap-2 rounded-sm px-2 py-1.5 hover:bg-accent cursor-pointer"
                        onClick={() => handleCompanyFilterChange(company || '')}
                      >
                        <Checkbox
                          checked={isSelected}
                          onCheckedChange={() => {}}
                        />
                        <span className="flex-1 text-sm cursor-pointer select-none">
                          {company}
                        </span>
                      </div>
                    )
                  })
                )}
              </div>
            </PopoverContent>
          </Popover>

          <Popover>
            <PopoverTrigger asChild>
              <button
                type="button"
                className="inline-flex items-center justify-center gap-2 whitespace-nowrap rounded-md text-sm font-medium transition-all disabled:pointer-events-none disabled:opacity-50 outline-none focus-visible:border-ring focus-visible:ring-ring/50 focus-visible:ring-[3px] border bg-background shadow-xs hover:bg-accent hover:text-accent-foreground dark:bg-input/30 dark:border-input dark:hover:bg-input/50 h-9 px-4 py-2 min-w-[140px] max-w-[240px] justify-between"
              >
                <Building2 className="h-4 w-4 flex-shrink-0 mr-2" />
                <span className="truncate">
                  所属先
                  {affiliationFilter.length > 0 && (
                    <span className="ml-1 text-muted-foreground">
                      ({affiliationFilter.length})
                    </span>
                  )}
                </span>
                <ChevronDownIcon className="h-4 w-4 flex-shrink-0 opacity-50 ml-2" />
              </button>
            </PopoverTrigger>
            <PopoverContent className="w-[240px] p-4" align="start">
              <div className="space-y-1">
                {affiliations.length === 0 ? (
                  <div className="text-sm text-muted-foreground text-center">
                    オプションがありません
                  </div>
                ) : (
                  affiliations.map((affiliation) => {
                    const isSelected = affiliationFilter.includes(affiliation || '')
                    return (
                      <div
                        key={affiliation}
                        className="flex items-center gap-2 rounded-sm px-2 py-1.5 hover:bg-accent cursor-pointer"
                        onClick={() => handleAffiliationFilterChange(affiliation || '')}
                      >
                        <Checkbox
                          checked={isSelected}
                          onCheckedChange={() => {}}
                        />
                        <span className="flex-1 text-sm cursor-pointer select-none">
                          {affiliation}
                        </span>
                      </div>
                    )
                  })
                )}
              </div>
            </PopoverContent>
          </Popover>

          {/* Clear filters button */}
          {(typeFilter !== "all" || expiryFilter !== "all" || companyFilter.length > 0 || affiliationFilter.length > 0) && (
            <Button
              variant="ghost"
              size="sm"
              onClick={clearAllFilters}
              className="h-8 px-3 text-xs text-muted-foreground hover:text-foreground ml-auto"
            >
              <X className="h-3 w-3 mr-1" />
              フィルタークリア
            </Button>
          )}
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
