"use client"
import { useRouter } from "next/navigation"
import { useEffect, useState } from "react"
import { DataTable, type Column } from "@/components/ui/data-table"
import { StatusBadge } from "@/components/ui/status-badge"
import { DeadlineChip } from "@/components/ui/deadline-chip"
import { Badge } from "@/components/ui/badge"
import { useNavigationProgress } from "@/components/layout/navigation-progress"
import { getVisas } from "@/lib/supabase/visas"
import { VisaDataSource } from "@/components/kintone/visa-data-source"

interface Visa {
  id: string
  personId: string
  type: string
  status: string
  applicationDate?: string
  expiryDate?: string
  createdAt: string
  updatedAt: string
}

export default function VisaPage() {
  const router = useRouter()
  const { startNavigation } = useNavigationProgress()
  const [visas, setVisas] = useState<Visa[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [dataSource, setDataSource] = useState<'sample' | 'kintone'>('sample')

  const columns: Column<Visa>[] = [
    {
      key: "personId",
      label: "人材ID",
      sortable: true,
      render: (value) => (
        <span className="font-mono text-sm">{value}</span>
      ),
    },
    {
      key: "type",
      label: "ビザ種類",
      sortable: true,
      filterable: true,
      render: (value) => (
        <Badge variant="outline">{value}</Badge>
      ),
    },
    {
      key: "status",
      label: "進捗状況",
      sortable: true,
      filterable: true,
      render: (value) => (
        <StatusBadge status={value} type="visa" />
      ),
    },
    {
      key: "applicationDate",
      label: "申請日",
      sortable: true,
      render: (value) =>
        value ? (
          <span className="text-sm">
            {new Date(value).toLocaleDateString("ja-JP")}
          </span>
        ) : (
          <span className="text-muted-foreground">-</span>
        ),
    },
    {
      key: "expiryDate",
      label: "在留期限",
      sortable: true,
      render: (value) =>
        value ? <DeadlineChip date={value} label="期限" /> : <span className="text-muted-foreground">-</span>,
    },
    {
      key: "createdAt",
      label: "作成日",
      sortable: true,
      render: (value) => (
        <span className="text-sm text-muted-foreground">
          {new Date(value).toLocaleDateString("ja-JP")}
        </span>
      ),
    },
  ]

  const filters = [
    {
      key: "type",
      label: "ビザ種類",
      options: Array.from(new Set(visas.map((v) => v.type).filter(Boolean))).map((type) => ({
        value: type!,
        label: type!,
      })),
      multiple: true,
    },
    {
      key: "status",
      label: "進捗状況",
      options: ["書類準備中", "書類作成中", "書類確認中", "申請準備中", "ビザ申請準備中", "申請中", "ビザ取得済み"].map(
        (status) => ({
          value: status,
          label: status,
        }),
      ),
      multiple: true,
    },
  ]

  const handleRowClick = (visa: Visa) => {
    startNavigation()
    router.push(`/visa/${visa.id}`)
  }

  if (error) {
    return (
      <div className="p-6 space-y-6">
        <div>
          <h1 className="text-3xl font-bold text-foreground">ビザ申請一覧</h1>
          <p className="text-muted-foreground mt-2">ビザ申請の進捗と管理</p>
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
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold text-foreground">ビザ申請一覧</h1>
          <p className="text-muted-foreground mt-2">ビザ申請の進捗と管理</p>
        </div>
      </div>

      {/* Data Source Configuration */}
      <VisaDataSource
        onDataChange={(visaData, source) => {
          setVisas(visaData)
          setDataSource(source)
        }}
        onLoadingChange={setLoading}
        onErrorChange={setError}
      />

      {/* Data Table */}
      <DataTable
        data={visas}
        columns={columns}
        filters={filters}
        searchKeys={["personId", "type", "status"]}
        onRowClick={handleRowClick}
        loading={loading}
      />
    </div>
  )
}
