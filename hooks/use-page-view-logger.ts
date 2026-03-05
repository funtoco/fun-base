'use client'

import { useEffect, useRef } from 'react'
import { usePathname } from 'next/navigation'
import { accessLogger } from '@/lib/access-logger'

const PUBLIC_PATHS = ['/login', '/signup']

interface UsePageViewLoggerOptions {
  /** When false the hook does nothing. Use to gate on auth state. */
  enabled?: boolean
}

/**
 * Tracks page_view events for authenticated users.
 * Fires once per real pathname change, skipping public pages.
 * Only logs when `enabled` is true (auth finished and user is present).
 */
export function usePageViewLogger({ enabled = true }: UsePageViewLoggerOptions = {}) {
  const pathname = usePathname()
  const lastLoggedPath = useRef<string | null>(null)

  useEffect(() => {
    if (!enabled) return
    const isPublic = PUBLIC_PATHS.includes(pathname) || pathname.startsWith('/auth')
    if (isPublic) return
    if (pathname === lastLoggedPath.current) return

    lastLoggedPath.current = pathname
    accessLogger.pageView(pathname)
  }, [pathname, enabled])
}
