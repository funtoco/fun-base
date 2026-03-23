"use client"

import { useRouter, useSearchParams } from "next/navigation"
import { useEffect, useState } from "react"
import { DataTable, type Column } from "@/components/ui/data-table"
import { PersonAvatar } from "@/components/ui/person-avatar"
import { getAllPersonDocuments, type PersonDocumentWithPerson } from "@/lib/supabase/person-documents"
import type { DocumentType } from "@/lib/models"

const DOCUMENT_TYPE_LABELS: Record<DocumentType, string> = {
  passport_front: "パスポート（表）",
  passport_back: "パスポート（裏）",
  residence_card_front: "在留カード（表）",
  residence_card_back: "在留カード（裏）",
}

function formatFileSize(bytes?: number): string {
  if (!bytes) return "-"
  if (bytes < 1024) return `${bytes} B`
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`
}

function formatDate(dateString?: string): string {
  if (!dateString) return "-"
  return new Date(dateString).toLocaleDateString("ja-JP", {
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  })
}

export default function DocumentsPage() {
  const router = useRouter()
  const searchParams = useSearchParams()
  const [documents, setDocuments] = useState<PersonDocumentWithPerson[]>([])
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const getFiltersFromUrl = (): Record<string, string[]> => {
    const filters: Record<string, string[]> = {}
    searchParams.forEach((value, key) => {
      if (key !== "search") {
        filters[key] = value.split(",")
      }
    })
    return filters
  }

  const updateUrl = (filters: Record<string, string[]>, searchTerm: string) => {
    const params = new URLSearchParams()
    if (searchTerm) params.set("search", searchTerm)
    Object.entries(filters).forEach(([key, values]) => {
      if (values.length > 0) params.set(key, values.join(","))
    })
    const newUrlString = params.toString()
    if (newUrlString !== searchParams.toString()) {
      const newUrl = newUrlString ? `?${newUrlString}` : ""
      router.replace(`/documents${newUrl}`, { scroll: false })
    }
  }

  useEffect(() => {
    async function fetchDocuments() {
      try {
        setLoading(true)
        setError(null)
        const data = await getAllPersonDocuments()
        setDocuments(data)
      } catch (err) {
        console.error("Error fetching documents:", err)
        setError(err instanceof Error ? err.message : "Failed to load documents")
      } finally {
        setLoading(false)
      }
    }
    fetchDocuments()
  }, [])

  const columns: Column<PersonDocumentWithPerson>[] = [
    {
      key: "personName",
      label: "人材名",
      sortable: true,
      render: (value, row) => (
        <div className="flex items-center gap-3">
          <PersonAvatar name={value || ""} size="sm" />
          <div>
            <div className="font-medium">{value || "-"}</div>
            {row.personKana && (
              <div className="text-xs text-muted-foreground">{row.personKana}</div>
            )}
          </div>
        </div>
      ),
    },
    {
      key: "documentTypeLabel",
      label: "書類種別",
      sortable: true,
      filterable: true,
      render: (_value, row) =>
        DOCUMENT_TYPE_LABELS[row.documentType as DocumentType] || row.documentType,
    },
    {
      key: "fileName",
      label: "ファイル名",
      sortable: true,
      render: (value) => (
        <span className="truncate max-w-[200px] block text-sm">
          {value || "-"}
        </span>
      ),
    },
    {
      key: "contentType",
      label: "形式",
      sortable: true,
      render: (value) => {
        if (!value) return "-"
        const short = value.replace("image/", "").replace("application/", "").toUpperCase()
        return <span className="text-xs font-mono">{short}</span>
      },
    },
    {
      key: "fileSizeBytes",
      label: "サイズ",
      sortable: true,
      render: (value) => <span className="text-sm">{formatFileSize(value)}</span>,
    },
    {
      key: "createdAt",
      label: "アップロード日時",
      sortable: true,
      render: (value) => <span className="text-sm">{formatDate(value)}</span>,
    },
  ]

  // Add documentTypeLabel for filtering
  const documentsWithLabel = documents.map((doc) => ({
    ...doc,
    documentTypeLabel:
      DOCUMENT_TYPE_LABELS[doc.documentType as DocumentType] || doc.documentType,
  }))

  const filters = [
    {
      key: "documentTypeLabel",
      label: "書類種別",
      options: Object.values(DOCUMENT_TYPE_LABELS).map((label) => ({
        value: label,
        label,
      })),
      multiple: true,
    },
  ]

  const handleRowClick = (doc: PersonDocumentWithPerson) => {
    router.push(`/people/${doc.personId}`)
  }

  if (loading) {
    return (
      <div className="p-6 space-y-6">
        <div>
          <h1 className="text-3xl font-bold text-foreground">書類管理</h1>
          <p className="text-muted-foreground mt-2">アップロードされた書類の一覧</p>
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
          <h1 className="text-3xl font-bold text-foreground">書類管理</h1>
          <p className="text-muted-foreground mt-2">アップロードされた書類の一覧</p>
        </div>
        <div className="flex items-center justify-center py-8">
          <div className="text-red-500">{error}</div>
        </div>
      </div>
    )
  }

  return (
    <div className="p-6 space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold text-foreground">書類管理</h1>
          <p className="text-muted-foreground mt-2">アップロードされた書類の一覧</p>
        </div>
      </div>

      <DataTable
        data={documentsWithLabel}
        columns={columns}
        filters={filters}
        searchKeys={["personName", "fileName", "documentTypeLabel"]}
        onRowClick={handleRowClick}
        initialSearchTerm={searchParams.get("search") || ""}
        initialActiveFilters={getFiltersFromUrl()}
        onFilterChange={updateUrl}
      />
    </div>
  )
}
