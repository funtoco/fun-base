'use client'

import { useEffect, useRef } from 'react'
import { usePathname } from 'next/navigation'
import { accessLogger } from '@/lib/access-logger'

const PUBLIC_PATHS = ['/login', '/signup']

/**
 * Tracks page_view events for authenticated users.
 * Fires once per real pathname change, skipping public pages.
 *
 * Mount this inside a component that renders only when the user
 * is authenticated (ConditionalLayout's authenticated branch).
 */
export function usePageViewLogger() {
  const pathname = usePathname()
  const lastLoggedPath = useRef<string | null>(null)

  useEffect(() => {
    const isPublic = PUBLIC_PATHS.includes(pathname) || pathname.startsWith('/auth')
    if (isPublic) return
    if (pathname === lastLoggedPath.current) return

    lastLoggedPath.current = pathname
    accessLogger.pageView(pathname)
  }, [pathname])
}
