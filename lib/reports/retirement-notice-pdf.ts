import { readFile } from 'node:fs/promises'
import path from 'node:path'

import fontkit from '@/lib/vendor/fontkit.umd.min.js'
import { PDFDocument, rgb } from '@/lib/vendor/pdf-lib.min.js'
import type { Person } from '@/lib/models'

import type { RetirementNoticeReportTemplate } from './retirement-notice-reports'
import { RETIREMENT_NOTICE_PLACEMENTS, type RetirementNoticePlacement } from './retirement-notice-placements'

const PDF_CONTENT_TYPE = 'application/pdf'
const TEMPLATE_COORDINATE_WIDTH = 794
const TEMPLATE_COORDINATE_HEIGHT = 1123
const FONT_PATH = path.join(process.cwd(), 'public', 'fonts', 'NotoSansJP-Regular.otf')

export async function generateRetirementNoticePdf({
  template,
  person,
  extraValues = {},
}: {
  template: RetirementNoticeReportTemplate
  person: Person
  extraValues?: Record<string, string | undefined>
}): Promise<{ fileName: string; data: Uint8Array; contentType: string; renderedFieldCount: number }> {
  const placements = (RETIREMENT_NOTICE_PLACEMENTS as Record<string, readonly RetirementNoticePlacement[]>)[template.reportCode] ?? []
  if (placements.length === 0) {
    throw new Error(`PDF placements were not found for retirement notice template ${template.reportCode}`)
  }

  const [sourcePdfBytes, fontBytes] = await Promise.all([
    readFile(path.join(process.cwd(), 'public', template.template.pdfPath.replace(/^\//, ''))),
    readFile(FONT_PATH),
  ])

  const pdf = await PDFDocument.create()
  pdf.registerFontkit(fontkit)
  const font = await pdf.embedFont(fontBytes, { subset: true })
  const sourcePdf = await PDFDocument.load(sourcePdfBytes)
  const sourcePageIndices = sourcePdf.getPageIndices()
  const embeddedPages = await pdf.embedPdf(sourcePdfBytes, sourcePageIndices)
  const outputPages = embeddedPages.map((embeddedPage: any) => {
    const page = pdf.addPage([embeddedPage.width, embeddedPage.height])
    page.drawPage(embeddedPage, {
      x: 0,
      y: 0,
      width: embeddedPage.width,
      height: embeddedPage.height,
    })
    return page
  })

  const values = { ...buildRetirementNoticeValueMap(person), ...extraValues }
  let renderedFieldCount = 0

  for (const placement of placements) {
    const page = outputPages[placement.page]
    if (!page) continue

    const rawValue = values[placement.fieldCode]
    const value = formatPlacementValue(rawValue, placement)
    if (!value) continue

    renderText({ page, placement, value, font })
    renderedFieldCount += 1
  }

  return {
    fileName: buildRetirementNoticePdfFilename(template, person),
    data: await pdf.save(),
    contentType: PDF_CONTENT_TYPE,
    renderedFieldCount,
  }
}

export function buildRetirementNoticePdfFilename(
  template: RetirementNoticeReportTemplate,
  person: Pick<Person, 'name'>
): string {
  return `退職届出_${sanitizeFilenamePart(template.label)}_${sanitizeFilenamePart(person.name || '対象者')}.pdf`
}

export function buildRetirementNoticeValueMap(person: Person): Record<string, string | undefined> {
  const createdDate = formatJstDate(new Date())
  return {
    人材名: person.name,
    呼び名: person.kana,
    生年月日: person.dob,
    性別: person.sex,
    国籍: person.nationality,
    在留カード番号: person.residenceCardNo,
    分野: person.specificSkillField,
    業務区分: person.businessCategory,
    退職日___支援終了日: person.employmentContractEndDate || person.retirementDate || person.supportEndDate,
    再雇用_支援開始日: person.employmentContractDate || person.joiningDate,
    人材_電話番号: person.phone,
    法人名: person.company || person.tenantName,
    所属機関_住所: person.companyAddress,
    所属機関_郵便番号: person.companyPostalCode,
    所属機関_法人番号: person.companyCorporateNumber,
    担当者_所属先電話番号: person.companyPhone,
    担当者の事業所名: person.company || person.tenantName,
    担当者の事業所名_0: person.company || person.tenantName,
    作成日: createdDate,
  }
}

function renderText({
  page,
  placement,
  value,
  font,
}: {
  page: any
  placement: RetirementNoticePlacement
  value: string
  font: any
}) {
  const { width: pageWidth, height: pageHeight } = page.getSize()
  const scaleX = pageWidth / TEMPLATE_COORDINATE_WIDTH
  const scaleY = pageHeight / TEMPLATE_COORDINATE_HEIGHT
  const boxWidth = Math.max(placement.width * scaleX, 1)
  const boxHeight = Math.max(placement.height * scaleY, 1)
  const x = placement.x * scaleX
  const y = pageHeight - placement.y * scaleY - boxHeight
  const fontSize = Math.max((placement.style?.fontSize ?? 12) * scaleY, 6)
  const padding = 1.5 * Math.min(scaleX, scaleY)
  const usableWidth = Math.max(boxWidth - padding * 2, 1)
  const lines = buildLines(value, Boolean(placement.style?.textWrap), usableWidth, fontSize, font)
  const lineHeight = fontSize * 1.12
  const visibleLines = lines.slice(0, Math.max(Math.floor((boxHeight - padding * 2) / lineHeight), 1))
  const textBlockHeight = visibleLines.length * lineHeight
  const firstBaseline = y + Math.max((boxHeight - textBlockHeight) / 2, 0) + textBlockHeight - fontSize * 0.86

  visibleLines.forEach((line, index) => {
    const textWidth = font.widthOfTextAtSize(line, fontSize)
    page.drawText(line, {
      x: resolveAlignedX(placement.style?.textAlign, x + padding, usableWidth, textWidth),
      y: firstBaseline - index * lineHeight,
      size: fontSize,
      font,
      color: rgb(0, 0, 0),
    })
  })
}

function buildLines(value: string, textWrap: boolean, maxWidth: number, fontSize: number, font: any): string[] {
  const explicitLines = value.split(/\r?\n/)
  if (!textWrap) return explicitLines
  return explicitLines.flatMap((line) => wrapLine(line, maxWidth, fontSize, font))
}

function wrapLine(line: string, maxWidth: number, fontSize: number, font: any): string[] {
  if (!line || font.widthOfTextAtSize(line, fontSize) <= maxWidth) return [line]

  const wrapped: string[] = []
  let current = ''
  for (const char of Array.from(line)) {
    const next = current + char
    if (current && font.widthOfTextAtSize(next, fontSize) > maxWidth) {
      wrapped.push(current)
      current = char
    } else {
      current = next
    }
  }
  if (current) wrapped.push(current)
  return wrapped
}

function resolveAlignedX(
  textAlign: 'left' | 'center' | 'right' | undefined,
  left: number,
  width: number,
  textWidth: number
): number {
  if (textAlign === 'right') return left + Math.max(width - textWidth, 0)
  if (textAlign === 'center') return left + Math.max((width - textWidth) / 2, 0)
  return left
}

function formatPlacementValue(value: string | undefined, placement: RetirementNoticePlacement): string {
  if (!value) return ''
  if (isCheckboxPlacement(placement)) {
    return value === '✓' || value === placement.fieldCode ? '✓' : ''
  }
  if (placement.dateFormat) {
    return formatDateValue(value)
  }
  return value
}

function isCheckboxPlacement(placement: RetirementNoticePlacement): boolean {
  return placement.width <= 25 && placement.height <= 25 && placement.style?.textAlign === 'center'
}

function formatDateValue(value: string): string {
  const match = value.trim().match(/^(\d{4})[-/](\d{1,2})[-/](\d{1,2})(?:T.*)?$/)
  if (!match) return value
  return `${Number(match[1])}年${Number(match[2])}月${Number(match[3])}日`
}

function formatJstDate(date: Date): string {
  const jst = new Date(date.getTime() + 9 * 60 * 60 * 1000)
  return `${jst.getUTCFullYear()}年${jst.getUTCMonth() + 1}月${jst.getUTCDate()}日`
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
