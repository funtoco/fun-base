import type React from "react"
import type { Metadata } from "next"
import { GeistSans } from "geist/font/sans"
import { GeistMono } from "geist/font/mono"
import { Analytics } from "@vercel/analytics/next"
import { Suspense } from "react"
import { AuthProvider } from "@/contexts/auth-context"
import { ConditionalLayout } from "@/components/layout/conditional-layout"
import { NavigationProgressProvider } from "@/components/navigation-progress"
import { Toaster } from "@/components/ui/toaster"
import "./globals.css"

export const metadata: Metadata = {
  title: "FunBase",
  description: "外国人人材の進捗と面談記録などを管理するシステム",
  generator: "v0.app",
  icons: {
    icon: "/favicon.png",
    apple: "/favicon.png",
  },
}

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode
}>) {
  return (
    <html lang="ja">
      <body className={`font-sans ${GeistSans.variable} ${GeistMono.variable}`}>
        <AuthProvider>
          <NavigationProgressProvider>
            <ConditionalLayout>
              <Suspense fallback={null}>{children}</Suspense>
            </ConditionalLayout>
          </NavigationProgressProvider>
          <Toaster />
        </AuthProvider>
        <Analytics />
      </body>
    </html>
  )
}
