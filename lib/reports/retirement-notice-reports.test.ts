import { describe, expect, test } from 'vitest'

import { PDFDocument } from '@/lib/vendor/pdf-lib.min.js'

import {
  APP92_RETIREMENT_NOTICE_SOURCE_APP_ID,
  canCreateRetirementNotice,
  getRetirementNoticeReportTemplateForType,
  getRetirementNoticeReportTemplate,
  getRetirementNoticeReportTemplates,
} from './retirement-notice-reports'
import {
  buildRetirementNoticePdfFilename,
  buildRetirementNoticeValueMap,
  fitRetirementNoticeSingleLineFontSize,
  formatRetirementNoticePlacementValue,
  generateRetirementNoticePdf,
} from './retirement-notice-pdf'

describe('retirement notice report templates', () => {
  test('renders selected checkbox values as the filled square used by kintone PDFs', () => {
    const placement = {
      fieldCode: '連絡可能',
      page: 0,
      x: 0,
      y: 0,
      width: 20,
      height: 20,
      style: { textAlign: 'center' as const },
    }

    expect(formatRetirementNoticePlacementValue('✓', placement)).toBe('■')
    expect(formatRetirementNoticePlacementValue('連絡可能', placement)).toBe('■')
    expect(formatRetirementNoticePlacementValue('連絡不可能', placement)).toBe('')
  })

  test('shrinks a long single-line value to stay within its placement', () => {
    const font = {
      widthOfTextAtSize: (value: string, fontSize: number) => value.length * fontSize,
    }

    expect(fitRetirementNoticeSingleLineFontSize('1234567890', false, 100, 20, font)).toBe(10)
    expect(fitRetirementNoticeSingleLineFontSize('1234567890', true, 100, 20, font)).toBe(20)
  })

  test('allows creating retirement notices for retired and support-ended people', () => {
    expect(canCreateRetirementNotice('退職')).toBe(true)
    expect(canCreateRetirementNotice('支援終了')).toBe(true)
    expect(canCreateRetirementNotice('在籍中')).toBe(false)
    expect(canCreateRetirementNotice()).toBe(false)
  })

  test('exposes the published app92 retirement notice templates in display order', () => {
    const templates = getRetirementNoticeReportTemplates()

    expect(templates).toHaveLength(6)
    expect(templates.map((template) => template.label)).toEqual([
      '1号期間満了',
      'イレギュラー退職',
      '自己都合退職',
      '年金脱退一時金（帰国時）',
      '年金脱退一時金（再入国時）',
      '法人内資格切り替え',
    ])
    expect(templates.every((template) => template.sourceAppId === APP92_RETIREMENT_NOTICE_SOURCE_APP_ID)).toBe(true)
    expect(templates.every((template) => template.template.extension === 'pdf')).toBe(true)
  })

  test('looks up a template and keeps the PDF asset metadata needed by the renderer', () => {
    const template = getRetirementNoticeReportTemplate('tkyy4pd6kel6ndjb4ei9mstc2gsq372e')

    expect(template).toMatchObject({
      reportCode: 'tkyy4pd6kel6ndjb4ei9mstc2gsq372e',
      label: 'イレギュラー退職',
      template: {
        assetId: 'fe114c5ecbe0b0b432b90d1577b42539',
        format: 'a4-portrait',
        extension: 'pdf',
        pdfPath: '/retirement-notice-templates/イレギュラー退職.pdf',
      },
    })
    expect(template?.fields).toContain('人材名')
    expect(template?.fields).toContain('在留カード番号')
  })

  test.each([
    ['1号期間満了', 'kvedmwv3etcstujkyxlwr2dxdwd4b1td'],
    ['イレギュラー退職', 'tkyy4pd6kel6ndjb4ei9mstc2gsq372e'],
    ['自己都合退職', 'vy0fa9sokdkdu9xnrp9kvqs2nwgaqoz7'],
    ['年金脱退一時金（帰国時）', 'k4bvypb19xho5ystj8a2rstrupmnk5kh'],
    ['年金脱退一時金（再入国時）', 'e0y1yblxe7pp8oamvwk0e7mw5n8feo0k'],
    ['法人内資格切り替え', 'dsggkmicvux18aaq4damigubfx05gdq4'],
  ])('resolves the app92 retirement notice type %s to its template', (noticeType, reportCode) => {
    expect(getRetirementNoticeReportTemplateForType(noticeType)?.reportCode).toBe(reportCode)
  })

  test('does not choose a template when the app92 retirement notice type is missing or unsupported', () => {
    expect(getRetirementNoticeReportTemplateForType()).toBeNull()
    expect(getRetirementNoticeReportTemplateForType('')).toBeNull()
    expect(getRetirementNoticeReportTemplateForType('未対応の種類')).toBeNull()
  })

  test('builds a safe PDF filename from person and template labels', () => {
    const template = getRetirementNoticeReportTemplate('vy0fa9sokdkdu9xnrp9kvqs2nwgaqoz7')

    expect(buildRetirementNoticePdfFilename(template!, { name: '山田/太郎' })).toBe(
      '退職届出_自己都合退職_山田-太郎.pdf'
    )
  })

  test('maps FunBase person values to retirement notice field values', () => {
    const values = buildRetirementNoticeValueMap({
      id: 'person-1',
      name: 'NGU WAR KYAW',
      kana: 'ング ワー チョー',
      nationality: 'ミャンマー',
      dob: '1995-01-02',
      sex: '男',
      specificSkillField: '介護',
      businessCategory: '介護業務全般',
      residenceCardNo: 'AB12345678CD',
      retirementDate: '2026-07-27',
      employmentContractEndDate: '2026-07-28',
      employmentContractDate: '2026-08-01',
      phone: '090-1234-5678',
      workingStatus: '退職',
      company: '株式会社Funtoco',
      companyPostalCode: '556-0004',
      companyAddress: '大阪府大阪市浪速区日本橋西2-5-6',
      companyCorporateNumber: '5120001198866',
      companyPhone: '06-0000-0000',
      employmentChangeNotificationDate: '2026-07-28',
      createdAt: '2026-01-01',
      updatedAt: '2026-07-01',
    })

    expect(values).toMatchObject({
      人材名: 'NGU WAR KYAW',
      呼び名: 'ング ワー チョー',
      国籍: 'ミャンマー',
      在留カード番号: 'AB12345678CD',
      分野: '介護',
      業務区分: '介護業務全般',
      性別: '男',
      退職日___支援終了日: '2026-07-28',
      再雇用_支援開始日: '2026-08-01',
      所属機関_法人番号: '5120001198866',
      担当者_所属先電話番号: '06-0000-0000',
      人材_電話番号: '090-1234-5678',
      法人名: '株式会社Funtoco',
    })
    expect(values).not.toHaveProperty('担当者の事業所名')
    expect(values).not.toHaveProperty('担当者の事業所名_0')
  })

  test('generates a filled PDF from every bundled source template', async () => {
    const person = {
      id: 'person-1',
      name: 'NGU WAR KYAW',
      kana: 'ング ワー チョー',
      nationality: 'ミャンマー',
      dob: '1995-01-02',
      sex: '男',
      specificSkillField: '介護',
      businessCategory: '介護業務全般',
      residenceCardNo: 'AB12345678CD',
      retirementDate: '2026-07-28',
      employmentContractDate: '2026-08-01',
      workingStatus: '退職',
      company: '株式会社Funtoco',
      companyPostalCode: '556-0004',
      companyAddress: '大阪府大阪市浪速区日本橋西2-5-6',
      companyCorporateNumber: '5120001198866',
      companyPhone: '06-0000-0000',
      employmentChangeNotificationDate: '2026-07-28',
      createdAt: '2026-01-01',
      updatedAt: '2026-07-01',
    }

    for (const template of getRetirementNoticeReportTemplates()) {
      const pdf = await generateRetirementNoticePdf({ template, person })

      expect(pdf.contentType).toBe('application/pdf')
      expect(pdf.fileName).toBe(`退職届出_${template.label}_NGU WAR KYAW.pdf`)
      expect(pdf.renderedFieldCount).toBeGreaterThan(5)
      expect(Buffer.from(pdf.data.subarray(0, 5)).toString('utf8')).toBe('%PDF-')

      if (template.label === 'イレギュラー退職') {
        const document = await PDFDocument.load(pdf.data)
        expect(document.getPageCount()).toBe(6)
      }
    }
  }, 30_000)

  test('exposes an actual bundled PDF path for each published template', () => {
    expect(getRetirementNoticeReportTemplates().map((template) => template.template.pdfPath)).toEqual([
      '/retirement-notice-templates/1号期間満了.pdf',
      '/retirement-notice-templates/イレギュラー退職.pdf',
      '/retirement-notice-templates/自己都合退職.pdf',
      '/retirement-notice-templates/年金脱退一時金（帰国時）.pdf',
      '/retirement-notice-templates/年金脱退一時金（再入国時）.pdf',
      '/retirement-notice-templates/法人内資格切り替え.pdf',
    ])
  })
})
