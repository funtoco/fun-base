import { afterEach, describe, expect, it } from "vitest"

import { getInviteRedirectUrl } from "./invite-redirect"

const ENV_KEYS = [
  "NEXT_PUBLIC_APP_URL",
  "VERCEL_PROJECT_PRODUCTION_URL",
  "VERCEL_URL",
] as const

const ORIGINAL_ENV = Object.fromEntries(
  ENV_KEYS.map((key) => [key, process.env[key]])
) as Record<(typeof ENV_KEYS)[number], string | undefined>

function clearInviteUrlEnv() {
  for (const key of ENV_KEYS) {
    delete process.env[key]
  }
}

function restoreInviteUrlEnv() {
  clearInviteUrlEnv()

  for (const key of ENV_KEYS) {
    const value = ORIGINAL_ENV[key]
    if (value !== undefined) {
      process.env[key] = value
    }
  }
}

afterEach(() => {
  restoreInviteUrlEnv()
})

describe("getInviteRedirectUrl", () => {
  it("uses NEXT_PUBLIC_APP_URL when configured", () => {
    clearInviteUrlEnv()
    process.env.NEXT_PUBLIC_APP_URL = "https://funbase.example.com"

    expect(getInviteRedirectUrl({ requestOrigin: "https://ignored.example.com" })).toBe(
      "https://funbase.example.com/auth/set-password"
    )
  })

  it("falls back to the current request origin when app URL env is missing", () => {
    clearInviteUrlEnv()

    expect(getInviteRedirectUrl({ requestOrigin: "https://funbase.funtoco.jp" })).toBe(
      "https://funbase.funtoco.jp/auth/set-password"
    )
  })

  it("normalizes Vercel URL env values without a scheme", () => {
    clearInviteUrlEnv()
    process.env.VERCEL_URL = "funbase-git-main-funtoco.vercel.app"

    expect(getInviteRedirectUrl()).toBe(
      "https://funbase-git-main-funtoco.vercel.app/auth/set-password"
    )
  })

  it("rejects an invalid configured app URL even when request origin exists", () => {
    clearInviteUrlEnv()
    process.env.NEXT_PUBLIC_APP_URL = "not a valid url"

    expect(() =>
      getInviteRedirectUrl({ requestOrigin: "https://funbase.funtoco.jp" })
    ).toThrow("NEXT_PUBLIC_APP_URL is invalid")
  })

  it("rejects unsafe request origins", () => {
    clearInviteUrlEnv()

    expect(() => getInviteRedirectUrl({ requestOrigin: "javascript:alert(1)" })).toThrow(
      "request origin is invalid"
    )
  })

  it("fails clearly when no app URL source is available", () => {
    clearInviteUrlEnv()

    expect(() => getInviteRedirectUrl()).toThrow(
      "Invitation redirect URL is not configured"
    )
  })
})
