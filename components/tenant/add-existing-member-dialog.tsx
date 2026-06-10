"use client"

import { useState, useEffect } from "react"
import { Button } from "@/components/ui/button"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Checkbox } from "@/components/ui/checkbox"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { Avatar, AvatarFallback } from "@/components/ui/avatar"
import { CheckCircle, Search, Loader2 } from "lucide-react"
import { useToast } from "@/lib/hooks/use-toast"
import type { TenantOffice } from "@/lib/supabase/tenants"

interface AddExistingMemberDialogProps {
  tenantId: string
  open: boolean
  onOpenChange: (open: boolean) => void
  onAddMember: () => void
  offices?: TenantOffice[]
}

interface SearchUser {
  user_id: string
  email: string
  name: string
  role: string
  status: string
}

export function AddExistingMemberDialog({ 
  tenantId, 
  open, 
  onOpenChange, 
  onAddMember,
  offices = [],
}: AddExistingMemberDialogProps) {
  const [searchQuery, setSearchQuery] = useState("")
  const [searchResults, setSearchResults] = useState<SearchUser[]>([])
  const [selectedUser, setSelectedUser] = useState<SearchUser | null>(null)
  const [role, setRole] = useState<'admin' | 'member' | 'guest'>('member')
  const [selectedOfficeIds, setSelectedOfficeIds] = useState<string[]>([])
  const [loading, setLoading] = useState(false)
  const [searching, setSearching] = useState(false)
  const { toast } = useToast()

  // デバウンス処理
  useEffect(() => {
    const timer = setTimeout(() => {
      if (searchQuery.length > 2) {
        searchUsers()
      } else {
        setSearchResults([])
      }
    }, 300)

    return () => clearTimeout(timer)
  }, [searchQuery])

  const searchUsers = async () => {
    if (!searchQuery || searchQuery.length < 3) {
      setSearchResults([])
      return
    }

    setSearching(true)
    try {
      const response = await fetch(`/api/users/search?email=${encodeURIComponent(searchQuery)}&excludeTenantId=${tenantId}`)
      
      if (!response.ok) {
        throw new Error('Failed to search users')
      }

      const { users } = await response.json()
      setSearchResults(users || [])
    } catch (error) {
      console.error('Error searching users:', error)
      toast({
        title: "エラー",
        description: "ユーザーの検索に失敗しました",
        variant: "destructive"
      })
    } finally {
      setSearching(false)
    }
  }

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()

    if (!selectedUser) {
      toast({
        title: "エラー",
        description: "ユーザーを選択してください",
        variant: "destructive"
      })
      return
    }

    setLoading(true)
    try {
      const response = await fetch(`/api/tenants/${tenantId}/members/add`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          userId: selectedUser.user_id,
          role: role,
          officeIds: selectedOfficeIds,
        })
      })

      const result = await response.json()

      if (!response.ok) {
        throw new Error(result.error || 'Failed to add member')
      }

      toast({
        title: "成功",
        description: `${selectedUser.name || selectedUser.email}さんを追加しました`
      })

      // Reset form
      setSearchQuery("")
      setSearchResults([])
      setSelectedUser(null)
      setRole('member')
      setSelectedOfficeIds([])
      onOpenChange(false)
      onAddMember()
    } catch (error) {
      console.error('Error adding member:', error)
      toast({
        title: "エラー",
        description: error instanceof Error ? error.message : "メンバーの追加に失敗しました",
        variant: "destructive"
      })
    } finally {
      setLoading(false)
    }
  }

  const handleCancel = () => {
    setSearchQuery("")
    setSearchResults([])
    setSelectedUser(null)
    setRole('member')
    setSelectedOfficeIds([])
    onOpenChange(false)
  }

  const toggleOffice = (officeId: string, checked: boolean) => {
    setSelectedOfficeIds((currentOfficeIds) =>
      checked
        ? Array.from(new Set([...currentOfficeIds, officeId]))
        : currentOfficeIds.filter((id) => id !== officeId)
    )
  }

  const getRoleBadgeColor = (role: string) => {
    switch (role) {
      case 'owner': return 'bg-yellow-100 text-yellow-800'
      case 'admin': return 'bg-blue-100 text-blue-800'
      case 'member': return 'bg-green-100 text-green-800'
      case 'guest': return 'bg-gray-100 text-gray-800'
      default: return 'bg-gray-100 text-gray-800'
    }
  }

  const getRoleLabel = (role: string) => {
    switch (role) {
      case 'owner': return 'オーナー'
      case 'admin': return '管理者'
      case 'member': return 'メンバー'
      case 'guest': return 'ゲスト'
      default: return role
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-[500px]">
        <DialogHeader>
          <DialogTitle>メンバーを追加</DialogTitle>
          <DialogDescription>
            既存のユーザーをテナントに追加します。あなたが所属するテナントのメンバーのみが表示されます。
          </DialogDescription>
        </DialogHeader>
        <form onSubmit={handleSubmit}>
          <div className="grid gap-4 py-4">
            {/* 検索入力 */}
            <div className="grid gap-2">
              <Label htmlFor="search">メールアドレスで検索</Label>
              <div className="relative">
                <Search className="absolute left-2 top-2.5 h-4 w-4 text-muted-foreground" />
                <Input
                  id="search"
                  placeholder="メールアドレスを入力..."
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  className="pl-8"
                />
              </div>
              {searching && (
                <div className="flex items-center gap-2 text-sm text-muted-foreground">
                  <Loader2 className="h-4 w-4 animate-spin" />
                  <span>検索中...</span>
                </div>
              )}
            </div>

            {/* 検索結果 */}
            {searchResults.length > 0 && (
              <div className="grid gap-2">
                <Label>検索結果</Label>
                <div className="border rounded-md max-h-60 overflow-y-auto">
                  {searchResults.map((user) => (
                    <button
                      key={user.user_id}
                      type="button"
                      onClick={() => setSelectedUser(user)}
                      className={`w-full p-3 flex items-center gap-3 hover:bg-muted transition-colors ${
                        selectedUser?.user_id === user.user_id ? 'bg-muted' : ''
                      }`}
                    >
                      <Avatar className="h-8 w-8">
                        <AvatarFallback className="text-xs">
                          {user.name?.charAt(0) || user.email?.charAt(0) || 'U'}
                        </AvatarFallback>
                      </Avatar>
                      <div className="flex-1 text-left">
                        <div className="font-medium">{user.name}</div>
                        <div className="text-sm text-muted-foreground">{user.email}</div>
                        <span className={`text-xs px-2 py-0.5 rounded ${getRoleBadgeColor(user.role)}`}>
                          {getRoleLabel(user.role)}
                        </span>
                      </div>
                      {selectedUser?.user_id === user.user_id && (
                        <CheckCircle className="h-5 w-5 text-primary" />
                      )}
                    </button>
                  ))}
                </div>
              </div>
            )}

            {searchQuery.length > 2 && searchResults.length === 0 && !searching && (
              <div className="text-center py-4 text-sm text-muted-foreground">
                検索結果が見つかりませんでした
              </div>
            )}

            {/* 選択されたユーザー */}
            {selectedUser && (
              <div className="border rounded-md p-3 bg-muted">
                <div className="flex items-center gap-3">
                  <Avatar className="h-10 w-10">
                    <AvatarFallback className="text-sm">
                      {selectedUser.name?.charAt(0) || selectedUser.email?.charAt(0) || 'U'}
                    </AvatarFallback>
                  </Avatar>
                  <div className="flex-1">
                    <div className="font-medium">{selectedUser.name}</div>
                    <div className="text-sm text-muted-foreground">{selectedUser.email}</div>
                  </div>
                </div>
              </div>
            )}

            {/* ロール選択 */}
            {selectedUser && (
              <div className="grid gap-2">
                <Label htmlFor="role">ロール</Label>
                <Select value={role} onValueChange={(value: 'admin' | 'member' | 'guest') => setRole(value)}>
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="guest">Guest - 閲覧のみ</SelectItem>
                    <SelectItem value="member">Member - 一般権限</SelectItem>
                    <SelectItem value="admin">Admin - 管理権限</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            )}

            {selectedUser && offices.length > 0 && (
              <div className="grid gap-2">
                <Label>所属先</Label>
                <div className="max-h-48 space-y-2 overflow-y-auto rounded-md border p-3">
                  {offices.map((office) => (
                    <Label
                      key={office.id}
                      htmlFor={`add-office-${office.id}`}
                      className="flex cursor-pointer items-center gap-3 rounded-md px-2 py-2 hover:bg-muted"
                    >
                      <Checkbox
                        id={`add-office-${office.id}`}
                        checked={selectedOfficeIds.includes(office.id)}
                        onCheckedChange={(checked) => toggleOffice(office.id, checked === true)}
                      />
                      <span className="text-sm font-medium">{office.name}</span>
                    </Label>
                  ))}
                </div>
              </div>
            )}
          </div>
          <DialogFooter>
            <Button type="button" variant="outline" onClick={handleCancel} disabled={loading}>
              キャンセル
            </Button>
            <Button type="submit" disabled={!selectedUser || loading}>
              {loading ? '追加中...' : '追加'}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  )
}
