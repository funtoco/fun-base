interface InviteRedirectUrlOptions {
  requestOrigin?: string | null
}

const INVITE_REDIRECT_PATH = "/auth/set-password"

function normalizeBaseUrl(value: string, source: string): string {
  const trimmedValue = value.trim()
  const urlValue =
    source.startsWith("VERCEL_") && !/^https?:\/\//i.test(trimmedValue)
      ? `https://${trimmedValue}`
      : trimmedValue

  let url: URL
  try {
    url = new URL(urlValue)
  } catch {
    throw new Error(`${source} is invalid`)
  }

  if (!["http:", "https:"].includes(url.protocol) || url.username || url.password) {
    throw new Error(`${source} is invalid`)
  }

  return url.origin
}

function getConfiguredAppUrl(): { source: string; value: string } | null {
  const configuredUrls = [
    ["NEXT_PUBLIC_APP_URL", process.env.NEXT_PUBLIC_APP_URL],
    ["VERCEL_PROJECT_PRODUCTION_URL", process.env.VERCEL_PROJECT_PRODUCTION_URL],
    ["VERCEL_URL", process.env.VERCEL_URL],
  ] as const

  for (const [source, value] of configuredUrls) {
    if (value?.trim()) {
      return { source, value }
    }
  }

  return null
}

export function getInviteRedirectUrl(options: InviteRedirectUrlOptions = {}): string {
  const configuredAppUrl = getConfiguredAppUrl()
  const baseUrl = configuredAppUrl ?? (
    options.requestOrigin?.trim()
      ? { source: "request origin", value: options.requestOrigin }
      : null
  )

  if (!baseUrl) {
    throw new Error("Invitation redirect URL is not configured")
  }

  return new URL(INVITE_REDIRECT_PATH, normalizeBaseUrl(baseUrl.value, baseUrl.source)).toString()
}
