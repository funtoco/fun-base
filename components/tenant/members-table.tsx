"use client"

import { Building2, MoreHorizontal, Pencil, RefreshCw, Trash2 } from "lucide-react"
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table"
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu"
import { Button } from "@/components/ui/button"
import { Checkbox } from "@/components/ui/checkbox"
import { Badge } from "@/components/ui/badge"
import { Avatar, AvatarFallback } from "@/components/ui/avatar"
import { RoleBadge } from "./role-badge"
import { StatusBadge } from "./status-badge"
import type { UserTenant } from "@/lib/supabase/tenants"
import { isCompanyContactEmail, isCompanyContactRole } from "@/lib/tenant-access"

type DisplayRole = 'owner' | 'admin' | 'member' | 'guest'

interface MembersTableProps {
  members: UserTenant[]
  selectedMembers: string[]
  onSelectMember: (memberId: string, selected: boolean) => void
  onSelectAll: (memberIds: string[], selected: boolean) => void
  onChangeRole: (memberId: string, role: 'owner' | 'admin' | 'member' | 'guest') => void
  onDeleteMember: (memberId: string) => void
  onEditOffices?: (member: UserTenant) => void
  onResendInvite?: (memberId: string) => void
  currentUserRole: 'owner' | 'admin' | 'member' | 'guest'
  canManageCompanyContacts?: boolean
  currentUserId?: string
}

export function MembersTable({
  members,
  selectedMembers,
  onSelectMember,
  onSelectAll,
  onChangeRole,
  onDeleteMember,
  onEditOffices,
  onResendInvite,
  currentUserRole,
  canManageCompanyContacts = false,
  currentUserId,
}: MembersTableProps) {
  const canBulkDeleteMembers =
    currentUserRole === "owner" || currentUserRole === "admin"

  const formatLastActive = (joinedAt?: string) => {
    if (!joinedAt) return "-"
    return new Date(joinedAt).toLocaleDateString("ja-JP", {
      month: "short",
      day: "numeric",
      hour: "2-digit",
      minute: "2-digit",
    })
  }

  const getDisplayRole = (role: UserTenant["role"]): DisplayRole =>
    role === "supporter" ? "member" : role

  // Permission checks
  const canChangeRole = (targetMember: UserTenant) => {
    if (currentUserRole === 'guest' || currentUserRole === 'member') return false
    if (targetMember.user_id === currentUserId) return false // Can't change own role
    if (targetMember.role === 'owner' && currentUserRole !== 'owner') return false
    return true
  }

  const canDeleteMember = (targetMember: UserTenant) => {
    if (targetMember.user_id === currentUserId) return false

    if (currentUserRole === "owner" || currentUserRole === "admin") {
      return targetMember.role !== "owner"
    }

    if (!canManageCompanyContacts) return false

    return isCompanyContactEmail(targetMember.email) && isCompanyContactRole(targetMember.role)
  }

  const canResendInvite = (targetMember: UserTenant) => {
    if (!onResendInvite || targetMember.status !== "pending" || !targetMember.email) {
      return false
    }

    if (currentUserRole === "owner" || currentUserRole === "admin") {
      return true
    }

    if (!canManageCompanyContacts) return false

    return isCompanyContactEmail(targetMember.email) && isCompanyContactRole(targetMember.role)
  }

  const canEditOffices = (targetMember: UserTenant) =>
    Boolean(onEditOffices) &&
    (currentUserRole === "owner" || currentUserRole === "admin") &&
    targetMember.user_id !== currentUserId

  const canSelectMember = (targetMember: UserTenant) =>
    canBulkDeleteMembers && canDeleteMember(targetMember)

  const selectableMemberIds = members
    .filter((member) => canSelectMember(member))
    .map((member) => member.id)

  const selectedSelectableCount = selectableMemberIds.filter((memberId) =>
    selectedMembers.includes(memberId)
  ).length

  const allSelected =
    selectableMemberIds.length > 0 &&
    selectedSelectableCount === selectableMemberIds.length

  const someSelected =
    selectedSelectableCount > 0 &&
    selectedSelectableCount < selectableMemberIds.length

  const hasRowActions = (targetMember: UserTenant) =>
    canChangeRole(targetMember) ||
    canEditOffices(targetMember) ||
    canResendInvite(targetMember) ||
    canDeleteMember(targetMember)

  const handleRoleChange = (member: UserTenant, newRole: 'owner' | 'admin' | 'member' | 'guest') => {
    if (!canChangeRole(member)) return
    onChangeRole(member.id, newRole)
  }

  const handleDeleteMember = (member: UserTenant) => {
    if (!canDeleteMember(member)) return
    onDeleteMember(member.id)
  }

  const handleEditOffices = (member: UserTenant) => {
    if (!canEditOffices(member)) return
    onEditOffices?.(member)
  }

  const handleResendInvite = (member: UserTenant) => {
    if (!canResendInvite(member)) return
    onResendInvite?.(member.id)
  }

  return (
    <div className="rounded-md border">
      <Table>
        <TableHeader>
          <TableRow>
            {canBulkDeleteMembers ? (
              <TableHead className="w-12">
                <Checkbox
                  checked={allSelected}
                  disabled={selectableMemberIds.length === 0}
                  onCheckedChange={(checked) =>
                    onSelectAll(selectableMemberIds, checked as boolean)
                  }
                  aria-label="削除可能なメンバーをすべて選択"
                  {...(someSelected && { "data-state": "indeterminate" })}
                />
              </TableHead>
            ) : null}
            <TableHead>メール</TableHead>
            <TableHead>ロール</TableHead>
            <TableHead>所属先</TableHead>
            <TableHead>ステータス</TableHead>
            <TableHead>参加日</TableHead>
            <TableHead className="w-12"></TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {members.map((member) => {
            const isCurrentUser = member.user_id === currentUserId
            const email = member.email || ''

            return (
              <TableRow key={member.id}>
                {canBulkDeleteMembers ? (
                  <TableCell>
                    <Checkbox
                      checked={selectedMembers.includes(member.id)}
                      disabled={!canSelectMember(member)}
                      onCheckedChange={(checked) =>
                        onSelectMember(member.id, checked as boolean)
                      }
                      aria-label={`${email}を選択`}
                    />
                  </TableCell>
                ) : null}
                <TableCell>
                  <div className="flex items-center gap-3">
                    <Avatar className="h-8 w-8">
                      <AvatarFallback className="text-xs">
                        {email.charAt(0).toUpperCase()}
                      </AvatarFallback>
                    </Avatar>
                    <div className="flex items-center gap-2">
                      <span className="font-medium">{email}</span>
                      {isCurrentUser && (
                        <Badge variant="outline" className="text-xs">
                          自分
                        </Badge>
                      )}
                    </div>
                  </div>
                </TableCell>
                <TableCell>
                  <RoleBadge role={getDisplayRole(member.role)} />
                </TableCell>
                <TableCell>
                  <div className="flex items-center gap-2">
                    {member.offices && member.offices.length > 0 ? (
                      <div className="flex max-w-64 flex-wrap gap-1">
                        {member.offices.slice(0, 2).map((office) => (
                          <Badge key={office.id} variant="outline" className="max-w-40 truncate">
                            {office.name}
                          </Badge>
                        ))}
                        {member.offices.length > 2 && (
                          <Badge variant="outline">+{member.offices.length - 2}</Badge>
                        )}
                      </div>
                    ) : (
                      <Badge variant="secondary">全所属先</Badge>
                    )}
                    {canEditOffices(member) && (
                      <Button
                        type="button"
                        variant="outline"
                        size="sm"
                        className="h-7 shrink-0 px-2 text-xs"
                        onClick={() => handleEditOffices(member)}
                      >
                        <Pencil className="size-3.5" />
                        変更
                      </Button>
                    )}
                  </div>
                </TableCell>
                <TableCell>
                  <StatusBadge status={member.status} />
                </TableCell>
                <TableCell className="text-muted-foreground">
                  {formatLastActive(member.joined_at)}
                </TableCell>
                <TableCell>
                  {hasRowActions(member) ? (
                    <DropdownMenu>
                      <DropdownMenuTrigger asChild>
                        <Button variant="ghost" size="icon">
                          <MoreHorizontal className="size-4" />
                          <span className="sr-only">メニューを開く</span>
                        </Button>
                      </DropdownMenuTrigger>
                      <DropdownMenuContent align="end">
                        {canChangeRole(member) && (
                          <>
                            {member.role !== 'owner' && (
                              <DropdownMenuItem
                                onClick={() => handleRoleChange(member, 'owner')}
                              >
                                Ownerに変更
                              </DropdownMenuItem>
                            )}
                            {member.role !== 'admin' && (
                              <DropdownMenuItem
                                onClick={() => handleRoleChange(member, 'admin')}
                              >
                                Adminに変更
                              </DropdownMenuItem>
                            )}
                            {member.role !== 'member' && (
                              <DropdownMenuItem
                                onClick={() => handleRoleChange(member, 'member')}
                              >
                                Memberに変更
                              </DropdownMenuItem>
                            )}
                            {member.role !== 'guest' && (
                              <DropdownMenuItem
                                onClick={() => handleRoleChange(member, 'guest')}
                              >
                                Guestに変更
                              </DropdownMenuItem>
                            )}
                          </>
                        )}

                        {canChangeRole(member) && (canEditOffices(member) || canResendInvite(member) || canDeleteMember(member)) && (
                          <DropdownMenuSeparator />
                        )}

                        {canEditOffices(member) && (
                          <DropdownMenuItem onClick={() => handleEditOffices(member)}>
                            <Building2 className="size-4 mr-2" />
                            所属先を変更
                          </DropdownMenuItem>
                        )}

                        {canEditOffices(member) && (canResendInvite(member) || canDeleteMember(member)) && (
                          <DropdownMenuSeparator />
                        )}

                        {canResendInvite(member) && (
                          <>
                            <DropdownMenuItem onClick={() => handleResendInvite(member)}>
                              <RefreshCw className="size-4 mr-2" />
                              招待メール再送
                            </DropdownMenuItem>
                            {canDeleteMember(member) && <DropdownMenuSeparator />}
                          </>
                        )}

                        {canDeleteMember(member) && (
                          <DropdownMenuItem 
                            onClick={() => handleDeleteMember(member)} 
                            className="text-destructive"
                          >
                            <Trash2 className="size-4 mr-2" />
                            {member.status === "pending" ? "招待をキャンセル" : "削除"}
                          </DropdownMenuItem>
                        )}
                      </DropdownMenuContent>
                    </DropdownMenu>
                  ) : (
                    <span className="block text-center text-muted-foreground">-</span>
                  )}
                </TableCell>
              </TableRow>
            )
          })}
        </TableBody>
      </Table>
    </div>
  )
}
