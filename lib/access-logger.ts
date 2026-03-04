/**
 * Client-side access logging helper for jinzai kanri.
 * All events are sent to /api/access-logs which writes to DB
 * using the service role key (bypasses RLS).
 */

export type AccessLogEventType = 'login' | 'logout' | 'login_failed' | 'page_view'

export interface AccessLogPayload {
  event_type: AccessLogEventType
  pathname?: string
  page_title?: string
  metadata?: Record<string, unknown>
}

/**
 * Maps known pathnames to human-readable Japanese page titles.
 * Supports dynamic segments like /people/[id].
 */
export function getPageTitle(pathname: string): string {
  if (pathname === '/people') return '人材一覧'
  if (pathname === '/visas') return 'ビザ進捗管理'
  if (pathname === '/dashboard') return 'ダッシュボード'
  if (pathname === '/admin/tenants') return 'テナント管理'
  if (pathname.startsWith('/admin/connectors')) return 'コネクタ管理'
  if (pathname === '/admin/access-logs') return 'アクセスログ'
  if (pathname.match(/^\/people\/[^/]+\/edit$/)) return '人材編集'
  if (pathname.match(/^\/people\/[^/]+$/)) return '人材詳細'
  return pathname
}

/**
 * sendBeacon-based log: fire-and-forget, survives page navigation.
 * Use for events where the page is about to navigate away (login, page_view).
 */
function beaconLog(payload: AccessLogPayload): void {
  try {
    const body = JSON.stringify(payload)
    if (typeof navigator !== 'undefined' && navigator.sendBeacon) {
      navigator.sendBeacon('/api/access-logs', new Blob([body], { type: 'application/json' }))
    } else {
      // SSR / no sendBeacon fallback — best effort
      fetch('/api/access-logs', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body,
      }).catch(() => {})
    }
  } catch {
    // Silently ignore
  }
}

/**
 * fetch-based log: awaitable, sends while the current session is still valid.
 * Use for logout — must complete BEFORE supabase.auth.signOut() is called,
 * otherwise the session cookie is already invalidated by the time the server
 * receives the request and user_id / tenant_id resolve to null.
 *
 * Has a 5s timeout via AbortController so logout is never blocked indefinitely.
 */
async function fetchLog(payload: AccessLogPayload): Promise<void> {
  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), 5000)
  try {
    await fetch('/api/access-logs', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
      signal: controller.signal,
    })
  } catch {
    // Silently ignore — logging failures must never affect the user experience
  } finally {
    clearTimeout(timer)
  }
}

export const accessLogger = {
  // sendBeacon: page navigates away right after, beacon survives the unload
  login: () =>
    beaconLog({ event_type: 'login' }),

  // fetch + await: must complete before session is destroyed in signOut()
  logout: () =>
    fetchLog({ event_type: 'logout' }),

  // sendBeacon: stays on login page, fire-and-forget is fine
  loginFailed: (email?: string) =>
    beaconLog({ event_type: 'login_failed', metadata: email ? { email } : undefined }),

  // sendBeacon: fire-and-forget, no blocking needed
  pageView: (pathname: string) =>
    beaconLog({
      event_type: 'page_view',
      pathname,
      page_title: getPageTitle(pathname),
    }),
}
