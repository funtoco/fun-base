"use client"

import { useRouter } from "next/navigation"
import { ArrowLeft } from "lucide-react"
import { Button } from "@/components/ui/button"
import { TenantMembersPage } from "@/components/tenant/tenant-members-page"

interface AdminTenantMembersPageProps {
  params: {
    tenantId: string
  }
}

export default function AdminTenantMembersPage({ params }: AdminTenantMembersPageProps) {
  const router = useRouter()

  return (
    <div className="p-6 space-y-6">
      <div className="flex items-center gap-4">
        <Button variant="ghost" size="sm" onClick={() => router.push("/admin/tenants")}>
          <ArrowLeft className="h-4 w-4 mr-2" />
          テナント一覧に戻る
        </Button>
        <div>
          <h1 className="text-3xl font-bold text-foreground">テナント管理</h1>
          <p className="text-muted-foreground mt-1">メンバーと権限を管理します</p>
        </div>
      </div>
      <TenantMembersPage tenantId={params.tenantId} />
    </div>
  )
}
