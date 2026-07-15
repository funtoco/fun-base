"use client"

import { useEffect, useState } from "react"
import { AuthGuard } from "@/components/auth-guard"
import { DataTable, type Column } from "@/components/ui/data-table"
import { StatusBadge } from "@/components/ui/status-badge"
import { DeadlineChip } from "@/components/ui/deadline-chip"
import { Avatar, AvatarFallback } from "@/components/ui/avatar"
import { Badge } from "@/components/ui/badge"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { ListPanelLoadingSkeleton } from "@/components/ui/funbase-loading"
import { getPeople } from "@/lib/supabase/people"
import { getSupportActions } from "@/lib/supabase/support-actions"
import type { Person, SupportAction } from "@/lib/models"

interface SupportActionWithPerson extends SupportAction {
  personName?: string
}

export default function ActionsPage() {
  const [people, setPeople] = useState<Person[]>([])
  const [supportActions, setSupportActions] = useState<SupportAction[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    async function fetchData() {
      try {
        setLoading(true)
        setError(null)
        const [peopleData, supportActionsData] = await Promise.all([
          getPeople(),
          getSupportActions(),
        ])
        setPeople(peopleData)
        setSupportActions(supportActionsData)
      } catch (err) {
        console.error("Error fetching support actions data:", err)
        setError("データの取得に失敗しました")
      } finally {
        setLoading(false)
      }
    }

    fetchData()
  }, [])

  // Combine support actions with person information
  const actionsWithPeople: SupportActionWithPerson[] = supportActions.map((action) => {
    const person = people.find((p) => p.id === action.personId)
    return {
      ...action,
      personName: person?.name,
    }
  })

  const columns: Column<SupportActionWithPerson>[] = [
    {
      key: "personName",
      label: "対象者",
      sortable: true,
      render: (value, row) => {
        const person = people.find((p) => p.id === row.personId)
        return person ? (
          <div className="flex items-center gap-3">
            <Avatar className="h-8 w-8">
              <AvatarFallback className="text-xs">{person.name.charAt(0)}</AvatarFallback>
            </Avatar>
            <span className="font-medium">{person.name}</span>
          </div>
        ) : (
          <span className="text-muted-foreground">不明</span>
        )
      },
    },
    {
      key: "category",
      label: "カテゴリ",
      sortable: true,
      filterable: true,
      render: (value) => <Badge variant="outline">{value}</Badge>,
    },
    {
      key: "title",
      label: "タイトル",
      sortable: true,
    },
    {
      key: "status",
      label: "ステータス",
      sortable: true,
      filterable: true,
      render: (value) => <StatusBadge status={value} type="support" />,
    },
    {
      key: "assignee",
      label: "担当者",
      sortable: true,
      filterable: true,
      render: (value) => value || <span className="text-muted-foreground">未設定</span>,
    },
    {
      key: "due",
      label: "期日",
      sortable: true,
      render: (value) =>
        value ? <DeadlineChip date={value} label="期日" /> : <span className="text-muted-foreground">-</span>,
    },
  ]

  const filters = [
    {
      key: "category",
      label: "カテゴリ",
      options: Array.from(new Set(supportActions.map((a) => a.category))).map((category) => ({
        value: category,
        label: category,
      })),
      multiple: true,
    },
    {
      key: "status",
      label: "ステータス",
      options: [
        { value: "open", label: "未対応" },
        { value: "in_progress", label: "対応中" },
        { value: "done", label: "完了" },
      ],
      multiple: true,
    },
    {
      key: "assignee",
      label: "担当者",
      options: Array.from(new Set(supportActions.map((a) => a.assignee).filter(Boolean))).map((assignee) => ({
        value: assignee!,
        label: assignee!,
      })),
      multiple: true,
    },
  ]

  // Calculate statistics
  const stats = {
    total: supportActions.length,
    open: supportActions.filter((a) => a.status === "open").length,
    inProgress: supportActions.filter((a) => a.status === "in_progress").length,
    done: supportActions.filter((a) => a.status === "done").length,
    overdue: supportActions.filter((a) => {
      if (!a.due) return false
      const dueDate = new Date(a.due)
      const now = new Date()
      return dueDate < now && a.status !== "done"
    }).length,
  }

  if (loading) {
    return (
      <AuthGuard>
        <div className="p-6 space-y-6">
          <div>
            <h1 className="text-3xl font-bold text-foreground">サポート記録</h1>
            <p className="text-muted-foreground mt-2">サポートアクションの一覧と進捗管理</p>
          </div>
          <ListPanelLoadingSkeleton />
        </div>
      </AuthGuard>
    )
  }

  if (error) {
    return (
      <AuthGuard>
        <div className="p-6 space-y-6">
          <div>
            <h1 className="text-3xl font-bold text-foreground">サポート記録</h1>
            <p className="text-muted-foreground mt-2">サポートアクションの一覧と進捗管理</p>
          </div>
          <div className="flex items-center justify-center py-8">
            <div className="text-red-500">{error}</div>
          </div>
        </div>
      </AuthGuard>
    )
  }

  return (
    <AuthGuard>
      <div className="p-6 space-y-6">
        {/* Page Header */}
        <div>
          <h1 className="text-3xl font-bold text-foreground">サポート記録</h1>
          <p className="text-muted-foreground mt-2">サポートアクションの一覧と進捗管理</p>
        </div>

        {/* Statistics Cards */}
        <div className="grid grid-cols-1 md:grid-cols-5 gap-4">
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-sm">総件数</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold">{stats.total}</div>
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-sm">未対応</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold text-red-600">{stats.open}</div>
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-sm">対応中</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold text-yellow-600">{stats.inProgress}</div>
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-sm">完了</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold text-green-600">{stats.done}</div>
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-sm">期限超過</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold text-orange-600">{stats.overdue}</div>
            </CardContent>
          </Card>
        </div>

        {/* Data Table */}
        <DataTable
          data={actionsWithPeople}
          columns={columns}
          filters={filters}
          searchKeys={["title", "personName", "category"]}
        />

        {/* Category Breakdown */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
          <Card>
            <CardHeader>
              <CardTitle>カテゴリ別件数</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="space-y-2">
                {Array.from(new Set(supportActions.map((a) => a.category)))
                  .sort()
                  .map((category) => {
                    const count = supportActions.filter((a) => a.category === category).length
                    return (
                      <div key={category} className="flex items-center justify-between text-sm">
                        <span>{category}</span>
                        <Badge variant="secondary">{count}</Badge>
                      </div>
                    )
                  })}
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>担当者別件数</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="space-y-2">
                {Array.from(new Set(supportActions.map((a) => a.assignee).filter(Boolean)))
                  .sort()
                  .map((assignee) => {
                    const total = supportActions.filter((a) => a.assignee === assignee).length
                    const active = supportActions.filter((a) => a.assignee === assignee && a.status !== "done").length
                    return (
                      <div key={assignee} className="flex items-center justify-between text-sm">
                        <span>{assignee}</span>
                        <div className="flex gap-2">
                          <Badge variant="outline">{active}</Badge>
                          <Badge variant="secondary">{total}</Badge>
                        </div>
                      </div>
                    )
                  })}
              </div>
            </CardContent>
          </Card>
        </div>
      </div>
    </AuthGuard>
  )
}
