"use client"

import { useState, useMemo } from "react"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
import { MembersToolbar } from "@/components/members-toolbar"
import { MembersTable } from "@/components/members-table"
import { EmptyState } from "@/components/empty-state"
import { AddMemberDialog } from "@/components/add-member-dialog"
import { InviteLinkDialog } from "@/components/invite-link-dialog"
import { ConfirmDialog } from "@/components/confirm-dialog"
import { members as initialMembers } from "@/data/members"
import { inviteLinks as initialInviteLinks } from "@/data/invites"
import type { TenantMember, TenantInviteLink, Role, MemberStatus } from "@/types/tenant"
import { useToast } from "@/hooks/use-toast"

export default function MembersPage() {
  const [members, setMembers] = useState<TenantMember[]>(initialMembers)
  const [inviteLinks, setInviteLinks] = useState<TenantInviteLink[]>(initialInviteLinks)
  const [searchQuery, setSearchQuery] = useState("")
  const [selectedMembers, setSelectedMembers] = useState<string[]>([])
  const [activeTab, setActiveTab] = useState("all")

  // ダイアログの状態
  const [addMemberOpen, setAddMemberOpen] = useState(false)
  const [inviteLinkOpen, setInviteLinkOpen] = useState(false)
  const [confirmDialog, setConfirmDialog] = useState<{
    open: boolean
    title: string
    description: string
    onConfirm: () => void
    variant?: "default" | "destructive"
  }>({
    open: false,
    title: "",
    description: "",
    onConfirm: () => {},
  })

  const { toast } = useToast()

  const currentUser = members.find((m) => m.isSelf) || members[0]

  // フィルタリングされたメンバー
  const filteredMembers = useMemo(() => {
    let filtered = members

    // 検索フィルタ
    if (searchQuery) {
      filtered = filtered.filter(
        (member) =>
          member.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
          member.email.toLowerCase().includes(searchQuery.toLowerCase()),
      )
    }

    // タブフィルタ
    if (activeTab !== "all") {
      const statusMap: Record<string, MemberStatus> = {
        active: "Active",
        pending: "Pending",
      }
      filtered = filtered.filter((member) => member.status === statusMap[activeTab])
    }

    return filtered
  }, [members, searchQuery, activeTab])

  // メンバー選択
  const handleSelectMember = (memberId: string, selected: boolean) => {
    setSelectedMembers((prev) => (selected ? [...prev, memberId] : prev.filter((id) => id !== memberId)))
  }

  const handleSelectAll = (selected: boolean) => {
    setSelectedMembers(selected ? filteredMembers.map((m) => m.id) : [])
  }

  // ロール変更
  const handleChangeRole = (memberId: string, role: Role) => {
    setMembers((prev) => prev.map((member) => (member.id === memberId ? { ...member, role } : member)))
    toast({
      title: "ロールを変更しました",
      description: `メンバーのロールを${role}に変更しました。`,
    })
  }

  // ステータス切り替え
  const handleToggleStatus = (memberId: string) => {
    setMembers((prev) =>
      prev.map((member) => {
        if (member.id === memberId) {
          const newStatus: MemberStatus = member.status === "Active" ? "Disabled" : "Active"
          return { ...member, status: newStatus }
        }
        return member
      }),
    )
    toast({
      title: "ステータスを変更しました",
      description: "メンバーのステータスを変更しました。",
    })
  }

  // メンバー削除
  const handleDeleteMember = (memberId: string) => {
    setMembers((prev) => prev.filter((member) => member.id !== memberId))
    setSelectedMembers((prev) => prev.filter((id) => id !== memberId))
    toast({
      title: "メンバーを削除しました",
      description: "メンバーをテナントから削除しました。",
    })
  }

  // 招待メール再送
  const handleResendInvite = (memberId: string) => {
    toast({
      title: "招待を再送信しました",
      description: "メンバーに招待メールを再送信しました。",
    })
  }

  // 一括操作
  const handleBulkAction = (action: string) => {
    if (action === "delete") {
      setMembers((prev) => prev.filter((member) => !selectedMembers.includes(member.id)))
      setSelectedMembers([])
      toast({
        title: "選択したメンバーを削除しました",
        description: `${selectedMembers.length}名のメンバーを削除しました。`,
      })
    }
  }

  // メンバー追加
  const handleAddMember = (newMember: Omit<TenantMember, "id" | "tenantId" | "lastActiveAt">) => {
    const member: TenantMember = {
      ...newMember,
      id: `mem_${Date.now()}`,
      tenantId: "tnt_001",
      lastActiveAt: undefined,
    }

    setMembers((prev) => [...prev, member])
    toast({
      title: "メンバーを追加しました",
      description: `${member.name}さんに招待メールを送信しました。`,
    })
  }

  // 招待リンク作成
  const handleCreateInviteLink = (linkData: Omit<TenantInviteLink, "id" | "url" | "createdAt">) => {
    const inviteLink: TenantInviteLink = {
      ...linkData,
      id: `inv_${Date.now()}`,
      url: `https://app.example.com/invite/inv_${Date.now()}`,
      createdAt: new Date().toISOString(),
    }

    setInviteLinks((prev) => [...prev, inviteLink])
    toast({
      title: "招待リンクを作成しました",
      description: "リンクをコピーしてメンバーに共有してください。",
    })
  }

  // 削除確認ダイアログ
  const showDeleteConfirm = (memberId: string) => {
    const member = members.find((m) => m.id === memberId)
    if (!member) return

    setConfirmDialog({
      open: true,
      title: "メンバーを削除",
      description: `${member.name}さんをテナントから削除しますか？この操作は取り消せません。`,
      onConfirm: () => handleDeleteMember(memberId),
      variant: "destructive",
    })
  }

  const pendingCount = members.filter((m) => m.status === "Pending").length
  const activeCount = members.filter((m) => m.status === "Active").length

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-3xl font-bold tracking-tight">メンバー</h1>
        <p className="text-muted-foreground">テナントのメンバーを管理します</p>
      </div>

      <MembersToolbar
        searchQuery={searchQuery}
        onSearchChange={setSearchQuery}
        onAddMember={() => setAddMemberOpen(true)}
        onCreateInviteLink={() => setInviteLinkOpen(true)}
        selectedCount={selectedMembers.length}
        onBulkAction={handleBulkAction}
        currentUser={currentUser}
      />

      <Tabs value={activeTab} onValueChange={setActiveTab}>
        <TabsList>
          <TabsTrigger value="all">All ({members.length})</TabsTrigger>
          <TabsTrigger value="pending">Pending ({pendingCount})</TabsTrigger>
          <TabsTrigger value="active">Active ({activeCount})</TabsTrigger>
        </TabsList>

        <TabsContent value="all" className="space-y-4">
          {filteredMembers.length === 0 ? (
            searchQuery ? (
              <div className="text-center py-8">
                <p className="text-muted-foreground">検索条件に一致するメンバーが見つかりません</p>
              </div>
            ) : (
              <EmptyState onAddMember={handleAddMember} />
            )
          ) : (
            <MembersTable
              members={filteredMembers}
              selectedMembers={selectedMembers}
              onSelectMember={handleSelectMember}
              onSelectAll={handleSelectAll}
              onChangeRole={handleChangeRole}
              onToggleStatus={handleToggleStatus}
              onDeleteMember={showDeleteConfirm}
              onResendInvite={handleResendInvite}
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
              onToggleStatus={handleToggleStatus}
              onDeleteMember={showDeleteConfirm}
              onResendInvite={handleResendInvite}
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
              onToggleStatus={handleToggleStatus}
              onDeleteMember={showDeleteConfirm}
              onResendInvite={handleResendInvite}
            />
          )}
        </TabsContent>
      </Tabs>

      {/* ダイアログ */}
      <AddMemberDialog
        open={addMemberOpen}
        onOpenChange={setAddMemberOpen}
        onAddMember={handleAddMember}
        existingEmails={members.map((m) => m.email.toLowerCase())}
      />

      <InviteLinkDialog
        open={inviteLinkOpen}
        onOpenChange={setInviteLinkOpen}
        onCreateInviteLink={handleCreateInviteLink}
      />

      <ConfirmDialog
        open={confirmDialog.open}
        onOpenChange={(open) => setConfirmDialog((prev) => ({ ...prev, open }))}
        title={confirmDialog.title}
        description={confirmDialog.description}
        onConfirm={confirmDialog.onConfirm}
        variant={confirmDialog.variant}
        confirmText="削除"
      />
    </div>
  )
}
