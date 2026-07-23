"use client"

import Link from "next/link"
import { useParams } from "next/navigation"
import { ArrowLeft } from "lucide-react"
import { Button } from "@/components/ui/button"
import { CompanyCaseView } from "@/components/portal/company-case-view"
import { OpsCaseView } from "@/components/portal/ops-case-view"
import { usePortal } from "@/components/portal/portal-provider"
import { useAuth } from "@/contexts/auth-context"
import { getVisaWorkspaceRole } from "@/lib/visa-access"

export default function VisaCasePage() {
  const { caseId } = useParams<{ caseId: string }>()
  const { cases } = usePortal()
  const { user, role } = useAuth()
  const item = cases.find((entry) => entry.id === caseId)
  const workspaceRole = getVisaWorkspaceRole(user?.email, role)

  if (!item) {
    return <div className="p-6"><div className="mx-auto max-w-3xl rounded-xl border border-dashed bg-card p-16 text-center"><p className="text-lg font-medium">申請案件が見つかりませんでした</p><p className="mt-2 text-sm text-muted-foreground">ビザ進捗管理から対象の人材を選択してください。</p><Button asChild className="mt-6" variant="outline"><Link href="/visas"><ArrowLeft data-icon="inline-start" />ビザ進捗管理へ戻る</Link></Button></div></div>
  }

  return <div className="p-6">{workspaceRole === "ops" ? <OpsCaseView item={item} /> : <CompanyCaseView item={item} />}</div>
}
