import {
  getPeopleCleanupServerClient,
  runPeopleCleanup,
} from '@/lib/sync/people-cleanup'

const DEFAULT_MAX_DELETE_PER_TENANT = 20
const ABSOLUTE_MAX_DELETE_PER_TENANT = 100

function getArgValue(flag: string): string | undefined {
  const index = process.argv.indexOf(flag)
  if (index === -1) return undefined
  return process.argv[index + 1]
}

function hasFlag(flag: string): boolean {
  return process.argv.includes(flag)
}

function parseNonNegativeIntegerOption(name: string, rawValue: string | undefined, defaultValue: number): number {
  if (rawValue === undefined || rawValue === '') {
    return defaultValue
  }

  if (!/^\d+$/.test(rawValue)) {
    throw new Error(`${name} must be a non-negative integer`)
  }

  const value = Number(rawValue)
  if (!Number.isSafeInteger(value)) {
    throw new Error(`${name} must be a safe non-negative integer`)
  }
  if (value > ABSOLUTE_MAX_DELETE_PER_TENANT) {
    throw new Error(`${name} must be ${ABSOLUTE_MAX_DELETE_PER_TENANT} or less`)
  }

  return value
}

async function main() {
  const apply = hasFlag('--apply') || process.env.PEOPLE_CLEANUP_APPLY === 'true'
  const maxDeletePerTenant = parseNonNegativeIntegerOption(
    'max-delete-per-tenant',
    getArgValue('--max-delete-per-tenant') || process.env.PEOPLE_CLEANUP_MAX_DELETE_PER_TENANT,
    DEFAULT_MAX_DELETE_PER_TENANT
  )

  console.log('[people-cleanup] start', {
    mode: apply ? 'apply' : 'dry-run',
    maxDeletePerTenant,
  })

  const supabase = getPeopleCleanupServerClient()
  const summary = await runPeopleCleanup(supabase, {
    apply,
    maxDeletePerTenant,
  })

  const failures = summary.results
    .filter((result) => !result.success)
    .map((result) => ({
      connectorId: result.connectorId,
      tenantId: result.tenantId,
      error: result.error,
    }))

  console.log('[people-cleanup] summary')
  console.log(JSON.stringify({
    mode: summary.mode,
    connectorCount: summary.connectorCount,
    successCount: summary.successCount,
    failedCount: summary.failedCount,
    candidateCount: summary.candidateCount,
    deletedCount: summary.deletedCount,
    dependentCounts: summary.dependentCounts,
    failures,
  }, null, 2))

  if (!summary.success) {
    process.exitCode = 1
  }
}

main().catch((error) => {
  console.error('[people-cleanup] failed:', error)
  process.exit(1)
})
