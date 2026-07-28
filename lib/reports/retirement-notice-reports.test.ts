import { describe, expect, test } from 'vitest'

import {
  APP92_RETIREMENT_NOTICE_SOURCE_APP_ID,
  buildRetirementNoticeMetadataFilename,
  getRetirementNoticeReportTemplate,
  getRetirementNoticeReportTemplates,
} from './retirement-notice-reports'

describe('retirement notice report templates', () => {
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

  test('looks up a template and keeps the PDF asset metadata needed by a later renderer', () => {
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

  test('builds a safe metadata download filename from person and template labels', () => {
    const template = getRetirementNoticeReportTemplate('vy0fa9sokdkdu9xnrp9kvqs2nwgaqoz7')

    expect(buildRetirementNoticeMetadataFilename(template!, { name: '山田/太郎' })).toBe(
      '退職届出_自己都合退職_山田-太郎.json'
    )
  })

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
