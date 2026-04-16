"use client"

import { useState, useEffect } from "react"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import { Avatar, AvatarFallback } from "@/components/ui/avatar"
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table"
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from "@/components/ui/dropdown-menu"
import { MoreHorizontal, UserPlus, Crown, Shield, User, UserCheck, Mail } from "lucide-react"
import { getTenantMembers, updateUserTenantRole, removeUserFromTenant, type UserTenant } from "@/lib/supabase/tenants"
import { InviteMemberDialog } from "./invite-member-dialog"
import { AddExistingMemberDialog } from "./add-existing-member-dialog"

interface TenantMembersSectionProps {
  tenantId: string
  currentUserRole: 'owner' | 'admin' | 'member' | 'guest'
}

export function TenantMembersSection({ tenantId, currentUserRole }: TenantMembersSectionProps) {
  const [members, setMembers] = useState<UserTenant[]>([])
  const [loading, setLoading] = useState(true)
  const [isInviteDialogOpen, setIsInviteDialogOpen] = useState(false)
  const [isAddDialogOpen, setIsAddDialogOpen] = useState(false)

  const canManageMembers = currentUserRole === 'owner' || currentUserRole === 'admin'

  useEffect(() => {
    fetchMembers()
  }, [tenantId])

  const fetchMembers = async () => {
    try {
      setLoading(true)
      const membersData = await getTenantMembers(tenantId)
      setMembers(membersData)
    } catch (error) {
      console.error('Error fetching members:', error)
    } finally {
      setLoading(false)
    }
  }

  const handleRoleChange = async (userTenantId: string, newRole: 'owner' | 'admin' | 'member' | 'guest') => {
    try {
      await updateUserTenantRole(tenantId, userTenantId, newRole)
      await fetchMembers()
    } catch (error) {
      console.error('Error updating role:', error)
    }
  }

  const handleRemoveMember = async (userTenantId: string) => {
    if (!confirm('このメンバーを削除しますか？')) return
    
    try {
      await removeUserFromTenant(tenantId, userTenantId)
      await fetchMembers()
    } catch (error) {
      console.error('Error removing member:', error)
    }
  }

  const getRoleIcon = (role: string) => {
    switch (role) {
      case 'owner':
        return <Crown className="h-4 w-4 text-yellow-500" />
      case 'admin':
        return <Shield className="h-4 w-4 text-blue-500" />
      case 'member':
        return <User className="h-4 w-4 text-green-500" />
      case 'guest':
        return <UserCheck className="h-4 w-4 text-gray-500" />
      default:
        return <User className="h-4 w-4" />
    }
  }

  const getRoleBadgeVariant = (role: string) => {
    switch (role) {
      case 'owner':
        return 'default' as const
      case 'admin':
        return 'secondary' as const
      case 'member':
        return 'outline' as const
      case 'guest':
        return 'outline' as const
      default:
        return 'outline' as const
    }
  }

  const activeMembers = members.filter(m => m.status === 'active')
  const pendingMembers = members.filter(m => m.status === 'pending')

  return (
    <div className="space-y-6">
      {/* Team Members Section */}
      <Card>
        <CardHeader>
          <div className="flex items-center justify-between">
            <div>
              <CardTitle>チームメンバー</CardTitle>
              <CardDescription>
                {activeMembers.length} of {activeMembers.length} seats used. (10 max)
              </CardDescription>
            </div>
            {canManageMembers && (
              <div className="flex gap-2">
                <Button variant="outline" size="sm">
                  シート管理
                </Button>
                <Button variant="outline" size="sm" onClick={() => setIsAddDialogOpen(true)}>
                  <UserPlus className="h-4 w-4 mr-2" />
                  メンバーを追加
                </Button>
                <Button size="sm" onClick={() => setIsInviteDialogOpen(true)}>
                  <Mail className="h-4 w-4 mr-2" />
                  招待を送信
                </Button>
              </div>
            )}
          </div>
        </CardHeader>
        <CardContent>
          {loading ? (
            <div className="text-center py-8 text-muted-foreground">
              読み込み中...
            </div>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>メールアドレス</TableHead>
                  <TableHead>ロール</TableHead>
                  {canManageMembers && <TableHead className="w-[50px]"></TableHead>}
                </TableRow>
              </TableHeader>
              <TableBody>
                {activeMembers.map((member) => (
                  <TableRow key={member.id}>
                    <TableCell>
                      <div className="flex items-center gap-3">
                        <Avatar className="h-8 w-8">
                          <AvatarFallback className="text-xs">
                            {member.email?.charAt(0) || 'U'}
                          </AvatarFallback>
                        </Avatar>
                        <div>
                          <div className="font-medium">
                            {member.email || 'Unknown User'}
                          </div>
                        </div>
                      </div>
                    </TableCell>
                    <TableCell>
                      <div className="flex items-center gap-2">
                        {getRoleIcon(member.role)}
                        <Badge variant={getRoleBadgeVariant(member.role)}>
                          {member.role === 'owner' ? 'オーナー' : 
                           member.role === 'admin' ? '管理者' :
                           member.role === 'member' ? 'メンバー' : 'ゲスト'}
                        </Badge>
                      </div>
                    </TableCell>
                    {canManageMembers && (
                      <TableCell>
                        <DropdownMenu>
                          <DropdownMenuTrigger asChild>
                            <Button variant="ghost" size="sm">
                              <MoreHorizontal className="h-4 w-4" />
                            </Button>
                          </DropdownMenuTrigger>
                          <DropdownMenuContent align="end">
                            {member.role !== 'owner' && (
                              <>
                                <DropdownMenuItem onClick={() => handleRoleChange(member.id, 'admin')}>
                                  管理者に変更
                                </DropdownMenuItem>
                                <DropdownMenuItem onClick={() => handleRoleChange(member.id, 'member')}>
                                  メンバーに変更
                                </DropdownMenuItem>
                                <DropdownMenuItem onClick={() => handleRoleChange(member.id, 'guest')}>
                                  ゲストに変更
                                </DropdownMenuItem>
                                <DropdownMenuItem 
                                  onClick={() => handleRemoveMember(member.id)}
                                  className="text-red-600"
                                >
                                  削除
                                </DropdownMenuItem>
                              </>
                            )}
                          </DropdownMenuContent>
                        </DropdownMenu>
                      </TableCell>
                    )}
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>

      {/* Pending Invitations Section */}
      {pendingMembers.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle>招待中のメンバー</CardTitle>
            <CardDescription>
              {pendingMembers.length} 件の招待が保留中です
            </CardDescription>
          </CardHeader>
          <CardContent>
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>名前</TableHead>
                  <TableHead>メールアドレス</TableHead>
                  <TableHead>ロール</TableHead>
                  <TableHead>ステータス</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {pendingMembers.map((member) => (
                  <TableRow key={member.id}>
                    <TableCell>
                      <div className="flex items-center gap-3">
                        <Avatar className="h-8 w-8">
                          <AvatarFallback className="text-xs">
                            {member.user?.user_metadata?.name?.charAt(0) || member.user?.email?.charAt(0) || 'U'}
                          </AvatarFallback>
                        </Avatar>
                        <div>
                          <div className="font-medium">
                            {member.user?.user_metadata?.name || member.user?.email || 'Unknown User'}
                          </div>
                        </div>
                      </div>
                    </TableCell>
                    <TableCell>{member.user?.email}</TableCell>
                    <TableCell>
                      <div className="flex items-center gap-2">
                        {getRoleIcon(member.role)}
                        <Badge variant={getRoleBadgeVariant(member.role)}>
                          {member.role === 'owner' ? 'オーナー' : 
                           member.role === 'admin' ? '管理者' :
                           member.role === 'member' ? 'メンバー' : 'ゲスト'}
                        </Badge>
                      </div>
                    </TableCell>
                    <TableCell>
                      <Badge variant="outline" className="text-orange-600">
                        招待中
                      </Badge>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </CardContent>
        </Card>
      )}

      {/* Invite Member Dialog */}
      <InviteMemberDialog
        tenantId={tenantId}
        open={isInviteDialogOpen}
        onOpenChange={setIsInviteDialogOpen}
        onInviteSent={fetchMembers}
      />

      {/* Add Existing Member Dialog */}
      <AddExistingMemberDialog
        tenantId={tenantId}
        open={isAddDialogOpen}
        onOpenChange={setIsAddDialogOpen}
        onAddMember={fetchMembers}
      />
    </div>
  )
}
