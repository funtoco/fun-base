import { SignJWT } from "jose"
import type { User } from "@supabase/supabase-js"

const DEFAULT_FUNEDU_CALLBACK_PATH = "/auth/funbase/callback"
const DEFAULT_FUNEDU_NEXT_PATH = "/"

export function getFunEduBaseUrl() {
  return process.env.FUNEDU_URL || process.env.NEXT_PUBLIC_FUNEDU_URL || null
}

export function getFunEduCallbackPath() {
  return process.env.FUNEDU_SSO_CALLBACK_PATH || DEFAULT_FUNEDU_CALLBACK_PATH
}

export function getSafeFunEduNextPath(rawNext: string | null | undefined) {
  if (!rawNext || !rawNext.startsWith("/") || rawNext.startsWith("//")) {
    return DEFAULT_FUNEDU_NEXT_PATH
  }

  try {
    const nextUrl = new URL(rawNext, "https://funedu.local")
    return `${nextUrl.pathname}${nextUrl.search}${nextUrl.hash}`
  } catch {
    return DEFAULT_FUNEDU_NEXT_PATH
  }
}

export function buildFunEduUrl(baseUrl: string, path: string) {
  return new URL(path, baseUrl)
}

export async function signFunEduSsoToken(user: User, nextPath: string) {
  const secret = process.env.FUNEDU_SSO_SECRET
  if (!secret) {
    return null
  }

  const now = Math.floor(Date.now() / 1000)

  return new SignJWT({
    sub: user.id,
    email: user.email,
    role: user.user_metadata?.role ?? null,
    next: nextPath,
    source: "funbase",
  })
    .setProtectedHeader({ alg: "HS256" })
    .setIssuer("funbase")
    .setAudience("funedu")
    .setIssuedAt(now)
    .setExpirationTime(now + 60)
    .setJti(crypto.randomUUID())
    .sign(new TextEncoder().encode(secret))
}
