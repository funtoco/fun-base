import { describe, expect, it } from "vitest"

import { validateInviteRegistrationPasswords } from "./invite-registration-form"

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
