import { beforeEach, describe, expect, test, vi } from 'vitest'

const mocks = vi.hoisted(() => ({
  getPersonById: vi.fn(),
  getRetirementNoticeKintoneValues: vi.fn(),
  applyRetirementNoticeKintoneValues: vi.fn(),
  generateRetirementNoticePdf: vi.fn(),
}))

vi.mock('@/lib/supabase/people-server', () => ({
  getPersonById: mocks.getPersonById,
}))

vi.mock('@/lib/reports/retirement-notice-kintone-values', () => ({
  getRetirementNoticeKintoneValues: mocks.getRetirementNoticeKintoneValues,
  applyRetirementNoticeKintoneValues: mocks.applyRetirementNoticeKintoneValues,
}))

vi.mock('@/lib/reports/retirement-notice-pdf', () => ({
  generateRetirementNoticePdf: mocks.generateRetirementNoticePdf,
}))

import { GET } from './route'

const SELF_INITIATED_REPORT_CODE = 'vy0fa9sokdkdu9xnrp9kvqs2nwgaqoz7'
const PENSION_RETURN_REPORT_CODE = 'k4bvypb19xho5ystj8a2rstrupmnk5kh'

beforeEach(() => {
  vi.clearAllMocks()
  mocks.getPersonById.mockResolvedValue({ id: '1234', name: 'TEST PERSON' })
  mocks.getRetirementNoticeKintoneValues.mockResolvedValue({
    retirementNoticeType: '自己都合退職',
  })
  mocks.applyRetirementNoticeKintoneValues.mockReturnValue({ id: '1234', name: 'TEST PERSON' })
  mocks.generateRetirementNoticePdf.mockResolvedValue({
    data: new Uint8Array(Buffer.from('%PDF-test')),
    contentType: 'application/pdf',
    fileName: 'retirement-notice.pdf',
    renderedFieldCount: 10,
  })
})

describe('retirement notice PDF route', () => {
  test('generates only the template selected by the app92 retirement notice type', async () => {
    const response = await GET(
      new Request(`https://example.com/api/retirement-notice/templates/${SELF_INITIATED_REPORT_CODE}?personId=1234`),
      { params: { reportCode: SELF_INITIATED_REPORT_CODE } }
    )

    expect(response.status).toBe(200)
    expect(response.headers.get('content-type')).toBe('application/pdf')
    expect(mocks.generateRetirementNoticePdf).toHaveBeenCalledWith(
      expect.objectContaining({
        template: expect.objectContaining({ label: '自己都合退職' }),
      })
    )
  })

  test('rejects a direct URL for a different template', async () => {
    const response = await GET(
      new Request(`https://example.com/api/retirement-notice/templates/${PENSION_RETURN_REPORT_CODE}?personId=1234`),
      { params: { reportCode: PENSION_RETURN_REPORT_CODE } }
    )

    expect(response.status).toBe(409)
    expect(await response.json()).toEqual({
      error: '選択された退職届種類と出力する様式が一致しません',
    })
    expect(mocks.generateRetirementNoticePdf).not.toHaveBeenCalled()
  })

  test('does not generate a PDF when the app92 retirement notice type is missing', async () => {
    mocks.getRetirementNoticeKintoneValues.mockResolvedValue({})

    const response = await GET(
      new Request(`https://example.com/api/retirement-notice/templates/${SELF_INITIATED_REPORT_CODE}?personId=1234`),
      { params: { reportCode: SELF_INITIATED_REPORT_CODE } }
    )

    expect(response.status).toBe(422)
    expect(mocks.generateRetirementNoticePdf).not.toHaveBeenCalled()
  })
})
