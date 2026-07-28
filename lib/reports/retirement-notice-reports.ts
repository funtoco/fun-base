export const APP92_RETIREMENT_NOTICE_SOURCE_APP_ID = '92'

export type RetirementNoticeReportTemplate = {
  reportCode: string
  label: string
  reportName: string
  sourceAppId: typeof APP92_RETIREMENT_NOTICE_SOURCE_APP_ID
  publishedAt: string
  updatedAt: string
  template: {
    assetId: string
    extension: 'pdf'
    format: 'a4-portrait'
    pageKey: string
    filenameTemplate: string
    pdfPath: string
  }
  fields: string[]
  limitations: string[]
}

export type RetirementNoticePerson = {
  name?: string | null
}

const COMMON_FIELDS = [
  '人材名',
  '性別',
  '生年月日',
  '国籍',
  '在留カード番号',
  '分野',
  '業務区分',
  '退職日___支援終了日',
  '所属機関_法人番号',
  '法人名',
  '所属機関_郵便番号',
  '所属機関_住所',
  '担当者_所属先電話番号',
  '作成日',
  '担当者の事業所名',
]

const METADATA_LIMITATIONS = [
  'This slice exposes existing app92 PDF template metadata only.',
  'Filled PDF rendering requires a later renderer/storage integration.',
]

const RETIREMENT_NOTICE_REPORT_TEMPLATES: RetirementNoticeReportTemplate[] = [
  {
    reportCode: 'kvedmwv3etcstujkyxlwr2dxdwd4b1td',
    label: '1号期間満了',
    reportName: '1号期間満了',
    sourceAppId: APP92_RETIREMENT_NOTICE_SOURCE_APP_ID,
    publishedAt: '2026-05-18T01:14:12.840Z',
    updatedAt: '2026-05-18T01:14:12.840Z',
    template: {
      assetId: '609f0bc57205ca9f9ac25e254c952d0a',
      extension: 'pdf',
      format: 'a4-portrait',
      pageKey: '0',
      filenameTemplate: '［1号期間満了届出(3-1-2号)］{人材名} / {呼び名}',
      pdfPath: '/retirement-notice-templates/1号期間満了.pdf',
    },
    fields: COMMON_FIELDS,
    limitations: METADATA_LIMITATIONS,
  },
  {
    reportCode: 'tkyy4pd6kel6ndjb4ei9mstc2gsq372e',
    label: 'イレギュラー退職',
    reportName: 'イレギュラー退職',
    sourceAppId: APP92_RETIREMENT_NOTICE_SOURCE_APP_ID,
    publishedAt: '2026-05-18T01:14:12.840Z',
    updatedAt: '2026-05-18T01:14:12.840Z',
    template: {
      assetId: 'fe114c5ecbe0b0b432b90d1577b42539',
      extension: 'pdf',
      format: 'a4-portrait',
      pageKey: '0',
      filenameTemplate: '［雇用終了届出(3-1-2/3-4/5-11号)］{人材名} / {呼び名}',
      pdfPath: '/retirement-notice-templates/イレギュラー退職.pdf',
    },
    fields: [
      ...COMMON_FIELDS,
      '_02_経営上の都合',
      '_03_基準不適合',
      '_04_死亡_個人事業主_',
      '_05_その他',
      '会社都合',
      '外国人都合',
      '_06_死亡',
      '_07_病気・怪我',
      '_08_行方不明',
      '_09_重責解雇',
      '_11_その他',
      'その他選択時_外国人都合',
      '事由発生日_所属機関都合',
      '事案の概要_所属機関都合',
      'その他選択時_所属機関都合',
      '事由発生日_外国人都合',
      '退職_支援終了の内容',
      '連絡可能',
      '連絡不可能',
      '活動継続の意思なし_転職希望_',
      '活動継続の意思なし_帰国希望_',
      '雇用契約解除予定',
      '活動継続の意思_その他',
      '活動継続の意思_その他選択時',
      '雇用契約継続予定',
      '転職支援実施予定',
      '帰国支援実施予定',
      '所属機関都合の場合の具体的な事情',
      '外国人都合の場合の具体的な事情',
      '特定技能外国人から退職に係る相談の有無_相談があった場合はそれに対する対応',
      '退職後に特定技能外国人が転職する予定がある場合は転職先_転職予定年月日',
      '特定技能外国人に転職支援を実施する場合は支援の内容',
      '退職後に特定技能外国人が帰国を希望している場合はその理由',
      '特定技能外国人に帰国支援を実施する場合は帰国予定年月日_航空券の手配状況',
      '退職後に特定技能外国人が転居する予定がある場合は転居先',
      '人材_電話番号',
    ],
    limitations: METADATA_LIMITATIONS,
  },
  {
    reportCode: 'vy0fa9sokdkdu9xnrp9kvqs2nwgaqoz7',
    label: '自己都合退職',
    reportName: '自己都合退職',
    sourceAppId: APP92_RETIREMENT_NOTICE_SOURCE_APP_ID,
    publishedAt: '2026-05-18T01:14:12.840Z',
    updatedAt: '2026-05-18T01:14:12.840Z',
    template: {
      assetId: '0b3a3c5e775ea6ed7b8a35683fa6c58f',
      extension: 'pdf',
      format: 'a4-portrait',
      pageKey: '0',
      filenameTemplate: '［雇用終了届出(3-1-2号)］{人材名} / {呼び名}',
      pdfPath: '/retirement-notice-templates/自己都合退職.pdf',
    },
    fields: COMMON_FIELDS,
    limitations: METADATA_LIMITATIONS,
  },
  {
    reportCode: 'k4bvypb19xho5ystj8a2rstrupmnk5kh',
    label: '年金脱退一時金（帰国時）',
    reportName: '年金脱退一時金（帰国時）',
    sourceAppId: APP92_RETIREMENT_NOTICE_SOURCE_APP_ID,
    publishedAt: '2026-05-18T01:14:12.840Z',
    updatedAt: '2026-05-18T01:14:12.840Z',
    template: {
      assetId: 'a28a67f5c8a6d8bd3605f48c6d16314b',
      extension: 'pdf',
      format: 'a4-portrait',
      pageKey: '0',
      filenameTemplate: '［雇用終了届出(3-1-2号)］{人材名} / {呼び名}',
      pdfPath: '/retirement-notice-templates/年金脱退一時金（帰国時）.pdf',
    },
    fields: COMMON_FIELDS,
    limitations: METADATA_LIMITATIONS,
  },
  {
    reportCode: 'e0y1yblxe7pp8oamvwk0e7mw5n8feo0k',
    label: '年金脱退一時金（再入国時）',
    reportName: '年金脱退一時金（再入国時）',
    sourceAppId: APP92_RETIREMENT_NOTICE_SOURCE_APP_ID,
    publishedAt: '2026-05-18T01:14:12.840Z',
    updatedAt: '2026-05-18T01:14:12.840Z',
    template: {
      assetId: 'f73db796036bb6bfff086a4c6306c164',
      extension: 'pdf',
      format: 'a4-portrait',
      pageKey: '0',
      filenameTemplate: '［雇用開始届出(3-1-2号)］{人材名} / {呼び名}',
      pdfPath: '/retirement-notice-templates/年金脱退一時金（再入国時）.pdf',
    },
    fields: [
      ...COMMON_FIELDS.filter((field) => field !== '退職日___支援終了日'),
      '再雇用_支援開始日',
    ],
    limitations: METADATA_LIMITATIONS,
  },
  {
    reportCode: 'dsggkmicvux18aaq4damigubfx05gdq4',
    label: '法人内資格切り替え',
    reportName: '法人内資格切り替え',
    sourceAppId: APP92_RETIREMENT_NOTICE_SOURCE_APP_ID,
    publishedAt: '2026-05-18T01:14:12.840Z',
    updatedAt: '2026-05-18T01:14:12.840Z',
    template: {
      assetId: 'e69ddce666c261bff30566b74fd025fe',
      extension: 'pdf',
      format: 'a4-portrait',
      pageKey: '0',
      filenameTemplate: '［雇用終了届出(3-1-2］{人材名} / {呼び名}',
      pdfPath: '/retirement-notice-templates/法人内資格切り替え.pdf',
    },
    fields: [
      ...COMMON_FIELDS.filter((field) => field !== '担当者の事業所名'),
      '退職_支援終了の内容',
      '担当者の事業所名_0',
    ],
    limitations: METADATA_LIMITATIONS,
  },
]

export function getRetirementNoticeReportTemplates(): RetirementNoticeReportTemplate[] {
  return RETIREMENT_NOTICE_REPORT_TEMPLATES.map((template) => ({
    ...template,
    fields: [...template.fields],
    limitations: [...template.limitations],
  }))
}

export function getRetirementNoticeReportTemplate(reportCode: string): RetirementNoticeReportTemplate | null {
  return getRetirementNoticeReportTemplates().find((template) => template.reportCode === reportCode) ?? null
}

export function buildRetirementNoticeMetadataFilename(
  template: RetirementNoticeReportTemplate,
  person: RetirementNoticePerson
): string {
  const personName = sanitizeFilenamePart(person.name || '対象者')
  return `退職届出_${sanitizeFilenamePart(template.label)}_${personName}.json`
}

function sanitizeFilenamePart(value: string): string {
  const sanitized = value
    .normalize('NFC')
    .replace(/[\\/]/g, '-')
    .replace(/[\u0000-\u001F\u007F]/g, '')
    .replace(/[?#:*"<>|]/g, '')
    .replace(/\s+/g, ' ')
    .trim()

  return sanitized || '未設定'
}
