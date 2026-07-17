import { describe, expect, test } from 'vitest'
import { readFileSync } from 'node:fs'

const workflow = readFileSync('.github/workflows/cron-sync.yml', 'utf8')

function getSyncInterviewRecordsEnvBlock(): string {
  const match = workflow.match(/- name: Sync Interview Records\n\s+env:\n(?<envBlock>(?:\s{10}[A-Z0-9_]+:.*\n)+)/)
  if (!match?.groups?.envBlock) {
    throw new Error('Sync Interview Records env block was not found')
  }

  return match.groups.envBlock
}

describe('cron-sync workflow', () => {
  test('passes SMTP settings to the interview record sync job so email notifications are delivered', () => {
    const envBlock = getSyncInterviewRecordsEnvBlock()

    expect(envBlock).toContain('NODE_ENV: production')
    expect(envBlock).toContain('NEXT_PUBLIC_APP_URL: ${{ vars.NEXT_PUBLIC_APP_URL || secrets.NEXT_PUBLIC_APP_URL }}')
    expect(envBlock).toContain('APP_BASE_URL: ${{ vars.APP_BASE_URL || secrets.APP_BASE_URL }}')
    expect(envBlock).toContain('SMTP_HOST: ${{ secrets.SMTP_HOST }}')
    expect(envBlock).toContain('SMTP_USER: ${{ secrets.SMTP_USER }}')
    expect(envBlock).toContain('SMTP_PASS: ${{ secrets.SMTP_PASS }}')
    expect(envBlock).toContain('SMTP_PORT: ${{ secrets.SMTP_PORT }}')
    expect(envBlock).toContain('SMTP_SECURE: ${{ secrets.SMTP_SECURE }}')
    expect(envBlock).toContain('EMAIL_FROM: ${{ secrets.EMAIL_FROM }}')
  })
})
