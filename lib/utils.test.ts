import assert from "node:assert/strict"
import { test } from "vitest"

import { toUpperCaseString } from "@/lib/utils"

test("toUpperCaseString converts alphabetic characters to uppercase", () => {
  assert.equal(toUpperCaseString("funbase"), "FUNBASE")
  assert.equal(toUpperCaseString("FunBase 123"), "FUNBASE 123")
})

test("toUpperCaseString preserves non-alphabetic and already uppercase characters", () => {
  assert.equal(toUpperCaseString("ＦｕｎＢａｓｅ-日本語"), "ＦＵＮＢＡＳＥ-日本語")
  assert.equal(toUpperCaseString(""), "")
})
