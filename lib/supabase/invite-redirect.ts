interface InviteRedirectUrlOptions {
  requestOrigin?: string | null
}

const INVITE_REDIRECT_PATH = "/auth/set-password"
const ALLOWED_ORIGINS_ENV_KEYS = [
  "INVITE_REDIRECT_ALLOWED_ORIGINS",
  "NEXT_PUBLIC_ALLOWED_ORIGINS",
] as const

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

function getAllowedRequestOrigins(): Set<string> {
  const allowedOrigins = new Set<string>()

  for (const envKey of ALLOWED_ORIGINS_ENV_KEYS) {
    const envValue = process.env[envKey]
    if (!envValue?.trim()) {
      continue
    }

    for (const origin of envValue.split(",")) {
      if (origin.trim()) {
        allowedOrigins.add(normalizeBaseUrl(origin, envKey))
      }
    }
  }

  return allowedOrigins
}

function getTrustedRequestOrigin(requestOrigin?: string | null): { source: string; value: string } | null {
  if (!requestOrigin?.trim()) {
    return null
  }

  const normalizedRequestOrigin = normalizeBaseUrl(requestOrigin, "request origin")

  if (process.env.NODE_ENV !== "production") {
    return { source: "request origin", value: normalizedRequestOrigin }
  }

  if (getAllowedRequestOrigins().has(normalizedRequestOrigin)) {
    return { source: "request origin", value: normalizedRequestOrigin }
  }

  return null
}

export function getInviteRedirectUrl(options: InviteRedirectUrlOptions = {}): string {
  const configuredAppUrl = getConfiguredAppUrl()
  const baseUrl = configuredAppUrl ?? getTrustedRequestOrigin(options.requestOrigin)

  if (!baseUrl) {
    throw new Error("Invitation redirect URL is not configured")
  }

  return new URL(INVITE_REDIRECT_PATH, normalizeBaseUrl(baseUrl.value, baseUrl.source)).toString()
}
