"use server"

import { createAdminClient } from "@/lib/supabase/client"
import { getConnector, listConnectors, getConnectionStatus } from "@/lib/db/connectors"
import { createSyncService } from "@/lib/sync/kintone-sync"
import type { SyncResult } from "@/lib/sync/kintone-sync"

export interface CompanyPrepConnector {
  id: string
  displayName: string
  connected: boolean
}

export interface CompanyPrepMember {
  email: string
  role: string
  status: string
}

export interface CompanyPrepLookup {
  tenant: { id: string; name: string; slug: string } | null
  connectors: CompanyPrepConnector[]
  members: CompanyPrepMember[]
}

// COID (kintone 法人マスタのレコードID) は tenants.slug として保存されている。
// scripts/audit-app98-mappings.ts の COID フィルタ運用と同じ前提。
export async function lookupCompanyByCoid(coid: string): Promise<CompanyPrepLookup> {
  const trimmed = coid.trim()
  if (!trimmed) {
    throw new Error("法人ID(COID)を入力してください")
  }

  const supabase = createAdminClient()

  const { data: tenant, error: tenantError } = await supabase
    .from("tenants")
    .select("id, name, slug")
    .eq("slug", trimmed)
    .maybeSingle()

  if (tenantError) {
    throw new Error(`テナント検索に失敗しました: ${tenantError.message}`)
  }

  if (!tenant) {
    return { tenant: null, connectors: [], members: [] }
  }

  const connectorRows = await listConnectors(tenant.id)
  const kintoneConnectors = connectorRows.filter((c) => c.provider === "kintone")

  const connectors: CompanyPrepConnector[] = await Promise.all(
    kintoneConnectors.map(async (c) => {
      const status = await getConnectionStatus(c.id)
      return {
        id: c.id,
        displayName: c.display_name,
        connected: status?.status === "connected",
      }
    })
  )

  const { data: memberRows, error: memberError } = await supabase
    .from("user_tenants")
    .select("email, role, status")
    .eq("tenant_id", tenant.id)
    .order("created_at", { ascending: false })

  if (memberError) {
    throw new Error(`メンバー取得に失敗しました: ${memberError.message}`)
  }

  return {
    tenant,
    connectors,
    members: memberRows || [],
  }
}

// 既存の POST /api/connectors/[id]/sync と同じ呼び出し（1コネクタ分の全アクティブapp_mappingを即時同期）。
export async function runConnectorPrepSync(connectorId: string): Promise<SyncResult> {
  const connector = await getConnector(connectorId)

  if (!connector) {
    throw new Error("コネクタが見つかりません")
  }

  if (connector.provider !== "kintone") {
    throw new Error("kintoneコネクタのみ同期できます")
  }

  const syncService = await createSyncService(connector.id, connector.tenant_id || "", "manual")
  return syncService.syncAll(undefined, undefined, {})
}
