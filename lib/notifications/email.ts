import nodemailer from 'nodemailer'

type SendEmailInput = {
  to: string | string[]
  subject: string
  text: string
  html?: string
}

export const EMAIL_FROM =
  process.env.EMAIL_FROM ??
  (process.env.SMTP_USER ? `FunBase <${process.env.SMTP_USER}>` : 'FunBase <noreply@funtoco.jp>')

function maskEmail(email: string): string {
  const [localPart, domain] = email.split('@')
  if (!domain) return '***'
  const visibleLocal = localPart.slice(0, Math.min(2, localPart.length))
  return `${visibleLocal}***@${domain}`
}

function getMaskedRecipients(to: string | string[]): string | string[] {
  return Array.isArray(to) ? to.map(maskEmail) : maskEmail(to)
}

export async function sendEmail({ to, subject, text, html }: SendEmailInput): Promise<void> {
  const smtpHost = process.env.SMTP_HOST
  const smtpUser = process.env.SMTP_USER
  const smtpPass = process.env.SMTP_PASS

  if (!smtpHost || !smtpUser || !smtpPass) {
    const message = '[email] skipped: SMTP_HOST, SMTP_USER or SMTP_PASS is not configured'
    if (process.env.NODE_ENV === 'production') {
      throw new Error(message)
    }
    console.warn(message)
    return
  }

  const port = Number(process.env.SMTP_PORT ?? 587)
  const secure = process.env.SMTP_SECURE === 'true' || (process.env.SMTP_SECURE === undefined && port === 465)
  const maskedTo = getMaskedRecipients(to)

  console.info('[email] send attempt', {
    provider: 'smtp',
    to: maskedTo,
    subject,
    from: EMAIL_FROM,
    host: smtpHost,
    port,
    secure,
  })

  const transporter = nodemailer.createTransport({
    host: smtpHost,
    port,
    secure,
    auth: { user: smtpUser, pass: smtpPass },
  })

  const info = await transporter.sendMail({
    from: EMAIL_FROM,
    to,
    subject,
    text,
    html,
  })

  console.info('[email] send accepted', {
    provider: 'smtp',
    to: maskedTo,
    subject,
    messageId: typeof info.messageId === 'string' ? info.messageId : undefined,
  })
}
