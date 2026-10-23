type TenantInvitationEmailInput = {
  tenantName: string
  inviteUrl: string
}

export function buildTenantInviteUrl(baseUrl: string, token: string): string {
  const normalizedBaseUrl = baseUrl.trim()
  const url = new URL(`/invite/${encodeURIComponent(token)}`, normalizedBaseUrl)
  return url.toString()
}

export function buildTenantLoginUrl(inviteUrl: string): string {
  return new URL("/login", inviteUrl).toString()
}

export function buildTenantInvitationEmail({ tenantName, inviteUrl }: TenantInvitationEmailInput) {
  const loginUrl = buildTenantLoginUrl(inviteUrl)
  const subject = `FunBaseへの招待: ${tenantName}`
  const text = [
    `${tenantName} のFunBaseに招待されました。`,
    "",
    "以下のリンクから参加してください。",
    inviteUrl,
    "",
    "参加完了後、次回以降は以下のログインページからFunBaseをご利用ください。",
    loginUrl,
    "",
    "この招待リンクは参加が完了するまで再度開けます。",
  ].join("\n")

  const html = `
    <p>${escapeHtml(tenantName)} のFunBaseに招待されました。</p>
    <p><a href="${escapeHtml(inviteUrl)}">FunBaseに参加する</a></p>
    <p>リンクが開けない場合は、以下のURLをブラウザに貼り付けてください。</p>
    <p>${escapeHtml(inviteUrl)}</p>
    <p>参加完了後、次回以降は以下のログインページからFunBaseをご利用ください。</p>
    <p><a href="${escapeHtml(loginUrl)}">FunBaseにログインする</a></p>
    <p>${escapeHtml(loginUrl)}</p>
    <p>この招待リンクは参加が完了するまで再度開けます。</p>
  `

  return { subject, text, html }
}

function escapeHtml(value: string): string {
  return value
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#39;")
}
