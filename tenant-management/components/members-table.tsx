"use client"
import { MoreHorizontal, RotateCcw, Trash2, UserX, UserCheck } from "lucide-react"
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
import { RoleBadge } from "./role-badge"
import { StatusBadge } from "./status-badge"
import type { TenantMember, Role } from "@/types/tenant"
import { PermissionService } from "@/lib/permissions"

interface MembersTableProps {
  members: TenantMember[]
  selectedMembers: string[]
  onSelectMember: (memberId: string, selected: boolean) => void
  onSelectAll: (selected: boolean) => void
  onChangeRole: (memberId: string, role: Role) => void
  onToggleStatus: (memberId: string) => void
  onDeleteMember: (memberId: string) => void
  onResendInvite: (memberId: string) => void
}

export function MembersTable({
  members,
  selectedMembers,
  onSelectMember,
  onSelectAll,
  onChangeRole,
  onToggleStatus,
  onDeleteMember,
  onResendInvite,
}: MembersTableProps) {
  const allSelected = members.length > 0 && selectedMembers.length === members.length
  const someSelected = selectedMembers.length > 0 && selectedMembers.length < members.length

  // 現在のユーザーを取得（実際の実装では認証システムから取得）
  const currentUser = members.find((m) => m.isSelf) || members[0]

  const formatLastActive = (lastActiveAt?: string) => {
    if (!lastActiveAt) return "-"
    return new Date(lastActiveAt).toLocaleDateString("ja-JP", {
      month: "short",
      day: "numeric",
      hour: "2-digit",
      minute: "2-digit",
    })
  }

  const getPermissionContext = (targetMember: TenantMember) => ({
    currentUser,
    targetMember,
    allMembers: members,
  })

  const handleRoleChange = (member: TenantMember, newRole: Role) => {
    const context = getPermissionContext(member)
    const validation = PermissionService.validateRoleChange(context, newRole)

    if (!validation.isValid) {
      // エラートーストを表示（実際の実装ではtoastを使用）
      alert(validation.error)
      return
    }

    onChangeRole(member.id, newRole)
  }

  const handleDeleteMember = (member: TenantMember) => {
    const context = getPermissionContext(member)
    const validation = PermissionService.validateMemberDeletion(context)

    if (!validation.isValid) {
      alert(validation.error)
      return
    }

    onDeleteMember(member.id)
  }

  return (
    <div className="rounded-md border">
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead className="w-12">
              <Checkbox
                checked={allSelected}
                onCheckedChange={onSelectAll}
                aria-label="すべて選択"
                {...(someSelected && { "data-state": "indeterminate" })}
              />
            </TableHead>
            <TableHead>メール</TableHead>
            <TableHead>ロール</TableHead>
            <TableHead>ステータス</TableHead>
            <TableHead>最終アクティブ</TableHead>
            <TableHead className="w-12"></TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {members.map((member) => {
            const context = getPermissionContext(member)

            return (
              <TableRow key={member.id}>
                <TableCell>
                  <Checkbox
                    checked={selectedMembers.includes(member.id)}
                    onCheckedChange={(checked) => onSelectMember(member.id, checked as boolean)}
                    aria-label={`${member.email}を選択`}
                  />
                </TableCell>
                <TableCell>
                  <div className="flex items-center gap-2">
                    <span className="font-medium">{member.email}</span>
                    {member.isSelf && (
                      <Badge variant="outline" className="text-xs">
                        自分
                      </Badge>
                    )}
                  </div>
                </TableCell>
                <TableCell>
                  <RoleBadge role={member.role} />
                </TableCell>
                <TableCell>
                  <StatusBadge status={member.status} />
                </TableCell>
                <TableCell className="text-muted-foreground">{formatLastActive(member.lastActiveAt)}</TableCell>
                <TableCell>
                  <DropdownMenu>
                    <DropdownMenuTrigger asChild>
                      <Button variant="ghost" size="icon">
                        <MoreHorizontal className="size-4" />
                        <span className="sr-only">メニューを開く</span>
                      </Button>
                    </DropdownMenuTrigger>
                    <DropdownMenuContent align="end">
                      {PermissionService.canChangeRole(context, "Owner") && (
                        <DropdownMenuItem
                          onClick={() => handleRoleChange(member, "Owner")}
                          disabled={member.role === "Owner"}
                        >
                          Ownerに変更
                        </DropdownMenuItem>
                      )}
                      {PermissionService.canChangeRole(context, "Admin") && (
                        <DropdownMenuItem
                          onClick={() => handleRoleChange(member, "Admin")}
                          disabled={member.role === "Admin"}
                        >
                          Adminに変更
                        </DropdownMenuItem>
                      )}
                      {PermissionService.canChangeRole(context, "Member") && (
                        <DropdownMenuItem
                          onClick={() => handleRoleChange(member, "Member")}
                          disabled={member.role === "Member"}
                        >
                          Memberに変更
                        </DropdownMenuItem>
                      )}
                      {PermissionService.canChangeRole(context, "Viewer") && (
                        <DropdownMenuItem
                          onClick={() => handleRoleChange(member, "Viewer")}
                          disabled={member.role === "Viewer"}
                        >
                          Viewerに変更
                        </DropdownMenuItem>
                      )}

                      {(PermissionService.canChangeRole(context, "Owner") ||
                        PermissionService.canChangeRole(context, "Admin") ||
                        PermissionService.canChangeRole(context, "Member") ||
                        PermissionService.canChangeRole(context, "Viewer")) && <DropdownMenuSeparator />}

                      {PermissionService.canToggleStatus(context) &&
                        (member.status === "Active" ? (
                          <DropdownMenuItem onClick={() => onToggleStatus(member.id)}>
                            <UserX className="size-4 mr-2" />
                            一時無効化
                          </DropdownMenuItem>
                        ) : (
                          <DropdownMenuItem onClick={() => onToggleStatus(member.id)}>
                            <UserCheck className="size-4 mr-2" />
                            有効化
                          </DropdownMenuItem>
                        ))}

                      {PermissionService.canResendInvite(context) && (
                        <DropdownMenuItem onClick={() => onResendInvite(member.id)}>
                          <RotateCcw className="size-4 mr-2" />
                          再送
                        </DropdownMenuItem>
                      )}

                      {PermissionService.canDeleteMember(context) && (
                        <>
                          <DropdownMenuSeparator />
                          <DropdownMenuItem onClick={() => handleDeleteMember(member)} className="text-destructive">
                            <Trash2 className="size-4 mr-2" />
                            削除
                          </DropdownMenuItem>
                        </>
                      )}
                    </DropdownMenuContent>
                  </DropdownMenu>
                </TableCell>
              </TableRow>
            )
          })}
        </TableBody>
      </Table>
    </div>
  )
}
