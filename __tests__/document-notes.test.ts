import { describe, expect, it } from "vitest"
import { normalizeDocumentNote, resolveReplacementDocumentNote } from "@/lib/document-notes"

describe("document note helpers", () => {
  it("trims text notes and stores blank notes as null", () => {
    expect(normalizeDocumentNote("  確認済み  ")).toBe("確認済み")
    expect(normalizeDocumentNote("   ")).toBeNull()
    expect(normalizeDocumentNote(null)).toBeNull()
  })

  it("preserves existing notes when replacement upload omits a note", () => {
    expect(resolveReplacementDocumentNote(undefined, "既存メモ")).toBe("既存メモ")
    expect(resolveReplacementDocumentNote(undefined, null)).toBeNull()
  })

  it("allows replacement upload to update or clear the note", () => {
    expect(resolveReplacementDocumentNote(" 新しいメモ ", "既存メモ")).toBe("新しいメモ")
    expect(resolveReplacementDocumentNote("", "既存メモ")).toBeNull()
  })
})
