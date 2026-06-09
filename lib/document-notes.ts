export function normalizeDocumentNote(note: unknown): string | null {
  if (typeof note !== "string") return null

  const trimmed = note.trim()
  return trimmed.length > 0 ? trimmed : null
}

export function resolveReplacementDocumentNote(
  nextNote: string | null | undefined,
  existingNote?: string | null,
): string | null {
  if (nextNote === undefined) {
    return existingNote || null
  }

  return normalizeDocumentNote(nextNote)
}
