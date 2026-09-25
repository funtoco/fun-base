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
    expect(envBlock).toContain("APP_BASE_URL: ${{ vars.APP_BASE_URL || secrets.APP_BASE_URL || 'https://funbase.funtoco.jp' }}")
    expect(envBlock).toContain('SMTP_HOST: ${{ secrets.SMTP_HOST }}')
    expect(envBlock).toContain('SMTP_USER: ${{ secrets.SMTP_USER }}')
    expect(envBlock).toContain('SMTP_PASS: ${{ secrets.SMTP_PASS }}')
    expect(envBlock).toContain('SMTP_PORT: ${{ secrets.SMTP_PORT }}')
    expect(envBlock).toContain('SMTP_SECURE: ${{ secrets.SMTP_SECURE }}')
    expect(envBlock).toContain('EMAIL_FROM: ${{ secrets.EMAIL_FROM }}')
    expect(workflow).toContain('Missing SMTP configuration')
  })

  describe('people cleanup cron', () => {
    test('09:00 UTCの日次scheduleとworkflow_dispatchのpeople_cleanup選択肢を持つ', () => {
      expect(workflow).toContain("- cron: '0 9 * * *'")
      expect(workflow).toContain('- people_cleanup')
      expect(workflow).toContain("github.event.schedule == '0 9 * * *'")
      expect(workflow).toContain("github.event.inputs.sync_type == 'people_cleanup'")
    })

    test('cleanup jobは重複実行をconcurrencyで防ぐ', () => {
      expect(workflow).toContain('sync-people:')
      expect(workflow).toContain('people-cleanup:')
      expect(workflow).toContain('concurrency:')
      expect((workflow.match(/group: people-sync-\${{ github\.workflow }}/g) || []).length).toBe(2)
      expect(workflow).toContain('cancel-in-progress: false')
    })

    test('cleanup jobはsecure jobと同じpin済みaction SHAを使う', () => {
      expect(workflow).toContain('actions/checkout@34e114876b0b11c390a56381ad16ebd13914f8d5 # v4')
      expect(workflow).toContain('pnpm/action-setup@b906affcce14559ad1aafd4ab0e942779e9f58b1 # v4')
      expect(workflow).toContain('actions/setup-node@49933ea5288caeca8642d1e84afbd3f7d6820020 # v4')
    })

    test('手動cleanupはdry-runデフォルトでscheduleだけapplyする', () => {
      expect(workflow).toContain("people_cleanup_apply:")
      expect(workflow).toContain("default: 'false'")
      expect(workflow).toContain('cmd=(pnpm dlx tsx@4.20.3 scripts/cleanup-deleted-people.ts)')
      expect(workflow).toContain('if [ "$GITHUB_EVENT_NAME" = "schedule" ] || [ "$PEOPLE_CLEANUP_APPLY" = "true" ]; then')
      expect(workflow).toContain('cmd+=(--apply)')
    })

    test('tenantごとの削除上限をworkflow入力から渡す', () => {
      expect(workflow).toContain('people_cleanup_max_delete_per_tenant:')
      expect(workflow).toContain("PEOPLE_CLEANUP_MAX_DELETE_PER_TENANT: ${{ github.event.inputs.people_cleanup_max_delete_per_tenant || '20' }}")
      expect(workflow).toContain('people_cleanup_max_delete_per_tenant must be 100 or less')
      expect(workflow).toContain('cmd+=(--max-delete-per-tenant "$PEOPLE_CLEANUP_MAX_DELETE_PER_TENANT")')
    })
  })
})
