type TenantInvitationEmailInput = {
  tenantName: string
  inviteUrl: string
}

export function buildTenantInviteUrl(baseUrl: string, token: string): string {
  const normalizedBaseUrl = baseUrl.trim()
  const url = new URL(`/invite/${encodeURIComponent(token)}`, normalizedBaseUrl)
  return url.toString()
}

export function buildTenantInvitationEmail({ tenantName, inviteUrl }: TenantInvitationEmailInput) {
  const subject = `FunBaseへの招待: ${tenantName}`
  const text = [
    `${tenantName} のFunBaseに招待されました。`,
    "",
    "以下のリンクから参加してください。",
    inviteUrl,
    "",
    "この招待リンクは参加が完了するまで再度開けます。",
  ].join("\n")

  const html = `
    <p>${escapeHtml(tenantName)} のFunBaseに招待されました。</p>
    <p><a href="${escapeHtml(inviteUrl)}">FunBaseに参加する</a></p>
    <p>リンクが開けない場合は、以下のURLをブラウザに貼り付けてください。</p>
    <p>${escapeHtml(inviteUrl)}</p>
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
