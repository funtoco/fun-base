import { NextResponse, type NextRequest } from "next/server"
import { createClient } from "@/lib/supabase/server"
import {
  buildFunEduUrl,
  getFunEduBaseUrl,
  getFunEduCallbackPath,
  getSafeFunEduNextPath,
  signFunEduSsoToken,
} from "@/lib/funedu-sso"

export async function GET(request: NextRequest) {
  const funEduBaseUrl = getFunEduBaseUrl()

  if (!funEduBaseUrl) {
    return NextResponse.json(
      { error: "FUNEDU_URL or NEXT_PUBLIC_FUNEDU_URL is required" },
      { status: 503 },
    )
  }

  let parsedFunEduBaseUrl: URL
  try {
    parsedFunEduBaseUrl = new URL(funEduBaseUrl)
  } catch {
    return NextResponse.json({ error: "FunEdu URL is invalid" }, { status: 500 })
  }

  const supabase = await createClient()
  const {
    data: { user },
    error,
  } = await supabase.auth.getUser()

  if (error || !user) {
    const loginUrl = request.nextUrl.clone()
    loginUrl.pathname = "/login"
    loginUrl.search = ""
    loginUrl.searchParams.set("next", `${request.nextUrl.pathname}${request.nextUrl.search}`)
    return NextResponse.redirect(loginUrl)
  }

  const nextPath = getSafeFunEduNextPath(request.nextUrl.searchParams.get("next"))
  const token = await signFunEduSsoToken(user, nextPath)

  if (!token) {
    const directUrl = buildFunEduUrl(parsedFunEduBaseUrl.toString(), nextPath)
    directUrl.searchParams.set("from", "funbase")
    return NextResponse.redirect(directUrl)
  }

  const callbackUrl = buildFunEduUrl(parsedFunEduBaseUrl.toString(), getFunEduCallbackPath())
  callbackUrl.searchParams.set("token", token)
  callbackUrl.searchParams.set("next", nextPath)

  return NextResponse.redirect(callbackUrl)
}
