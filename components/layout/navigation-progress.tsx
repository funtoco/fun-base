"use client"

import type React from "react"
import { createContext, useCallback, useContext, useEffect, useMemo, useState } from "react"
import { usePathname } from "next/navigation"

type NavigationProgressContextValue = {
  isNavigating: boolean
  startNavigation: () => void
}

const NavigationProgressContext = createContext<NavigationProgressContextValue | null>(null)

export function NavigationProgressProvider({ children }: { children: React.ReactNode }) {
  const pathname = usePathname()
  const [isNavigating, setIsNavigating] = useState(false)

  const startNavigation = useCallback(() => {
    setIsNavigating(true)
  }, [])

  useEffect(() => {
    setIsNavigating(false)
  }, [pathname])

  useEffect(() => {
    if (!isNavigating) return

    const timeoutId = window.setTimeout(() => {
      setIsNavigating(false)
    }, 10000)

    return () => window.clearTimeout(timeoutId)
  }, [isNavigating])

  const value = useMemo(
    () => ({
      isNavigating,
      startNavigation,
    }),
    [isNavigating, startNavigation],
  )

  return (
    <NavigationProgressContext.Provider value={value}>
      <div
        className="contents"
        onClickCapture={(event) => {
          if (event.defaultPrevented) return
          if (event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return

          const target = event.target as HTMLElement | null
          const anchor = target?.closest("a[href]")
          if (!anchor) return

          const href = anchor.getAttribute("href")
          if (!href || href.startsWith("#") || href.startsWith("mailto:") || href.startsWith("tel:")) return
          if (anchor.getAttribute("target") === "_blank" || anchor.hasAttribute("download")) return

          const url = new URL(href, window.location.href)
          if (url.origin !== window.location.origin) return
          if (url.pathname === window.location.pathname && url.search === window.location.search) return

          startNavigation()
        }}
      >
        {children}
      </div>
    </NavigationProgressContext.Provider>
  )
}

export function useNavigationProgress() {
  const context = useContext(NavigationProgressContext)

  if (!context) {
    return {
      isNavigating: false,
      startNavigation: () => {},
    }
  }

  return context
}

export function NavigationProgressBar() {
  const { isNavigating } = useNavigationProgress()

  if (!isNavigating) return null

  return (
    <div
      className="pointer-events-none fixed inset-x-0 top-0 z-[100] h-0.5 overflow-hidden bg-primary/10"
      role="progressbar"
      aria-label="ページを読み込んでいます"
    >
      <div className="funbase-route-progress h-full w-1/3 bg-[linear-gradient(90deg,transparent,#3b8bff,#4ac4a3,transparent)]" />
    </div>
  )
}
