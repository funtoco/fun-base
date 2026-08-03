import { beforeEach, describe, expect, test, vi } from 'vitest'

const mocks = vi.hoisted(() => ({
  listConnectors: vi.fn(),
  getCredential: vi.fn(),
  updateCredential: vi.fn(),
  getRecords: vi.fn(),
  kintoneClientConstructor: vi.fn(),
}))

vi.mock('@/lib/db/connectors', () => ({
  listConnectors: mocks.listConnectors,
  getCredential: mocks.getCredential,
  updateCredential: mocks.updateCredential,
}))

vi.mock('@/lib/kintone/api-client', () => ({
  KintoneApiClient: vi.fn().mockImplementation(function (this: any, config) {
    mocks.kintoneClientConstructor(config)
    this.getRecords = mocks.getRecords
  }),
}))

import { getRetirementNoticeKintoneValues } from './retirement-notice-kintone-values'

const basePerson = {
  id: '1234',
  externalId: '1234',
  tenantId: 'tenant-1',
  name: 'テスト 太郎',
  createdAt: '2026-01-01',
  updatedAt: '2026-01-01',
}

beforeEach(() => {
  vi.clearAllMocks()
  mocks.listConnectors.mockResolvedValue([{ id: 'connector-1', provider: 'kintone' }])
  mocks.getCredential.mockImplementation(async (_connectorId: string, type: string) => {
    if (type === 'kintone_config') {
      return {
        domain: 'https://funtoco.cybozu.com',
        clientId: 'client-id',
        clientSecret: 'client-secret',
      }
    }
    if (type === 'kintone_token') {
      return {
        refresh_token: 'refresh-token',
        expires_at: '2000-01-01T00:00:00.000Z',
      }
    }
    return null
  })
  mocks.getRecords.mockImplementation(async (appId: string) => {
    if (appId === '13') {
      return [
        {
          $id: { value: '1234' },
          $revision: { value: '1' },
          WOID: { value: '1234' },
          COID: { value: '34' },
          OFID: { value: '36' },
          sex: { value: '男' },
          field: { value: '介護' },
          kyogikaiText: { value: '介護業務全般' },
          retirementDate: { value: '2026-07-31' },
        },
      ]
    }
    if (appId === '92') return []
    if (appId === '34') {
      return [
        {
          $id: { value: '34' },
          $revision: { value: '1' },
          法人番号_13桁_: { value: '5120001198866' },
          postCode: { value: '556-0004' },
          address: { value: '大阪府大阪市浪速区' },
          telephoneNumber: { value: '06-0000-0000' },
        },
      ]
    }
    if (appId === '36') {
      return [
        {
          $id: { value: '36' },
          $revision: { value: '1' },
          postCode: { value: '530-0001' },
          address: { value: '大阪府大阪市北区' },
          phoneNumber: { value: '06-1111-1111' },
        },
      ]
    }
    return []
  })
  vi.stubGlobal(
    'fetch',
    vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({
        access_token: 'new-access-token',
        expires_in: 3600,
        token_type: 'Bearer',
      }),
    })
  )
})

describe('getRetirementNoticeKintoneValues', () => {
  test('refreshes kintone token with client credentials even when the stored access token is missing', async () => {
    const values = await getRetirementNoticeKintoneValues(basePerson as any)

    expect(fetch).toHaveBeenCalledWith(
      'https://funtoco.cybozu.com/oauth2/token',
      expect.objectContaining({
        method: 'POST',
        headers: expect.objectContaining({
          Authorization: `Basic ${Buffer.from('client-id:client-secret').toString('base64')}`,
        }),
      })
    )
    expect(String((fetch as any).mock.calls[0][1].body)).toBe('grant_type=refresh_token&refresh_token=refresh-token')
    expect(mocks.updateCredential).toHaveBeenCalledWith(
      'connector-1',
      'kintone_token',
      expect.objectContaining({
        access_token: 'new-access-token',
        refresh_token: 'refresh-token',
        token_type: 'Bearer',
      })
    )
    expect(mocks.kintoneClientConstructor).toHaveBeenCalledWith({
      domain: 'https://funtoco.cybozu.com',
      accessToken: 'new-access-token',
    })
    expect(values).toMatchObject({
      sex: '男',
      specificSkillField: '介護分野',
      businessCategory: '介護業務全般',
      employmentContractEndDate: '2026-07-31',
      companyCorporateNumber: '5120001198866',
      companyPostalCode: '530-0001',
      companyAddress: '大阪府大阪市北区',
      companyPhone: '06-1111-1111',
    })
  })

  test('converts selected app92 checkbox fields to marks for checkbox PDF placements', async () => {
    mocks.getRecords.mockImplementation(async (appId: string) => {
      if (appId === '13') {
        return [
          {
            $id: { value: '1234' },
            $revision: { value: '1' },
            WOID: { value: '1234' },
          },
        ]
      }
      if (appId === '92') {
        return [
          {
            $id: { value: '92' },
            $revision: { value: '1' },
            WOID: { value: '1234' },
            会社都合: { value: ['会社都合'] },
            事案概要: { value: '本人都合ではない退職です' },
          },
        ]
      }
      return []
    })

    const values = await getRetirementNoticeKintoneValues(basePerson as any)

    expect(values.fieldValues).toMatchObject({
      会社都合: '✓',
      事案概要: '本人都合ではない退職です',
    })
  })
})
