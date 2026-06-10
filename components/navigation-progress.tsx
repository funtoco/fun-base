"use client"

import type React from "react"
import { createContext, useCallback, useContext, useEffect, useRef, useState } from "react"
import { usePathname } from "next/navigation"
import { cn } from "@/lib/utils"

type NavigationProgressContextValue = {
  isNavigating: boolean
  startNavigation: () => void
  finishNavigation: () => void
}

const NavigationProgressContext = createContext<NavigationProgressContextValue | null>(null)

const MIN_VISIBLE_MS = 280
const DELAYED_LABEL_MS = 450
const MAX_VISIBLE_MS = 8000

function isModifiedClick(event: MouseEvent) {
  return event.metaKey || event.ctrlKey || event.shiftKey || event.altKey || event.button !== 0
}

function isInternalNavigation(anchor: HTMLAnchorElement) {
  if (!anchor.href || anchor.target || anchor.hasAttribute("download")) return false

  const nextUrl = new URL(anchor.href)
  const currentUrl = new URL(window.location.href)
  const nextPath = `${nextUrl.pathname}${nextUrl.search}${nextUrl.hash}`
  const currentPath = `${currentUrl.pathname}${currentUrl.search}${currentUrl.hash}`

  return nextUrl.origin === currentUrl.origin && nextPath !== currentPath
}

export function NavigationProgressProvider({ children }: { children: React.ReactNode }) {
  const pathname = usePathname()
  const [isNavigating, setIsNavigating] = useState(false)
  const [showLabel, setShowLabel] = useState(false)
  const startedAtRef = useRef(0)
  const pathnameRef = useRef(pathname)
  const finishTimerRef = useRef<number | null>(null)
  const labelTimerRef = useRef<number | null>(null)
  const maxTimerRef = useRef<number | null>(null)

  const clearTimers = useCallback(() => {
    if (finishTimerRef.current) {
      window.clearTimeout(finishTimerRef.current)
      finishTimerRef.current = null
    }
    if (labelTimerRef.current) {
      window.clearTimeout(labelTimerRef.current)
      labelTimerRef.current = null
    }
    if (maxTimerRef.current) {
      window.clearTimeout(maxTimerRef.current)
      maxTimerRef.current = null
    }
  }, [])

  const startNavigation = useCallback(() => {
    clearTimers()
    startedAtRef.current = Date.now()
    setIsNavigating(true)
    setShowLabel(false)
    labelTimerRef.current = window.setTimeout(() => {
      setShowLabel(true)
    }, DELAYED_LABEL_MS)
    maxTimerRef.current = window.setTimeout(() => {
      setIsNavigating(false)
      setShowLabel(false)
      maxTimerRef.current = null
    }, MAX_VISIBLE_MS)
  }, [clearTimers])

  const finishNavigation = useCallback(() => {
    const elapsed = Date.now() - startedAtRef.current
    const remaining = Math.max(MIN_VISIBLE_MS - elapsed, 0)

    if (labelTimerRef.current) {
      window.clearTimeout(labelTimerRef.current)
      labelTimerRef.current = null
    }
    if (maxTimerRef.current) {
      window.clearTimeout(maxTimerRef.current)
      maxTimerRef.current = null
    }

    finishTimerRef.current = window.setTimeout(() => {
      setIsNavigating(false)
      setShowLabel(false)
      finishTimerRef.current = null
    }, remaining)
  }, [])

  useEffect(() => {
    if (pathnameRef.current !== pathname && isNavigating) {
      pathnameRef.current = pathname
      finishNavigation()
      return
    }

    pathnameRef.current = pathname
  }, [finishNavigation, isNavigating, pathname])

  useEffect(() => {
    const handleClick = (event: MouseEvent) => {
      if (isModifiedClick(event)) return

      const target = event.target as Element | null
      const anchor = target?.closest("a")

      if (anchor instanceof HTMLAnchorElement && isInternalNavigation(anchor)) {
        startNavigation()
      }
    }

    const handlePopState = () => {
      startNavigation()
    }

    const patchHistoryMethod = (method: "pushState" | "replaceState") => {
      const original = window.history[method]

      window.history[method] = function patchedHistoryMethod(...args) {
        const destination = args[2]

        if (typeof destination === "string" || destination instanceof URL) {
          const nextUrl = new URL(destination, window.location.href)
          const currentUrl = new URL(window.location.href)
          const nextPathWithSearch = `${nextUrl.pathname}${nextUrl.search}`
          const currentPathWithSearch = `${currentUrl.pathname}${currentUrl.search}`

          if (nextPathWithSearch !== currentPathWithSearch) {
            startNavigation()
          }
        }

        const result = original.apply(this, args)
        window.setTimeout(() => {
          finishNavigation()
        }, 300)

        return result
      }

      return () => {
        window.history[method] = original
      }
    }

    const restorePushState = patchHistoryMethod("pushState")
    const restoreReplaceState = patchHistoryMethod("replaceState")

    document.addEventListener("click", handleClick, true)
    window.addEventListener("popstate", handlePopState)

    return () => {
      document.removeEventListener("click", handleClick, true)
      window.removeEventListener("popstate", handlePopState)
      restorePushState()
      restoreReplaceState()
      clearTimers()
    }
  }, [clearTimers, finishNavigation, startNavigation])

  return (
    <NavigationProgressContext.Provider value={{ isNavigating, startNavigation, finishNavigation }}>
      {children}
      <div
        className={cn(
          "pointer-events-none fixed inset-x-0 top-0 z-[200] h-0.5 overflow-hidden bg-transparent transition-opacity duration-150",
          isNavigating ? "opacity-100" : "opacity-0",
        )}
        aria-hidden={!isNavigating}
      >
        <div className="h-full w-full origin-left animate-navigation-progress bg-primary shadow-[0_0_10px_rgba(59,139,255,0.55)]" />
      </div>
      {isNavigating && showLabel && (
        <div
          className="pointer-events-none fixed right-4 top-4 z-[201] rounded-md border border-border bg-card px-3 py-1.5 text-xs font-medium text-muted-foreground shadow-sm"
          role="status"
          aria-live="polite"
        >
          画面を読み込み中...
        </div>
      )}
    </NavigationProgressContext.Provider>
  )
}

export function useNavigationProgress() {
  const context = useContext(NavigationProgressContext)

  if (!context) {
    throw new Error("useNavigationProgress must be used within NavigationProgressProvider")
  }

  return context
}
