import { describe, it, expect } from 'vitest'
import { readDriveAuthFromEnv } from '@/lib/portal/drive/drive-client'
import { mirrorRequirementDocumentToDrive } from '@/lib/portal/drive/mirror'
import type { DriveClient } from '@/lib/portal/drive/drive-client'

describe('readDriveAuthFromEnv', () => {
  it('正しいJSONから clientEmail/privateKey を取り出す', () => {
    const json = JSON.stringify({
      client_email: 'sa@test.iam.gserviceaccount.com',
      private_key: '-----BEGIN PRIVATE KEY-----\nBODY\n-----END PRIVATE KEY-----',
    })
    const auth = readDriveAuthFromEnv({ GOOGLE_SERVICE_ACCOUNT_JSON: json })
    expect(auth?.clientEmail).toBe('sa@test.iam.gserviceaccount.com')
    expect(auth?.privateKey).toContain('BEGIN PRIVATE KEY')
    expect(auth?.privateKey).toContain('\n')
  })

  it('エスケープされた \\n を実改行に復元する', () => {
    const raw = '{"client_email":"a@b.iam","private_key":"L1\\\\nL2"}'
    const auth = readDriveAuthFromEnv({ GOOGLE_SERVICE_ACCOUNT_JSON: raw })
    expect(auth?.privateKey).toBe('L1\nL2')
  })

  it('未設定・壊れたJSON・必須欠落は null', () => {
    expect(readDriveAuthFromEnv({})).toBeNull()
    expect(readDriveAuthFromEnv({ GOOGLE_SERVICE_ACCOUNT_JSON: 'not json' })).toBeNull()
    expect(
      readDriveAuthFromEnv({ GOOGLE_SERVICE_ACCOUNT_JSON: '{"client_email":"x"}' })
    ).toBeNull()
  })
})

describe('mirrorRequirementDocumentToDrive: 認証未設定は早期 skip', () => {
  const dummyDrive = { createFile: async () => ({ id: 'x' }) } as DriveClient

  it('driveClient 無し → skipped(no_drive_auth)・DBに触れない', async () => {
    const res = await mirrorRequirementDocumentToDrive({
      caseId: 'c',
      requirementId: 'r',
      driveClient: null,
      hubClient: {} as never,
    })
    expect(res).toEqual({ status: 'skipped', reason: 'no_drive_auth' })
  })

  it('hubClient 無し → skipped(no_kintone_auth)', async () => {
    const res = await mirrorRequirementDocumentToDrive({
      caseId: 'c',
      requirementId: 'r',
      driveClient: dummyDrive,
      hubClient: null,
    })
    expect(res).toEqual({ status: 'skipped', reason: 'no_kintone_auth' })
  })
})
