"use client"

import { useCallback, useEffect, useMemo, useState } from "react"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Search, UserPlus, Link, HelpCircle, Mail } from "lucide-react"
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog"
import { MembersTable } from "./members-table"
import { InviteMemberDialog } from "./invite-member-dialog"
import { AddExistingMemberDialog } from "./add-existing-member-dialog"
import { CreateUserDialog } from "./create-user-dialog"
import { InviteLinkDialog } from "./invite-link-dialog"
import { MemberOfficesDialog } from "./member-offices-dialog"
import { ConfirmDialog } from "./confirm-dialog"
import { EmptyState } from "./empty-state"
import { 
  getTenantMembers, 
  getTenantOffices,
  resendTenantInvitation,
  updateUserTenantRole,
  updateUserTenantOffices,
  removeUserFromTenant,
  type TenantOffice,
  type UserTenant
} from "@/lib/supabase/tenants"
import { useAuth } from "@/contexts/auth-context"
import { useToast } from "@/lib/hooks/use-toast"
import { canManageCompanyContacts as canManageCompanyContactsForActor } from "@/lib/tenant-access"
import { TenantMembersLoadingSkeleton } from "@/components/ui/funbase-loading"

interface TenantMembersPageProps {
  tenantId: string
}

export function TenantMembersPage({ tenantId }: TenantMembersPageProps) {
  const { user } = useAuth()
  const { toast } = useToast()
  const [members, setMembers] = useState<UserTenant[]>([])
  const [offices, setOffices] = useState<TenantOffice[]>([])
  const [searchQuery, setSearchQuery] = useState("")
  const [selectedMembers, setSelectedMembers] = useState<string[]>([])
  const [activeTab, setActiveTab] = useState("all")
  const [loading, setLoading] = useState(true)
  const [officeEditingMember, setOfficeEditingMember] = useState<UserTenant | null>(null)

  // Dialog states
  const [isInviteDialogOpen, setIsInviteDialogOpen] = useState(false)
  const [isAddDialogOpen, setIsAddDialogOpen] = useState(false)
  const [isCreateUserDialogOpen, setIsCreateUserDialogOpen] = useState(false)
  const [isInviteLinkDialogOpen, setIsInviteLinkDialogOpen] = useState(false)
  const [isPermissionRulesDialogOpen, setIsPermissionRulesDialogOpen] = useState(false)
  const [confirmDialog, setConfirmDialog] = useState<{
    open: boolean
    title: string
    description: string
    confirmText?: string
    onConfirm: () => void
    variant?: "default" | "destructive"
  }>({
    open: false,
    title: "",
    description: "",
    confirmText: "削除",
    onConfirm: () => {},
  })

  const fetchData = useCallback(async () => {
    try {
      setLoading(true)
      const [membersData, officesData] = await Promise.all([
        getTenantMembers(tenantId),
        getTenantOffices(tenantId),
      ])
      setMembers(membersData)
      setOffices(officesData)
    } catch (error) {
      console.error('Error fetching data:', error)
    } finally {
      setLoading(false)
    }
  }, [tenantId])

  useEffect(() => {
    fetchData()
  }, [fetchData])

  // Get current user's role in this tenant
  const currentUserMember = members.find(m => m.user_id === user?.id)
  const currentUserRole =
    currentUserMember?.role && currentUserMember.role !== 'supporter'
      ? currentUserMember.role
      : 'guest'
  const canManageMembers = currentUserRole === 'owner' || currentUserRole === 'admin'
  const canManageCompanyContacts = canManageCompanyContactsForActor(
    currentUserMember ? [{ role: currentUserMember.role }] : [],
    user?.email
  )
  const canCreateUser = currentUserRole === 'owner'

  // Filtered members based on search and tab
  const filteredMembers = useMemo(() => {
    let filtered = members

    // Search filter
    if (searchQuery) {
      filtered = filtered.filter(
        (member) =>
          (member.email || '').toLowerCase().includes(searchQuery.toLowerCase())
          || (member.offices || []).some((office) =>
            office.name.toLowerCase().includes(searchQuery.toLowerCase())
          )
      )
    }

    // Tab filter
    if (activeTab !== "all") {
      const statusMap: Record<string, string> = {
        active: "active",
        pending: "pending",
      }
      filtered = filtered.filter((member) => member.status === statusMap[activeTab])
    }

    return filtered
  }, [members, searchQuery, activeTab])

  // Handle member selection
  const handleSelectMember = (memberId: string, selected: boolean) => {
    setSelectedMembers((prev) => 
      selected 
        ? (prev.includes(memberId) ? prev : [...prev, memberId])
        : prev.filter((id) => id !== memberId)
    )
  }

  const handleSelectAll = (memberIds: string[], selected: boolean) => {
    setSelectedMembers((prev) =>
      selected
        ? Array.from(new Set([...prev, ...memberIds]))
        : prev.filter((memberId) => !memberIds.includes(memberId))
    )
  }

  // Handle role change
  const handleChangeRole = async (memberId: string, role: 'owner' | 'admin' | 'member' | 'guest') => {
    try {
      await updateUserTenantRole(tenantId, memberId, role)
      await fetchData()
    } catch (error) {
      console.error('Error updating role:', error)
    }
  }

  const handleUpdateMemberOffices = async (memberId: string, officeIds: string[]) => {
    await updateUserTenantOffices(tenantId, memberId, officeIds)
    await fetchData()
    toast({
      title: "完了",
      description: "所属先スコープを更新しました",
    })
  }

  // Handle member removal
  const handleDeleteMember = async (memberId: string) => {
    try {
      await removeUserFromTenant(tenantId, memberId)
      await fetchData()
      setSelectedMembers(prev => prev.filter(id => id !== memberId))
      toast({
        title: "完了",
        description: "メンバーの更新が完了しました",
      })
    } catch (error) {
      console.error('Error removing member:', error)
      toast({
        title: "エラー",
        description: error instanceof Error ? error.message : "メンバーの削除に失敗しました",
        variant: "destructive",
      })
    }
  }

  const handleResendInvite = async (memberId: string) => {
    try {
      await resendTenantInvitation(tenantId, memberId)
      toast({
        title: "招待メールを再送しました",
        description: "対象メンバーに最新の招待メールを送信しました",
      })
      await fetchData()
    } catch (error) {
      console.error("Error resending invitation:", error)
      toast({
        title: "エラー",
        description: error instanceof Error ? error.message : "招待メールの再送に失敗しました",
        variant: "destructive",
      })
    }
  }

  // Handle bulk actions
  const handleBulkAction = async (action: string) => {
    if (action === "delete") {
      try {
        await Promise.all(selectedMembers.map(id => removeUserFromTenant(tenantId, id)))
        await fetchData()
        setSelectedMembers([])
        toast({
          title: "完了",
          description: "選択したメンバーを更新しました",
        })
      } catch (error) {
        console.error('Error bulk deleting members:', error)
        toast({
          title: "エラー",
          description: "メンバーの一括削除に失敗しました",
          variant: "destructive",
        })
      }
    }
  }


  // Show delete confirmation
  const showDeleteConfirm = (memberId: string) => {
    const member = members.find((m) => m.id === memberId)
    if (!member) return

    setConfirmDialog({
      open: true,
      title: member.status === "pending" ? "招待をキャンセル" : "メンバーを削除",
      description:
        member.status === "pending"
          ? `${member.email || 'このメンバー'}さんの招待をキャンセルしますか？`
          : `${member.email || 'このメンバー'}さんをテナントから削除しますか？この操作は取り消せません。`,
      confirmText: member.status === "pending" ? "キャンセルする" : "削除",
      onConfirm: () => handleDeleteMember(memberId),
      variant: "destructive",
    })
  }

  const pendingCount = members.filter((m) => m.status === "pending").length
  const activeCount = members.filter((m) => m.status === "active").length
  const selectedMemberRecords = members.filter((member) =>
    selectedMembers.includes(member.id)
  )
  const bulkDeleteLabel =
    selectedMemberRecords.length > 0 &&
    selectedMemberRecords.every((member) => member.status === "pending")
      ? "一括キャンセル"
      : "一括削除"
  const inviteButtonLabel = canManageMembers
    ? "メールで招待"
    : "企業担当者を招待"

  if (loading) {
    return <TenantMembersLoadingSkeleton />
  }

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-3xl font-bold tracking-tight">メンバー</h1>
        <p className="text-muted-foreground">テナントのメンバーを管理します</p>
      </div>

      {/* Toolbar */}
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex flex-1 items-center gap-2">
          <div className="relative flex-1 max-w-sm">
            <Search className="absolute left-2 top-2.5 size-4 text-muted-foreground" />
            <Input
              placeholder="名前またはメールで検索..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="pl-8"
            />
          </div>
          {selectedMembers.length > 0 && canManageMembers && (
            <div className="flex items-center gap-2">
              <span className="text-sm text-muted-foreground">{selectedMembers.length}件選択中</span>
              <Button variant="outline" size="sm" onClick={() => handleBulkAction("delete")}>
                {bulkDeleteLabel}
              </Button>
            </div>
          )}
        </div>
        <div className="flex items-center gap-2">
          <Button 
            variant="outline" 
            size="sm"
            onClick={() => setIsPermissionRulesDialogOpen(true)}
          >
            <HelpCircle className="size-4 mr-2" />
            権限ルールを見る
          </Button>
          <Button 
            onClick={() => setIsInviteLinkDialogOpen(true)} 
            variant="outline" 
            disabled={!canManageMembers}
          >
            <Link className="size-4 mr-2" />
            招待リンクを作成
          </Button>
          <Button 
            onClick={() => setIsAddDialogOpen(true)} 
            variant="outline"
            disabled={!canManageMembers}
          >
            <UserPlus className="size-4 mr-2" />
            メンバーを追加
          </Button>
          <Button 
            onClick={() => setIsCreateUserDialogOpen(true)} 
            variant="outline"
            disabled={!canCreateUser}
          >
            <UserPlus className="size-4 mr-2" />
            ユーザーを作成
          </Button>
          <Button 
            onClick={() => setIsInviteDialogOpen(true)} 
            disabled={!canManageCompanyContacts}
          >
            <Mail className="size-4 mr-2" />
            {inviteButtonLabel}
          </Button>
        </div>
      </div>

      {/* Tabs */}
      <Tabs value={activeTab} onValueChange={setActiveTab}>
        <TabsList>
          <TabsTrigger value="all">すべて ({members.length})</TabsTrigger>
          <TabsTrigger value="pending">招待中 ({pendingCount})</TabsTrigger>
          <TabsTrigger value="active">アクティブ ({activeCount})</TabsTrigger>
        </TabsList>

        <TabsContent value="all" className="space-y-4">
          {filteredMembers.length === 0 ? (
            searchQuery ? (
              <div className="text-center py-8">
                <p className="text-muted-foreground">検索条件に一致するメンバーが見つかりません</p>
              </div>
            ) : (
              <EmptyState
                onAddMember={() => setIsInviteDialogOpen(true)}
                canAddMember={canManageCompanyContacts}
              />
            )
          ) : (
            <MembersTable
              members={filteredMembers}
              selectedMembers={selectedMembers}
              onSelectMember={handleSelectMember}
              onSelectAll={handleSelectAll}
              onChangeRole={handleChangeRole}
              onDeleteMember={showDeleteConfirm}
              onEditOffices={setOfficeEditingMember}
              onResendInvite={handleResendInvite}
              currentUserRole={currentUserRole}
              canManageCompanyContacts={canManageCompanyContacts}
              currentUserId={user?.id}
            />
          )}
        </TabsContent>

        <TabsContent value="pending" className="space-y-4">
          {filteredMembers.length === 0 ? (
            <div className="text-center py-8">
              <p className="text-muted-foreground">保留中のメンバーはいません</p>
            </div>
          ) : (
            <MembersTable
              members={filteredMembers}
              selectedMembers={selectedMembers}
              onSelectMember={handleSelectMember}
              onSelectAll={handleSelectAll}
              onChangeRole={handleChangeRole}
              onDeleteMember={showDeleteConfirm}
              onEditOffices={setOfficeEditingMember}
              onResendInvite={handleResendInvite}
              currentUserRole={currentUserRole}
              canManageCompanyContacts={canManageCompanyContacts}
              currentUserId={user?.id}
            />
          )}
        </TabsContent>

        <TabsContent value="active" className="space-y-4">
          {filteredMembers.length === 0 ? (
            <div className="text-center py-8">
              <p className="text-muted-foreground">アクティブなメンバーはいません</p>
            </div>
          ) : (
            <MembersTable
              members={filteredMembers}
              selectedMembers={selectedMembers}
              onSelectMember={handleSelectMember}
              onSelectAll={handleSelectAll}
              onChangeRole={handleChangeRole}
              onDeleteMember={showDeleteConfirm}
              onEditOffices={setOfficeEditingMember}
              onResendInvite={handleResendInvite}
              currentUserRole={currentUserRole}
              canManageCompanyContacts={canManageCompanyContacts}
              currentUserId={user?.id}
            />
          )}
        </TabsContent>
      </Tabs>

      {/* Dialogs */}
      <InviteMemberDialog
        tenantId={tenantId}
        open={isInviteDialogOpen}
        onOpenChange={setIsInviteDialogOpen}
        onInviteSent={fetchData}
        canChooseRole={canManageMembers}
        offices={offices}
      />

      <AddExistingMemberDialog
        tenantId={tenantId}
        open={isAddDialogOpen}
        onOpenChange={setIsAddDialogOpen}
        onAddMember={fetchData}
        offices={offices}
      />

      <CreateUserDialog
        tenantId={tenantId}
        open={isCreateUserDialogOpen}
        onOpenChange={setIsCreateUserDialogOpen}
        onUserCreated={fetchData}
      />

      <MemberOfficesDialog
        member={officeEditingMember}
        offices={offices}
        open={Boolean(officeEditingMember)}
        onOpenChange={(open) => {
          if (!open) {
            setOfficeEditingMember(null)
          }
        }}
        onSave={handleUpdateMemberOffices}
      />

      <InviteLinkDialog
        tenantId={tenantId}
        open={isInviteLinkDialogOpen}
        onOpenChange={setIsInviteLinkDialogOpen}
      />

      <ConfirmDialog
        open={confirmDialog.open}
        onOpenChange={(open) => setConfirmDialog((prev) => ({ ...prev, open }))}
        title={confirmDialog.title}
        description={confirmDialog.description}
        onConfirm={confirmDialog.onConfirm}
        variant={confirmDialog.variant}
        confirmText={confirmDialog.confirmText}
      />

      {/* Permission Rules Dialog */}
      <Dialog open={isPermissionRulesDialogOpen} onOpenChange={setIsPermissionRulesDialogOpen}>
        <DialogContent className="max-w-2xl">
          <DialogHeader>
            <DialogTitle>権限ルール</DialogTitle>
            <DialogDescription>
              各ロールの権限と制限について説明します
            </DialogDescription>
          </DialogHeader>
          
          <div className="space-y-4 py-2">
            {/* Owner Role */}
            <div className="space-y-2">
              <h3 className="font-semibold">Owner（オーナー）</h3>
              <ul className="text-sm space-y-1">
                <li>✓ テナントの全権限</li>
                <li>✓ メンバーの管理・ロール変更</li>
                <li>✗ 他のOwnerは降格・削除不可</li>
                <li>✗ 自分自身のロール変更・削除不可</li>
              </ul>
            </div>

            {/* Admin Role */}
            <div className="space-y-2 border-t pt-3">
              <h3 className="font-semibold">Admin（管理者）</h3>
              <ul className="text-sm space-y-1">
                <li>✓ メンバーの追加・削除</li>
                <li>✓ ロール変更（Owner以外）</li>
                <li>✗ Ownerの操作は不可</li>
                <li>✗ Ownerロールへの変更不可</li>
              </ul>
            </div>

            {/* Member Role */}
            <div className="space-y-2 border-t pt-3">
              <h3 className="font-semibold">Member（メンバー）</h3>
              <ul className="text-sm space-y-1">
                <li>✓ データの閲覧・編集</li>
                <li>△ 社内担当者の場合、企業担当者の招待・再送・削除のみ対応可</li>
                <li>✗ internal member のロール変更・追加は不可</li>
                <li>✗ 設定変更不可</li>
              </ul>
            </div>

            {/* Guest Role */}
            <div className="space-y-2 border-t pt-3">
              <h3 className="font-semibold">Guest（ゲスト）</h3>
              <ul className="text-sm space-y-1">
                <li>✓ データの閲覧のみ</li>
                <li>✗ データの編集不可</li>
                <li>✗ メンバー管理不可</li>
              </ul>
            </div>
          </div>

          <div className="flex justify-end">
            <Button onClick={() => setIsPermissionRulesDialogOpen(false)}>
              閉じる
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  )
}
