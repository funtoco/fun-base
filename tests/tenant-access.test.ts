import assert from "node:assert/strict"
import { test } from "node:test"

import {
  canManageTenant,
  getTenantMemberRemovalError,
  getTenantMemberRoleUpdateError,
  isTenantOwner,
} from "../lib/tenant-access"

test("canManageTenant tetap true saat user punya owner dan supporter pada tenant yang sama", () => {
  assert.equal(
    canManageTenant([{ role: "owner" }, { role: "supporter" }]),
    true
  )
})

test("canManageTenant tetap true saat user punya admin dan supporter pada tenant yang sama", () => {
  assert.equal(
    canManageTenant([{ role: "admin" }, { role: "supporter" }]),
    true
  )
})

test("canManageTenant false kalau tidak ada owner/admin aktif", () => {
  assert.equal(
    canManageTenant([{ role: "member" }, { role: "supporter" }]),
    false
  )
})

test("isTenantOwner hanya true jika ada role owner", () => {
  assert.equal(
    isTenantOwner([{ role: "admin" }, { role: "supporter" }]),
    false
  )
  assert.equal(
    isTenantOwner([{ role: "owner" }, { role: "supporter" }]),
    true
  )
})

test("role update tetap diizinkan untuk owner/admin walau actor punya supporter juga", () => {
  assert.equal(
    getTenantMemberRoleUpdateError({
      currentUserId: "actor",
      targetUserId: "target",
      targetRole: "member",
      actorMemberships: [{ role: "admin" }, { role: "supporter" }],
      nextRole: "guest",
      activeOwnerCount: 2,
    }),
    null
  )
})

test("role update menolak self-demotion dan last owner demotion", () => {
  assert.equal(
    getTenantMemberRoleUpdateError({
      currentUserId: "actor",
      targetUserId: "actor",
      targetRole: "admin",
      actorMemberships: [{ role: "owner" }],
      nextRole: "member",
      activeOwnerCount: 2,
    }),
    "自分のロールは変更できません"
  )

  assert.equal(
    getTenantMemberRoleUpdateError({
      currentUserId: "actor",
      targetUserId: "target",
      targetRole: "owner",
      actorMemberships: [{ role: "owner" }],
      nextRole: "member",
      activeOwnerCount: 1,
    }),
    "最後のオーナーは削除・降格できません"
  )
})

test("member removal menolak self-delete, owner-delete, dan supporter-delete", () => {
  assert.equal(
    getTenantMemberRemovalError({
      currentUserId: "actor",
      targetUserId: "actor",
      targetRole: "member",
      actorMemberships: [{ role: "owner" }],
    }),
    "自分自身を削除することはできません"
  )

  assert.equal(
    getTenantMemberRemovalError({
      currentUserId: "actor",
      targetUserId: "target",
      targetRole: "owner",
      actorMemberships: [{ role: "owner" }],
    }),
    "オーナーは削除できません"
  )

  assert.equal(
    getTenantMemberRemovalError({
      currentUserId: "actor",
      targetUserId: "target",
      targetRole: "supporter",
      actorMemberships: [{ role: "owner" }],
    }),
    "supporter ロールはこの画面から削除できません"
  )
})
