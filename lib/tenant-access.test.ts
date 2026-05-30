import assert from "node:assert/strict"
import test from "node:test"

import {
  canManageCompanyContacts,
  isCompanyContactEmail,
  isCompanyContactRole,
  isInternalStaffEmail,
} from "./tenant-access"

test("internal active member can manage company contacts without full admin role", () => {
  const result = canManageCompanyContacts([{ role: "member" }], "sales@funtoco.jp")

  assert.equal(result, true)
})

test("external member cannot manage company contacts", () => {
  const result = canManageCompanyContacts([{ role: "member" }], "pic@company.jp")

  assert.equal(result, false)
})

test("guest cannot manage company contacts even with internal email", () => {
  const result = canManageCompanyContacts([{ role: "guest" }], "sales@funtoco.jp")

  assert.equal(result, false)
})

test("owner and admin retain company contact management access", () => {
  assert.equal(canManageCompanyContacts([{ role: "owner" }], "owner@funtoco.jp"), true)
  assert.equal(canManageCompanyContacts([{ role: "admin" }], "admin@funtoco.jp"), true)
})

test("company contact detection distinguishes internal and external emails", () => {
  assert.equal(isInternalStaffEmail("member@funtoco.jp"), true)
  assert.equal(isInternalStaffEmail(" Member@FUNToco.jp "), true)
  assert.equal(isCompanyContactEmail("member@funtoco.jp"), false)
  assert.equal(isCompanyContactEmail("contact@example.com"), true)
  assert.equal(isCompanyContactEmail(" contact@example.com "), true)
})

test("company contact role is limited to member and guest", () => {
  assert.equal(isCompanyContactRole("member"), true)
  assert.equal(isCompanyContactRole("guest"), true)
  assert.equal(isCompanyContactRole("admin"), false)
  assert.equal(isCompanyContactRole("supporter"), false)
})
