"use client"

import { useCallback, useEffect, useState } from "react"
import { useRouter } from "next/navigation"
import { ArrowLeft, Building2 } from "lucide-react"
import { Button } from "@/components/ui/button"
import { TenantMembersPage } from "@/components/tenant/tenant-members-page"
import { getTenantById, type Tenant } from "@/lib/supabase/tenants"

interface AdminTenantMembersPageProps {
  params: {
    tenantId: string
  }
}

export default function AdminTenantMembersPage({ params }: AdminTenantMembersPageProps) {
  const router = useRouter()
  const [tenant, setTenant] = useState<Tenant | null>(null)
  const [tenantLoading, setTenantLoading] = useState(true)

  const fetchTenant = useCallback(async () => {
    try {
      setTenantLoading(true)
      const tenantData = await getTenantById(params.tenantId)
      setTenant(tenantData)
    } catch (error) {
      console.error("Error fetching tenant:", error)
      setTenant(null)
    } finally {
      setTenantLoading(false)
    }
  }, [params.tenantId])

  useEffect(() => {
    fetchTenant()
  }, [fetchTenant])

  return (
    <div className="p-6 space-y-6">
      <div className="flex items-center gap-4">
        <Button variant="ghost" size="sm" onClick={() => router.push("/admin/tenants")}>
          <ArrowLeft className="h-4 w-4 mr-2" />
          テナント一覧に戻る
        </Button>
        <div>
          <h1 className="text-3xl font-bold text-foreground">テナント管理</h1>
          <div className="mt-1 flex flex-wrap items-center gap-x-3 gap-y-1">
            <p className="text-muted-foreground">メンバーと権限を管理します</p>
            <div className="flex min-w-0 items-center gap-1.5 rounded-md border bg-muted/40 px-2.5 py-1 text-sm">
              <Building2 className="h-4 w-4 shrink-0 text-muted-foreground" />
              <span className="shrink-0 text-muted-foreground">選択中の法人:</span>
              {tenantLoading ? (
                <span className="funbase-loader-shimmer h-4 w-32 rounded-full bg-muted" />
              ) : (
                <span className="min-w-0 truncate font-medium text-foreground">
                  {tenant?.name || "不明な法人"}
                </span>
              )}
            </div>
          </div>
        </div>
      </div>
      <TenantMembersPage tenantId={params.tenantId} />
    </div>
  )
}
