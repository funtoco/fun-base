"use client"

import { useState } from "react"
import { useRouter } from "next/navigation"
import Link from "next/link"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Badge } from "@/components/ui/badge"
import { Alert, AlertDescription } from "@/components/ui/alert"
import { ArrowLeft, Search, RefreshCw, ExternalLink, AlertCircle } from "lucide-react"
import { useToast } from "@/lib/hooks/use-toast"
import {
  lookupCompanyByCoid,
  runConnectorPrepSync,
  type CompanyPrepLookup,
} from "@/lib/actions/company-prep-actions"
import type { SyncResult } from "@/lib/sync/kintone-sync"

export default function AdminPreparePage() {
  const router = useRouter()
  const { toast } = useToast()

  const [coid, setCoid] = useState("")
  const [searching, setSearching] = useState(false)
  const [result, setResult] = useState<CompanyPrepLookup | null>(null)
  const [syncingConnectorId, setSyncingConnectorId] = useState<string | null>(null)
  const [syncResults, setSyncResults] = useState<Record<string, SyncResult>>({})

  const handleSearch = async () => {
    if (!coid.trim()) return
    setSearching(true)
    setResult(null)
    setSyncResults({})
    try {
      const lookup = await lookupCompanyByCoid(coid)
      setResult(lookup)
      if (!lookup.tenant) {
        toast({
          title: "テナントが見つかりません",
          description: "この法人IDに対応するFunBaseテナントがまだ作成されていません。先にテナント作成が必要です。",
          variant: "destructive",
        })
      }
    } catch (error) {
      toast({
        title: "検索に失敗しました",
        description: error instanceof Error ? error.message : "不明なエラー",
        variant: "destructive",
      })
    } finally {
      setSearching(false)
    }
  }

  const handleSync = async (connectorId: string) => {
    setSyncingConnectorId(connectorId)
    try {
      const syncResult = await runConnectorPrepSync(connectorId)
      setSyncResults((prev) => ({ ...prev, [connectorId]: syncResult }))
      toast({
        title: syncResult.success ? "同期が完了しました" : "同期はエラーを含んで完了しました",
        description: Object.entries(syncResult.synced)
          .map(([type, count]) => `${type}: ${count}件`)
          .join(" / ") || "同期対象がありませんでした",
        variant: syncResult.success ? "default" : "destructive",
      })
    } catch (error) {
      toast({
        title: "同期に失敗しました",
        description: error instanceof Error ? error.message : "不明なエラー",
        variant: "destructive",
      })
    } finally {
      setSyncingConnectorId(null)
    }
  }

  const pendingMembers = result?.members.filter((m) => m.status === "pending") || []
  const activeMembers = result?.members.filter((m) => m.status === "active") || []

  return (
    <div className="p-6 space-y-6 max-w-3xl">
      <div className="flex items-center gap-4">
        <Button variant="ghost" size="sm" onClick={() => router.back()}>
          <ArrowLeft className="h-4 w-4 mr-2" />
          戻る
        </Button>
        <div>
          <h1 className="text-3xl font-bold text-foreground">ビザ案件 事前準備</h1>
          <p className="text-muted-foreground mt-1">
            kintoneでビザ案件を作成する前に、法人ID(COID)からFunBase側の同期状況を確認・即時同期できます
          </p>
        </div>
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="text-lg">法人ID(COID)で検索</CardTitle>
          <CardDescription>kintone 法人マスタのレコードID(数値)を入力してください</CardDescription>
        </CardHeader>
        <CardContent>
          <div className="flex gap-2">
            <Input
              value={coid}
              onChange={(e) => setCoid(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && handleSearch()}
              placeholder="例: 3937"
              className="max-w-xs"
            />
            <Button onClick={handleSearch} disabled={searching || !coid.trim()}>
              <Search className="h-4 w-4 mr-2" />
              {searching ? "検索中..." : "検索"}
            </Button>
          </div>
        </CardContent>
      </Card>

      {result && !result.tenant && (
        <Alert variant="destructive">
          <AlertCircle className="h-4 w-4" />
          <AlertDescription>
            法人ID「{coid}」に対応するFunBaseテナントが見つかりませんでした。新規法人の場合は
            <Link href="/admin/tenants" className="underline mx-1">
              テナント管理
            </Link>
            からテナント・コネクタの作成が必要です。
          </AlertDescription>
        </Alert>
      )}

      {result?.tenant && (
        <>
          <Card>
            <CardHeader>
              <CardTitle className="text-lg">{result.tenant.name}</CardTitle>
              <CardDescription>slug: {result.tenant.slug}</CardDescription>
            </CardHeader>
            <CardContent className="space-y-3">
              {result.connectors.length === 0 && (
                <Alert variant="destructive">
                  <AlertCircle className="h-4 w-4" />
                  <AlertDescription>
                    kintoneコネクタが未作成です。同期を実行する前に管理者にコネクタ作成を依頼してください。
                  </AlertDescription>
                </Alert>
              )}

              {result.connectors.map((connector) => {
                const syncResult = syncResults[connector.id]
                return (
                  <div key={connector.id} className="border rounded-lg p-4 space-y-3">
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-2">
                        <span className="font-medium">{connector.displayName}</span>
                        <Badge variant={connector.connected ? "default" : "secondary"}>
                          {connector.connected ? "接続中" : "未接続"}
                        </Badge>
                      </div>
                      <div className="flex gap-2">
                        <Button variant="outline" size="sm" asChild>
                          <Link href={`/admin/connectors/${connector.id}`}>
                            <ExternalLink className="h-4 w-4 mr-1" />
                            詳細
                          </Link>
                        </Button>
                        <Button
                          size="sm"
                          onClick={() => handleSync(connector.id)}
                          disabled={syncingConnectorId === connector.id || !connector.connected}
                        >
                          <RefreshCw
                            className={`h-4 w-4 mr-1 ${syncingConnectorId === connector.id ? "animate-spin" : ""}`}
                          />
                          {syncingConnectorId === connector.id ? "同期中..." : "個別同期を実行"}
                        </Button>
                      </div>
                    </div>

                    {syncResult && (
                      <div className="text-sm space-y-1 bg-muted rounded-md p-3">
                        <p className="font-medium">
                          {syncResult.success ? "✅ 同期成功" : "⚠️ エラーあり"}（{(syncResult.duration / 1000).toFixed(1)}秒）
                        </p>
                        {Object.entries(syncResult.synced).map(([type, count]) => (
                          <p key={type} className="text-muted-foreground">
                            {type}: {count}件
                          </p>
                        ))}
                        {syncResult.errors.map((err, i) => (
                          <p key={i} className="text-destructive">
                            {err}
                          </p>
                        ))}
                      </div>
                    )}
                  </div>
                )
              })}
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <div className="flex items-center justify-between">
                <div>
                  <CardTitle className="text-lg">先方企業アカウント</CardTitle>
                  <CardDescription>
                    有効 {activeMembers.length}件 / 招待中 {pendingMembers.length}件
                  </CardDescription>
                </div>
                <Button variant="outline" size="sm" asChild>
                  <Link href={`/admin/tenants/${result.tenant.id}`}>
                    <ExternalLink className="h-4 w-4 mr-1" />
                    このテナントのメンバー管理へ
                  </Link>
                </Button>
              </div>
            </CardHeader>
            <CardContent className="space-y-2">
              {result.members.length === 0 && (
                <p className="text-sm text-muted-foreground">
                  まだメンバーが登録されていません。上のリンクから先方企業の担当者を招待してください。
                </p>
              )}
              {result.members.map((member, i) => (
                <div key={i} className="flex items-center justify-between text-sm border-b last:border-0 py-2">
                  <span>{member.email}</span>
                  <div className="flex gap-2">
                    <Badge variant="outline">{member.role}</Badge>
                    <Badge variant={member.status === "active" ? "default" : "secondary"}>
                      {member.status === "active" ? "有効" : member.status === "pending" ? "招待中" : member.status}
                    </Badge>
                  </div>
                </div>
              ))}
            </CardContent>
          </Card>
        </>
      )}
    </div>
  )
}
