"use client"

import { useState, useEffect, useCallback } from "react"
import { useRouter } from "next/navigation"
import { format } from "date-fns"
import { ja } from "date-fns/locale"
import {
  ArrowLeft,
  RefreshCw,
  ShieldCheck,
  LogIn,
  LogOut,
  Globe,
  AlertTriangle,
  Search,
} from "lucide-react"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardHeader, CardDescription } from "@/components/ui/card"
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import { Input } from "@/components/ui/input"
import { useAuth } from "@/contexts/auth-context"

interface AccessLog {
  id: string
  user_id: string | null
  tenant_id: string | null
  email: string | null
  event_type: "login" | "logout" | "login_failed" | "page_view"
  pathname: string | null
  page_title: string | null
  ip_address: string | null
  user_agent: string | null
  metadata: Record<string, unknown> | null
  created_at: string
}

const EVENT_CONFIG = {
  login: {
    label: "ログイン",
    icon: LogIn,
    className: "bg-green-100 text-green-800 border-green-200",
  },
  logout: {
    label: "ログアウト",
    icon: LogOut,
    className: "bg-slate-100 text-slate-700 border-slate-200",
  },
  login_failed: {
    label: "ログイン失敗",
    icon: AlertTriangle,
    className: "bg-red-100 text-red-700 border-red-200",
  },
  page_view: {
    label: "ページ閲覧",
    icon: Globe,
    className: "bg-blue-50 text-blue-700 border-blue-200",
  },
} as const

const PAGE_SIZE = 50

export default function AccessLogsPage() {
  const router = useRouter()
  const { user, loading: authLoading } = useAuth()

  const [logs, setLogs] = useState<AccessLog[]>([])
  const [total, setTotal] = useState(0)
  const [page, setPage] = useState(0)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [eventType, setEventType] = useState<string>("all")
  const [emailFilter, setEmailFilter] = useState("")

  const fetchLogs = useCallback(async () => {
    setLoading(true)
    setError(null)
    try {
      const params = new URLSearchParams({
        limit: String(PAGE_SIZE),
        offset: String(page * PAGE_SIZE),
      })
      if (eventType !== "all") params.set("event_type", eventType)
      // email filter is sent to the server so pagination & total count are correct
      if (emailFilter.trim()) params.set("email", emailFilter.trim())

      const res = await fetch(`/api/access-logs?${params}`)
      if (!res.ok) {
        const body = await res.json()
        setError(body.error ?? "取得に失敗しました")
        return
      }
      const body = await res.json()
      setLogs(body.data ?? [])
      setTotal(body.count ?? 0)
    } catch {
      setError("ネットワークエラーが発生しました")
    } finally {
      setLoading(false)
    }
  }, [page, eventType, emailFilter])

  useEffect(() => {
    if (!authLoading && user) fetchLogs()
  }, [authLoading, user, fetchLogs])

  // reset to page 0 when filters change
  useEffect(() => { setPage(0) }, [eventType, emailFilter])

  const totalPages = Math.ceil(total / PAGE_SIZE)

  const summaryCounts = {
    login: logs.filter((l) => l.event_type === "login").length,
    logout: logs.filter((l) => l.event_type === "logout").length,
    login_failed: logs.filter((l) => l.event_type === "login_failed").length,
    page_view: logs.filter((l) => l.event_type === "page_view").length,
  }

  if (authLoading) {
    return (
      <div className="flex items-center justify-center min-h-screen">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary" />
      </div>
    )
  }

  if (!user) {
    return <div className="p-6 text-muted-foreground">ログインが必要です</div>
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
            <h1 className="text-3xl font-bold text-foreground flex items-center gap-2">
              <ShieldCheck className="h-7 w-7 text-primary" />
              アクセスログ
            </h1>
            <p className="text-muted-foreground mt-1">
              ユーザーのログイン・ページ閲覧履歴を確認します
            </p>
          </div>
        </div>
        <Button variant="outline" size="sm" onClick={fetchLogs} disabled={loading}>
          <RefreshCw className={`h-4 w-4 mr-2 ${loading ? "animate-spin" : ""}`} />
          更新
        </Button>
      </div>

      {/* Summary Cards */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        {(["login", "logout", "login_failed", "page_view"] as const).map((type) => {
          const cfg = EVENT_CONFIG[type]
          const colorMap = {
            login: "text-green-600",
            logout: "text-slate-600",
            login_failed: "text-red-600",
            page_view: "text-blue-600",
          }
          return (
            <Card
              key={type}
              className="cursor-pointer hover:shadow-md transition-shadow"
              onClick={() => setEventType(eventType === type ? "all" : type)}
            >
              <CardHeader className="pb-2 pt-4 px-4">
                <CardDescription>{cfg.label}</CardDescription>
              </CardHeader>
              <CardContent className="px-4 pb-4">
                <p className={`text-2xl font-bold ${colorMap[type]}`}>
                  {summaryCounts[type]}
                </p>
                <p className="text-xs text-muted-foreground mt-1">この表示中</p>
              </CardContent>
            </Card>
          )
        })}
      </div>

      {/* Filters */}
      <div className="flex flex-wrap gap-3 items-center">
        <Select value={eventType} onValueChange={setEventType}>
          <SelectTrigger className="w-44">
            <SelectValue placeholder="イベント種別" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">すべて</SelectItem>
            <SelectItem value="login">ログイン</SelectItem>
            <SelectItem value="logout">ログアウト</SelectItem>
            <SelectItem value="login_failed">ログイン失敗</SelectItem>
            <SelectItem value="page_view">ページ閲覧</SelectItem>
          </SelectContent>
        </Select>

        <div className="relative flex-1 min-w-48 max-w-72">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input
            placeholder="メールで絞り込み..."
            className="pl-9"
            value={emailFilter}
            onChange={(e) => setEmailFilter(e.target.value)}
          />
        </div>

        <span className="text-sm text-muted-foreground ml-auto">
          全 {total.toLocaleString()} 件
        </span>
      </div>

      {error && (
        <Card className="border-destructive">
          <CardContent className="pt-6 text-destructive">{error}</CardContent>
        </Card>
      )}

      {/* Logs Table */}
      <Card>
        <CardContent className="p-0">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead className="w-40">日時</TableHead>
                <TableHead className="w-32">種別</TableHead>
                <TableHead>ユーザー</TableHead>
                <TableHead>ページ / 詳細</TableHead>
                <TableHead className="w-36">IPアドレス</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {loading && (
                <TableRow>
                  <TableCell colSpan={5} className="text-center py-12 text-muted-foreground">
                    読み込み中...
                  </TableCell>
                </TableRow>
              )}
              {!loading && logs.length === 0 && (
                <TableRow>
                  <TableCell colSpan={5} className="text-center py-12 text-muted-foreground">
                    ログがありません
                  </TableCell>
                </TableRow>
              )}
              {!loading && logs.map((log) => {
                const cfg = EVENT_CONFIG[log.event_type]
                const Icon = cfg.icon
                return (
                  <TableRow key={log.id} className="hover:bg-muted/30">
                    <TableCell className="text-xs text-muted-foreground whitespace-nowrap">
                      {format(new Date(log.created_at), "MM/dd HH:mm:ss", { locale: ja })}
                    </TableCell>
                    <TableCell>
                      <span className={`inline-flex items-center gap-1 text-xs font-medium px-2 py-0.5 rounded-full border ${cfg.className}`}>
                        <Icon className="h-3 w-3" />
                        {cfg.label}
                      </span>
                    </TableCell>
                    <TableCell className="text-sm font-medium">
                      {log.email ?? "—"}
                    </TableCell>
                    <TableCell className="text-sm">
                      {log.event_type === "page_view" ? (
                        <span>
                          <span className="font-medium">{log.page_title}</span>
                          {log.pathname && (
                            <span className="text-muted-foreground ml-2 text-xs">{log.pathname}</span>
                          )}
                        </span>
                      ) : log.event_type === "login_failed" && log.metadata ? (
                        <span className="text-red-600 text-xs">
                          {String((log.metadata as Record<string, unknown>).email ?? "—")}
                        </span>
                      ) : (
                        <span className="text-muted-foreground">—</span>
                      )}
                    </TableCell>
                    <TableCell className="text-xs text-muted-foreground font-mono">
                      {log.ip_address ?? "—"}
                    </TableCell>
                  </TableRow>
                )
              })}
            </TableBody>
          </Table>
        </CardContent>
      </Card>

      {/* Pagination */}
      {totalPages > 1 && (
        <div className="flex items-center justify-center gap-3">
          <Button
            variant="outline"
            size="sm"
            onClick={() => setPage((p) => Math.max(0, p - 1))}
            disabled={page === 0 || loading}
          >
            前へ
          </Button>
          <span className="text-sm text-muted-foreground">
            {page + 1} / {totalPages}
          </span>
          <Button
            variant="outline"
            size="sm"
            onClick={() => setPage((p) => Math.min(totalPages - 1, p + 1))}
            disabled={page >= totalPages - 1 || loading}
          >
            次へ
          </Button>
        </div>
      )}
    </div>
  )
}
