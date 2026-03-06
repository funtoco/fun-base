import { NextResponse } from "next/server"
import { createClient } from "@/lib/supabase/server"

export async function GET(request: Request) {
  const { searchParams, origin } = new URL(request.url)
  const code = searchParams.get("code")
  const type = searchParams.get("type")
  const next = searchParams.get("next")

  if (code) {
    const supabase = await createClient()
    const { error } = await supabase.auth.exchangeCodeForSession(code)
    if (!error) {
      // If a next URL is provided (e.g. /invite/TOKEN), redirect there
      if (next && next.startsWith("/")) {
        return NextResponse.redirect(`${origin}${next}`)
      }
      const redirectType = type || "recovery"
      return NextResponse.redirect(`${origin}/auth/set-password?type=${redirectType}`)
    }
    console.error("Code exchange error:", error)
  }

  return NextResponse.redirect(`${origin}/auth/set-password?error=invalid`)
}
