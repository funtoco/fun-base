import { describe, expect, it } from "vitest"

import { isExistingAccountSignUpError } from "./auth-errors"

describe("isExistingAccountSignUpError", () => {
  it("detects existing account sign-up errors", () => {
    expect(isExistingAccountSignUpError("User already registered")).toBe(true)
    expect(isExistingAccountSignUpError("A user with this email already exists")).toBe(true)
  })

  it("does not treat unrelated sign-up errors as existing accounts", () => {
    expect(isExistingAccountSignUpError("Password should be at least 6 characters"))
      .toBe(false)
  })
})
