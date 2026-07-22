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
  it("requires the password to be at least 6 characters", () => {
    expect(validateInviteRegistrationPasswords("abcde", "abcde")).toBe("パスワードは6文字以上で入力してください")
  })

  it("requires the confirmation password to match", () => {
    expect(validateInviteRegistrationPasswords("abcdef", "abcdeg")).toBe("パスワードが一致しません")
  })

  it("accepts matching passwords with at least 6 characters", () => {
    expect(validateInviteRegistrationPasswords("abcdef", "abcdef")).toBeNull()
  })
})
