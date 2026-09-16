const KINTONE_PLACEHOLDER_BASENAME = 'noimage'

function getBaseName(fileName: string): string {
  const name = fileName.split(/[\\/]/).pop() ?? ''
  const lastDot = name.lastIndexOf('.')
  return lastDot > 0 ? name.slice(0, lastDot) : name
}

function decodeBase64Url(value: string): string | null {
  try {
    const normalized = value.replace(/-/g, '+').replace(/_/g, '/')
    const padded = normalized.padEnd(normalized.length + ((4 - normalized.length % 4) % 4), '=')
    return globalThis.atob(padded)
  } catch {
    return null
  }
}

export function isKintonePlaceholderImageName(fileName?: string | null): boolean {
  if (!fileName) return false
  return getBaseName(fileName).toLowerCase() === KINTONE_PLACEHOLDER_BASENAME
}

export function isKintonePlaceholderImagePath(imagePath?: string | null): boolean {
  if (!imagePath) return false

  const baseName = getBaseName(imagePath)
  return baseName.toLowerCase() === KINTONE_PLACEHOLDER_BASENAME
    || decodeBase64Url(baseName)?.toLowerCase() === KINTONE_PLACEHOLDER_BASENAME
}
