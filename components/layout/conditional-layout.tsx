"use client"

import type React from "react"
import { useEffect } from "react"
import { useAuth } from "@/contexts/auth-context"
import { Sidebar } from "@/components/layout/sidebar"
import { Header } from "@/components/layout/header"
import { NavigationProgressBar, NavigationProgressProvider } from "@/components/layout/navigation-progress"
import { FunBaseLoading } from "@/components/ui/funbase-loading"
import { isPublicRoute } from "@/lib/auth-route-guards"
import { usePathname, useRouter } from "next/navigation"
import { usePageViewLogger } from "@/hooks/use-page-view-logger"

interface ConditionalLayoutProps {
  children: React.ReactNode
}

export function ConditionalLayout({ children }: ConditionalLayoutProps) {
  const { user, loading } = useAuth()
  const pathname = usePathname()
  const router = useRouter()
  const isPublicPage = isPublicRoute(pathname)

  // auth が完了していてログイン済みの非公開ページのみ記録する
  usePageViewLogger({ enabled: !loading && !!user && !isPublicPage })

  useEffect(() => {
    if (loading || user || isPublicPage) {
      return
    }

    const search = typeof window !== "undefined" ? window.location.search : ""
    router.replace(`/login?next=${encodeURIComponent(`${pathname}${search}`)}`)
  }, [isPublicPage, loading, pathname, router, user])

  if (loading || (!isPublicPage && !user)) {
    return <FunBaseLoading variant="fullscreen" title="FunBaseを準備中" description="安全にセッションを確認しています" />
  }

  // 認証が不要なページの場合（ミドルウェアでリダイレクト処理済み）
  if (isPublicPage) {
    return <>{children}</>
  }

  // ログイン済みの場合、サイドバーとヘッダーを表示
  // ミドルウェアで認証チェック済みなので、ここに来る場合は必ずログイン済み
  return (
    <NavigationProgressProvider>
      <NavigationProgressBar />
      <div className="flex h-screen bg-background">
        <Sidebar />
        <div className="flex-1 flex flex-col overflow-hidden">
          <Header />
          <main className="flex-1 overflow-auto bg-background">
            {children}
          </main>
        </div>
      </div>
    </NavigationProgressProvider>
  )
}
