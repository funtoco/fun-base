export const DEFAULT_AUTH_REDIRECT_PATH = "/dashboard"

const AUTH_ROUTES = ["/login", "/signup"]
const PUBLIC_ROUTE_PREFIXES = ["/auth", "/invite"]

function matchesRoute(pathname: string, route: string) {
  return pathname === route || pathname.startsWith(`${route}/`)
}

export function isAuthRoute(pathname: string) {
  return AUTH_ROUTES.some((route) => matchesRoute(pathname, route))
}

export function isPublicRoute(pathname: string) {
  if (pathname === "/") {
    return true
  }

  if (isAuthRoute(pathname)) {
    return true
  }

  return PUBLIC_ROUTE_PREFIXES.some((route) => matchesRoute(pathname, route))
}

export function getSafeRedirectPath(redirectTo: string | null | undefined) {
  if (!redirectTo || !redirectTo.startsWith("/") || redirectTo.startsWith("//")) {
    return DEFAULT_AUTH_REDIRECT_PATH
  }

  let redirectUrl: URL
  try {
    redirectUrl = new URL(redirectTo, "https://funbase.local")
  } catch {
    return DEFAULT_AUTH_REDIRECT_PATH
  }

  if (isPublicRoute(redirectUrl.pathname)) {
    return DEFAULT_AUTH_REDIRECT_PATH
  }

  return `${redirectUrl.pathname}${redirectUrl.search}`
}
