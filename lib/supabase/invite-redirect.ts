export function getInviteRedirectUrl(origin?: string): string {
  const appUrl = process.env.NEXT_PUBLIC_APP_URL || origin

  if (!appUrl) {
    throw new Error("NEXT_PUBLIC_APP_URL is not configured")
  }

  try {
    return new URL("/auth/set-password", appUrl).toString()
  } catch {
    throw new Error("NEXT_PUBLIC_APP_URL is invalid")
  }
}
