import { describe, expect, it } from "vitest"

import {
  isLikelyExistingAccountSignUpResponse,
  validateInviteRegistrationPasswords,
} from "./invite-registration-form"

describe("isLikelyExistingAccountSignUpResponse", () => {
  it("detects Supabase's fake existing-user signup response", () => {
    expect(isLikelyExistingAccountSignUpResponse({ identities: [] })).toBe(true)
  })

  it("does not treat a new signup identity as an existing account", () => {
    expect(isLikelyExistingAccountSignUpResponse({ identities: [{ id: "identity" }] })).toBe(false)
  })

  it("does not treat a missing user as an existing account", () => {
    expect(isLikelyExistingAccountSignUpResponse(null)).toBe(false)
  })
})

describe("validateInviteRegistrationPasswords", () => {
  it("requires the password to be at least 8 characters", () => {
    expect(validateInviteRegistrationPasswords("abcdefg", "abcdefg")).toBe("パスワードは8文字以上で入力してください")
  })

  it("requires the confirmation password to match", () => {
    expect(validateInviteRegistrationPasswords("abcdefgh", "abcdefgi")).toBe("パスワードが一致しません")
  })

  it("can skip the minimum length check for existing-account sign in", () => {
    expect(
      validateInviteRegistrationPasswords("abcdef", "abcdef", { enforceMinimumLength: false })
    ).toBeNull()
  })

  it("accepts matching passwords with at least 8 characters", () => {
    expect(validateInviteRegistrationPasswords("abcdefgh", "abcdefgh")).toBeNull()
  })
})
