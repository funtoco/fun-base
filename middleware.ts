import { createServerClient } from "@supabase/ssr"
import { getSafeRedirectPath, isAuthRoute, isPublicRoute } from "@/lib/auth-route-guards"
import { NextResponse, type NextRequest } from "next/server"

export async function middleware(request: NextRequest) {
  const pathname = request.nextUrl.pathname

  if (pathname.startsWith("/api/")) {
    return NextResponse.next({
      request,
    })
  }

  const shouldCheckAuth = !isPublicRoute(pathname) || isAuthRoute(pathname)

  if (!shouldCheckAuth) {
    return NextResponse.next({
      request,
    })
  }

  let supabaseResponse = NextResponse.next({
    request,
  })

  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() {
          return request.cookies.getAll()
        },
        setAll(cookiesToSet) {
          cookiesToSet.forEach(({ name, value }) => request.cookies.set(name, value))
          supabaseResponse = NextResponse.next({
            request,
          })
          cookiesToSet.forEach(({ name, value, options }) => supabaseResponse.cookies.set(name, value, options))
        },
      },
    },
  )

  let isAuthenticated = false
  try {
    const {
      data: { user: currentUser },
    } = await supabase.auth.getUser()
    isAuthenticated = Boolean(currentUser)
  } catch (error) {
    console.error("Failed to verify auth session in middleware:", error)
  }

  const redirectWithSessionCookies = (url: URL) => {
    const response = NextResponse.redirect(url)
    supabaseResponse.cookies.getAll().forEach((cookie) => {
      response.cookies.set(cookie.name, cookie.value, cookie)
    })
    return response
  }

  if (!isAuthenticated && !isPublicRoute(pathname)) {
    const url = request.nextUrl.clone()
    url.pathname = "/login"
    url.search = ""
    url.searchParams.set("next", `${pathname}${request.nextUrl.search}`)
    return redirectWithSessionCookies(url)
  }

  // Redirect authenticated users away from auth pages to the default landing page.
  if (isAuthenticated && isAuthRoute(pathname)) {
    const url = request.nextUrl.clone()
    const nextPath = getSafeRedirectPath(request.nextUrl.searchParams.get("next"))
    const nextUrl = new URL(nextPath, request.nextUrl.origin)
    url.pathname = nextUrl.pathname
    url.search = nextUrl.search
    return redirectWithSessionCookies(url)
  }

  return supabaseResponse
}

export const config = {
  matcher: [
    /*
     * Match all request paths except for the ones starting with:
     * - _next/static (static files)
     * - _next/image (image optimization files)
     * - favicon.ico (favicon file)
     * Feel free to modify this pattern to include more paths.
     */
    "/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp)$).*)",
  ],
}
