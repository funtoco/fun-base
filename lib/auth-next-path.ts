export function shouldActivateMembershipAfterPasswordSet(nextPath: string): boolean {
  return !nextPath.startsWith("/invite/")
}

export function getSafeAuthNextPath(
  nextPath: string | null | undefined,
  fallbackPath: string
): string {
  if (!nextPath?.trim()) {
    return fallbackPath
  }

  if (!nextPath.startsWith("/") || nextPath.startsWith("//")) {
    return fallbackPath
  }

  return nextPath
}
