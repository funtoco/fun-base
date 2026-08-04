import type { Person } from '@/lib/models'
import { KintoneApiClient, type KintoneRecord } from '@/lib/kintone/api-client'
import { getCredential, listConnectors, updateCredential } from '@/lib/db/connectors'
import { RETIREMENT_NOTICE_PLACEMENTS } from './retirement-notice-placements'

const KINTONE_WORK_APP_ID = '13'
const KINTONE_COMPANY_APP_ID = '34'
const KINTONE_OFFICE_APP_ID = '36'
const KINTONE_RETIREMENT_NOTICE_APP_ID = '92'
const CHECKBOX_FIELD_CODES: Set<string> = new Set(
  Object.values(RETIREMENT_NOTICE_PLACEMENTS)
    .flat()
    .filter((placement) => placement.width <= 25 && placement.height <= 25 && placement.style?.textAlign === 'center')
    .map((placement) => placement.fieldCode)
)

export type RetirementNoticeKintoneValues = Partial<
  Pick<
    Person,
    | 'name'
    | 'nationality'
    | 'dob'
    | 'sex'
    | 'residenceCardNo'
    | 'specificSkillField'
    | 'businessCategory'
    | 'employmentContractEndDate'
    | 'retirementDate'
    | 'company'
    | 'companyCorporateNumber'
    | 'companyPostalCode'
    | 'companyAddress'
    | 'companyPhone'
  >
> & {
  fieldValues?: Record<string, string>
}

export async function getRetirementNoticeKintoneValues(
  person: Person
): Promise<RetirementNoticeKintoneValues> {
  if (!person.tenantId) return {}

  const connectors = await listConnectors(person.tenantId)
  const connector = connectors.find((item) => item.provider === 'kintone')
  if (!connector) return {}

  const [config, token] = await Promise.all([
    getCredential(connector.id, 'kintone_config'),
    getCredential(connector.id, 'kintone_token'),
  ])
  const domain = config?.domain
  const accessToken = await getValidKintoneAccessToken(connector.id, config, token)

  if (!domain || !accessToken) return {}

  const client = new KintoneApiClient({
    domain,
    accessToken,
  })

  const workRecord = await getRecordById(client, KINTONE_WORK_APP_ID, person.id)
  const workId = valueOf(workRecord, 'WOID')?.replace(/^WO-/, '') || person.id
  const retirementRecord = workId
    ? await getFirstRecord(client, KINTONE_RETIREMENT_NOTICE_APP_ID, `WOID = ${quoteKintoneValue(workId)} limit 1`)
    : null

  const coid = numericRecordId(valueOf(workRecord, 'COID'))
  const ofid = numericRecordId(valueOf(workRecord, 'OFID'))
  const [companyRecord, officeRecord] = await Promise.all([
    coid ? getRecordById(client, KINTONE_COMPANY_APP_ID, coid) : Promise.resolve(null),
    ofid ? getRecordById(client, KINTONE_OFFICE_APP_ID, ofid) : Promise.resolve(null),
  ])

  if (retirementRecord) {
    const values = compactValues({
      name: valueOf(retirementRecord, '人材名') || valueOf(workRecord, 'name'),
      nationality: valueOf(retirementRecord, '国籍') || valueOf(workRecord, 'country'),
      dob: valueOf(retirementRecord, '生年月日') || valueOf(workRecord, 'dateOfBirth'),
      sex: valueOf(retirementRecord, '性別') || valueOf(workRecord, 'sex'),
      residenceCardNo: valueOf(retirementRecord, '在留カード番号') || valueOf(workRecord, 'latestResidenceCardNo'),
      specificSkillField: normalizeField(valueOf(retirementRecord, '分野') || valueOf(workRecord, 'field')),
      businessCategory: valueOf(retirementRecord, '業務区分') || valueOf(workRecord, 'kyogikaiText'),
      employmentContractEndDate: valueOf(retirementRecord, '退職日___支援終了日') || valueOf(workRecord, 'retirementDate'),
      retirementDate: valueOf(retirementRecord, '退職日___支援終了日') || valueOf(workRecord, 'retirementDate'),
      company: valueOf(retirementRecord, '法人名') || valueOf(companyRecord, 'companyName'),
      companyCorporateNumber: normalizeCorporateNumber(
        valueOf(retirementRecord, '所属機関_法人番号') || valueOf(companyRecord, '法人番号_13桁_')
      ),
      companyPostalCode:
        valueOf(retirementRecord, '所属機関_郵便番号') ||
        valueOf(officeRecord, 'postCode') ||
        valueOf(companyRecord, 'postCode'),
      companyAddress:
        valueOf(retirementRecord, '所属機関_住所') ||
        valueOf(officeRecord, 'address') ||
        valueOf(companyRecord, 'address'),
      companyPhone:
        valueOf(retirementRecord, '担当者_所属先電話番号') ||
        valueOf(officeRecord, 'phoneNumber') ||
        valueOf(companyRecord, 'telephoneNumber'),
    })
    values.fieldValues = {
      ...extractRecordValues(retirementRecord),
      ...buildPdfFieldAliases(values),
    }
    return values
  }

  return compactValues({
    name: valueOf(workRecord, 'name'),
    nationality: valueOf(workRecord, 'country'),
    dob: valueOf(workRecord, 'dateOfBirth'),
    sex: valueOf(workRecord, 'sex'),
    residenceCardNo: valueOf(workRecord, 'latestResidenceCardNo'),
    specificSkillField: normalizeField(valueOf(workRecord, 'field') || firstValue(workRecord?.categoryCheckBox?.value)),
    businessCategory: valueOf(workRecord, 'kyogikaiText'),
    employmentContractEndDate: valueOf(workRecord, 'retirementDate'),
    retirementDate: valueOf(workRecord, 'retirementDate'),
    company: valueOf(companyRecord, 'companyName'),
    companyCorporateNumber: normalizeCorporateNumber(valueOf(companyRecord, '法人番号_13桁_')),
    companyPostalCode: valueOf(officeRecord, 'postCode') || valueOf(companyRecord, 'postCode'),
    companyAddress: valueOf(officeRecord, 'address') || valueOf(companyRecord, 'address'),
    companyPhone: valueOf(officeRecord, 'phoneNumber') || valueOf(companyRecord, 'telephoneNumber'),
  })
}

export function applyRetirementNoticeKintoneValues(
  person: Person,
  values: RetirementNoticeKintoneValues
): Person {
  return {
    ...person,
    name: values.name ?? person.name,
    nationality: values.nationality ?? person.nationality,
    dob: values.dob ?? person.dob,
    sex: values.sex ?? person.sex,
    residenceCardNo: values.residenceCardNo ?? person.residenceCardNo,
    specificSkillField: values.specificSkillField ?? person.specificSkillField,
    businessCategory: values.businessCategory ?? person.businessCategory,
    employmentContractEndDate: values.employmentContractEndDate ?? person.employmentContractEndDate,
    retirementDate: values.retirementDate ?? person.retirementDate,
    company: values.company ?? person.company,
    companyCorporateNumber: values.companyCorporateNumber ?? person.companyCorporateNumber,
    companyPostalCode: values.companyPostalCode ?? person.companyPostalCode,
    companyAddress: values.companyAddress ?? person.companyAddress,
    companyPhone: values.companyPhone ?? person.companyPhone,
  }
}

async function getValidKintoneAccessToken(
  connectorId: string,
  config: any,
  token: any
): Promise<string | undefined> {
  const accessToken = cleanToken(token?.access_token)
  const refreshToken = cleanToken(token?.refresh_token)

  if (!refreshToken) return accessToken

  const expiresAt = parseKintoneTokenExpiry(token?.expires_at)
  const shouldRefresh = !accessToken || !expiresAt || Date.now() > expiresAt - 60_000
  if (!shouldRefresh) return accessToken

  const clientId = cleanToken(config?.clientId || config?.client_id)
  const clientSecret = cleanToken(config?.clientSecret || config?.client_secret)
  const domain = cleanToken(config?.domain)
  if (!domain || !clientId || !clientSecret) return accessToken

  try {
    const refreshed = await refreshKintoneToken({ domain, refreshToken, clientId, clientSecret })
    await updateCredential(connectorId, 'kintone_token', {
      ...token,
      ...refreshed,
      refresh_token: refreshed.refresh_token || refreshToken,
      expires_at: new Date(Date.now() + Math.max((Number(refreshed.expires_in) || 0) - 60, 0) * 1000).toISOString(),
    })
    return cleanToken(refreshed.access_token) || accessToken
  } catch (error) {
    console.error('[retirement-notice] kintone token refresh failed', { connectorId, error })
    return accessToken
  }
}

async function refreshKintoneToken({
  domain,
  refreshToken,
  clientId,
  clientSecret,
}: {
  domain: string
  refreshToken: string
  clientId: string
  clientSecret: string
}): Promise<{ access_token: string; refresh_token?: string; expires_in?: number; token_type?: string }> {
  const credentials = Buffer.from(`${clientId}:${clientSecret}`).toString('base64')
  const response = await fetch(`${domain.replace(/\/$/, '')}/oauth2/token`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/x-www-form-urlencoded',
      'Authorization': `Basic ${credentials}`,
    },
    body: new URLSearchParams({
      grant_type: 'refresh_token',
      refresh_token: refreshToken,
    }),
  })

  if (!response.ok) {
    throw new Error(`Kintone token refresh failed: ${response.status} ${await response.text()}`)
  }

  return response.json()
}

function parseKintoneTokenExpiry(value: unknown): number | undefined {
  if (typeof value === 'number' && Number.isFinite(value)) return value
  if (typeof value !== 'string' || !value.trim()) return undefined
  const trimmed = value.trim()
  const numeric = Number(trimmed)
  if (Number.isFinite(numeric)) return numeric
  const parsed = Date.parse(trimmed)
  return Number.isFinite(parsed) ? parsed : undefined
}

function cleanToken(value: unknown): string | undefined {
  if (typeof value !== 'string') return undefined
  const token = value.replace(/[\u3000\u00A0]/g, ' ').trim()
  return token || undefined
}

async function getRecordById(
  client: KintoneApiClient,
  appId: string,
  id: string
): Promise<KintoneRecord | null> {
  if (!id) return null
  return getFirstRecord(client, appId, `$id = ${quoteKintoneNumber(id)} limit 1`)
}

async function getFirstRecord(
  client: KintoneApiClient,
  appId: string,
  query: string
): Promise<KintoneRecord | null> {
  try {
    const records = await client.getRecords(appId, query, [])
    return records[0] ?? null
  } catch (error) {
    console.error('[retirement-notice] kintone lookup failed', { appId, error })
    return null
  }
}

function extractRecordValues(record: KintoneRecord): Record<string, string> {
  return Object.fromEntries(
    Object.entries(record)
      .filter(([fieldCode]) => !fieldCode.startsWith('$'))
      .map(([fieldCode, field]) => [fieldCode, stringifyKintoneValue(fieldCode, field?.value)])
      .filter(([, value]) => value)
  )
}

function stringifyKintoneValue(fieldCode: string, value: unknown): string {
  if (Array.isArray(value)) {
    const values = value.map((item) => String(item ?? '').trim()).filter(Boolean)
    if (CHECKBOX_FIELD_CODES.has(fieldCode)) return values.length > 0 ? '✓' : ''
    return values.join('、')
  }
  if (value === undefined || value === null) return ''
  return String(value).trim()
}

function buildPdfFieldAliases(values: RetirementNoticeKintoneValues): Record<string, string> {
  return Object.fromEntries(
    Object.entries({
      人材名: values.name,
      生年月日: values.dob,
      国籍: values.nationality,
      性別: values.sex,
      在留カード番号: values.residenceCardNo,
      分野: values.specificSkillField,
      業務区分: values.businessCategory,
      退職日___支援終了日: values.employmentContractEndDate || values.retirementDate,
      法人名: values.company,
      所属機関_法人番号: values.companyCorporateNumber,
      所属機関_郵便番号: values.companyPostalCode,
      所属機関_住所: values.companyAddress,
      担当者_所属先電話番号: values.companyPhone,
    }).filter(([, value]) => typeof value === 'string' && value.trim())
  ) as Record<string, string>
}

function valueOf(record: KintoneRecord | null | undefined, fieldCode: string): string | undefined {
  const raw = record?.[fieldCode]?.value
  if (Array.isArray(raw)) return firstValue(raw)
  if (raw === undefined || raw === null) return undefined
  const value = String(raw).trim()
  return value || undefined
}

function firstValue(value: unknown): string | undefined {
  if (!Array.isArray(value)) return undefined
  const first = value[0]
  if (first === undefined || first === null) return undefined
  const text = String(first).trim()
  return text || undefined
}

function normalizeField(value?: string): string | undefined {
  if (!value) return undefined
  return value.endsWith('分野') ? value : `${value}分野`
}

function normalizeCorporateNumber(value?: string): string | undefined {
  const digits = value?.replace(/\D/g, '')
  return digits || undefined
}

function numericRecordId(value?: string): string | undefined {
  const digits = value?.replace(/^[A-Z]+-/, '').replace(/\D/g, '')
  return digits || undefined
}

function quoteKintoneNumber(value: string): string {
  const digits = value.replace(/\D/g, '')
  return digits || '0'
}

function quoteKintoneValue(value: string): string {
  return `"${value.replace(/\\/g, '\\\\').replace(/"/g, '\\"')}"`
}

function compactValues(values: RetirementNoticeKintoneValues): RetirementNoticeKintoneValues {
  return Object.fromEntries(
    Object.entries(values).filter(([, value]) => typeof value === 'string' && value.trim())
  ) as RetirementNoticeKintoneValues
}
