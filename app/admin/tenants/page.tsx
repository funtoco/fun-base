"use client"

import { useState, useEffect } from "react"
import { useRouter } from "next/navigation"
import Link from "next/link"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Badge } from "@/components/ui/badge"
import { Avatar, AvatarFallback } from "@/components/ui/avatar"
import { ArrowLeft, Building2, Search, Users, Plus, Trash2, Pencil, X } from "lucide-react"
import { CreateTenantDialog } from "@/components/tenant/create-tenant-dialog"
import { TenantEditDialog } from "@/components/tenant/tenant-edit-dialog"
import { createTenantAction, getTenantsAction, isUserOwnerOfAnyTenant, type CreateTenantData } from "@/lib/actions/tenant-actions"
import { deleteTenant, updateTenant } from "@/lib/supabase/tenants"
import { useAuth } from "@/contexts/auth-context"
import { useToast } from "@/lib/hooks/use-toast"
import { Tenant } from "@/tenant-management/types/tenant"
import { TenantListLoadingSkeleton } from "@/components/ui/funbase-loading"

export default function AdminTenantsPage() {
  const router = useRouter()
  const { user, loading: authLoading } = useAuth()
  const { toast } = useToast()
  const [tenants, setTenants] = useState<Tenant[]>([])
  const [userTenants, setUserTenants] = useState<any[]>([])
  const [loading, setLoading] = useState(true)
  const [editingTenant, setEditingTenant] = useState<Tenant | null>(null)
  const [isCreateDialogOpen, setIsCreateDialogOpen] = useState(false)
  const [isOwner, setIsOwner] = useState(false)
  const [searchQuery, setSearchQuery] = useState("")

  useEffect(() => {
    if (!authLoading && user) {
      fetchData()
    }
  }, [user, authLoading])

  const fetchData = async () => {
    try {
      setLoading(true)
      const tenantsData: Tenant[] = await getTenantsAction()
      setTenants(tenantsData)
      
      // Check if user is owner
      const userIsOwner = await isUserOwnerOfAnyTenant()
      setIsOwner(userIsOwner)
    } catch (error) {
      console.error('Error fetching data:', error)
      toast({
        title: "エラー",
        description: "テナントの取得に失敗しました",
        variant: "destructive",
      })
    } finally {
      setLoading(false)
    }
  }

  const handleUpdateTenant = async (tenantId: string, data: { name: string; description: string; slug: string }) => {
    try {
      const result = await updateTenant(tenantId, data)
      if (result.success) {
        toast({
          title: "成功",
          description: "テナント情報が更新されました",
        })
        await fetchData()
      } else {
        toast({
          title: "エラー",
          description: result.error || "更新に失敗しました",
          variant: "destructive",
        })
      }
    } catch (error) {
      console.error('Error updating tenant:', error)
      toast({
        title: "エラー",
        description: "テナントの更新に失敗しました",
        variant: "destructive",
      })
    }
  }

  const handleCreateTenant = async (tenantData: CreateTenantData) => {
    try {
      await createTenantAction(tenantData)
      await fetchData() // Refresh the list
      toast({
        title: "成功",
        description: "テナントが作成されました",
      })
    } catch (error) {
      console.error('Error creating tenant:', error)
      toast({
        title: "エラー",
        description: error instanceof Error ? error.message : "テナントの作成に失敗しました",
        variant: "destructive",
      })
    }
  }

  const handleDeleteTenant = async (tenantId: string, tenantName: string) => {
    if (!confirm(`「${tenantName}」を削除しますか？この操作は取り消せません。`)) {
      return
    }

    try {
      const result = await deleteTenant(tenantId)
      
      if (result.success) {
        await fetchData() // Refresh the list
        toast({
          title: "成功",
          description: "テナントが削除されました",
        })
      } else {
        toast({
          title: "エラー",
          description: result.error || "テナントの削除に失敗しました",
          variant: "destructive",
        })
      }
    } catch (error) {
      console.error('Error deleting tenant:', error)
      toast({
        title: "エラー",
        description: "テナントの削除に失敗しました",
        variant: "destructive",
      })
    }
  }

  const normalizedSearchQuery = searchQuery.trim().toLowerCase()
  const filteredTenants = normalizedSearchQuery
    ? tenants.filter((tenant) => tenant.name.toLowerCase().includes(normalizedSearchQuery))
    : tenants

  if (authLoading || loading) {
    return <TenantListLoadingSkeleton />
  }

  if (!user) {
    return (
      <div className="p-6 space-y-6">
        <div className="flex items-center gap-4">
          <Button variant="ghost" size="sm" onClick={() => router.back()}>
            <ArrowLeft className="h-4 w-4 mr-2" />
            戻る
          </Button>
          <div>
            <h1 className="text-3xl font-bold text-foreground">テナント管理</h1>
            <p className="text-muted-foreground mt-2">ログインが必要です</p>
          </div>
        </div>
      </div>
    )
  }

  return (
    <div className="p-6 space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-4">
          <Button variant="ghost" size="sm" onClick={() => router.back()}>
            <ArrowLeft className="h-4 w-4 mr-2" />
            戻る
          </Button>
          <div>
            <h1 className="text-3xl font-bold text-foreground">テナント管理</h1>
            <p className="text-muted-foreground mt-1">テナントとメンバーを管理します</p>
          </div>
        </div>
        {isOwner && (
          <Button onClick={() => setIsCreateDialogOpen(true)}>
            <Plus className="h-4 w-4 mr-2" />
            新しいテナント
          </Button>
        )}
      </div>

      {tenants.length > 0 && (
        <div className="flex flex-col gap-2 sm:max-w-md">
          <div className="relative">
            <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
            <Input
              value={searchQuery}
              onChange={(event) => setSearchQuery(event.target.value)}
              placeholder="法人名で検索"
              className="pl-9 pr-10"
              aria-label="法人名で検索"
            />
            {searchQuery && (
              <Button
                type="button"
                variant="ghost"
                size="sm"
                className="absolute right-1 top-1/2 h-7 w-7 -translate-y-1/2 p-0"
                onClick={() => setSearchQuery("")}
                aria-label="検索条件をクリア"
              >
                <X className="h-4 w-4" />
              </Button>
            )}
          </div>
          {searchQuery && (
            <p className="text-sm text-muted-foreground">
              {filteredTenants.length}件の法人が見つかりました
            </p>
          )}
        </div>
      )}

      {/* Tenants List */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
        {filteredTenants.map((tenant) => {
          const userTenant = userTenants.find(ut => ut.tenant_id === tenant.id)
          const userRole = userTenant?.role || 'guest'
          
          return (
            <Card 
              key={tenant.id} 
              className="hover:shadow-md transition-shadow relative"
            >
              <CardHeader>
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-3">
                    <Avatar className="h-10 w-10">
                      <AvatarFallback className="text-lg">
                        {tenant.name.charAt(0)}
                      </AvatarFallback>
                    </Avatar>
                    <div>
                      <CardTitle className="text-lg">{tenant.name}</CardTitle>
                      <CardDescription>{tenant.slug}</CardDescription>
                    </div>
                  </div>
                  {(userRole === 'owner' || userRole === 'admin') && (
                    <div className="flex gap-1" onClick={(e) => e.stopPropagation()}>
                      <Button 
                        variant="ghost" 
                        size="sm" 
                        className="h-8 w-8 p-0"
                        onClick={() => setEditingTenant(tenant)}
                      >
                        <Pencil className="h-4 w-4" />
                      </Button>
                      {userRole === 'owner' && (
                        <Button 
                          variant="ghost" 
                          size="sm" 
                          className="h-8 w-8 p-0 text-red-600 hover:text-red-700 hover:bg-red-50"
                          onClick={() => handleDeleteTenant(tenant.id, tenant.name)}
                        >
                          <Trash2 className="h-4 w-4" />
                        </Button>
                      )}
                    </div>
                  )}
                </div>
              </CardHeader>
              <CardContent>
                <div className="space-y-3">
                  {tenant.description && (
                    <p className="text-sm text-muted-foreground">{tenant.description}</p>
                  )}
                  
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2">
                      <Badge variant={userRole === 'owner' ? 'default' : userRole === 'admin' ? 'secondary' : 'outline'}>
                        {userRole === 'owner' ? 'オーナー' : 
                         userRole === 'admin' ? '管理者' : 
                         userRole === 'member' ? 'メンバー' : 'ゲスト'}
                      </Badge>
                    </div>
                    <div className="text-sm text-muted-foreground">
                      {tenant.max_members}人まで
                    </div>
                  </div>

                  <Button 
                    variant="outline" 
                    className="w-full"
                    asChild
                  >
                    <Link href={`/admin/tenants/${tenant.id}`}>
                      <Users className="h-4 w-4 mr-2" />
                      メンバー管理
                    </Link>
                  </Button>
                </div>
              </CardContent>
            </Card>
          )
        })}
      </div>

      {tenants.length > 0 && filteredTenants.length === 0 && (
        <Card>
          <CardContent className="pt-6">
            <div className="text-center py-12">
              <Search className="h-12 w-12 text-muted-foreground mx-auto mb-4" />
              <h3 className="text-lg font-semibold mb-2">該当する法人がありません</h3>
              <p className="text-muted-foreground mb-6">
                検索条件を変えてもう一度お試しください。
              </p>
              <Button variant="outline" onClick={() => setSearchQuery("")}>
                検索条件をクリア
              </Button>
            </div>
          </CardContent>
        </Card>
      )}

      {tenants.length === 0 && (
        <Card>
          <CardContent className="pt-6">
            <div className="text-center py-12">
              <Building2 className="h-12 w-12 text-muted-foreground mx-auto mb-4" />
              <h3 className="text-lg font-semibold mb-2">テナントがありません</h3>
              <p className="text-muted-foreground mb-6">
                新しいテナントを作成して、チームでの作業を始めましょう。
              </p>
              {isOwner && (
                <Button onClick={() => setIsCreateDialogOpen(true)}>
                  <Plus className="h-4 w-4 mr-2" />
                  新しいテナントを作成
                </Button>
              )}
              {!isOwner && (
                <p className="text-sm text-muted-foreground">
                  テナントを作成する権限がありません。オーナーのみがテナントを作成できます。
                </p>
              )}
            </div>
          </CardContent>
        </Card>
      )}

      {/* Create Tenant Dialog */}
      <CreateTenantDialog
        open={isCreateDialogOpen}
        onOpenChange={setIsCreateDialogOpen}
        onCreateTenant={handleCreateTenant}
      />

      <TenantEditDialog
        tenant={editingTenant}
        open={!!editingTenant}
        onOpenChange={(open) => !open && setEditingTenant(null)}
        onSave={handleUpdateTenant}
      />
    </div>
  )
}
