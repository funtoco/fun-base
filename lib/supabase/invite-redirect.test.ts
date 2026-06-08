import { afterEach, describe, expect, it } from "vitest"

import { getInviteRedirectUrl } from "./invite-redirect"

const originalAppUrl = process.env.NEXT_PUBLIC_APP_URL

afterEach(() => {
  if (originalAppUrl === undefined) {
    delete process.env.NEXT_PUBLIC_APP_URL
  } else {
    process.env.NEXT_PUBLIC_APP_URL = originalAppUrl
  }
})

describe("getInviteRedirectUrl", () => {
  it("uses NEXT_PUBLIC_APP_URL when configured", () => {
    process.env.NEXT_PUBLIC_APP_URL = "https://example.com/base"

    expect(getInviteRedirectUrl("https://request.example.com")).toBe(
      "https://example.com/auth/set-password"
    )
  })

  it("falls back to the request origin when NEXT_PUBLIC_APP_URL is missing", () => {
    delete process.env.NEXT_PUBLIC_APP_URL

    expect(getInviteRedirectUrl("https://request.example.com")).toBe(
      "https://request.example.com/auth/set-password"
    )
  })

  it("still reports a configuration error when no URL source is available", () => {
    delete process.env.NEXT_PUBLIC_APP_URL

    expect(() => getInviteRedirectUrl()).toThrow(
      "NEXT_PUBLIC_APP_URL is not configured"
    )
  })
})
