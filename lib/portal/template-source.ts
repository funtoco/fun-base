import { readFile } from 'node:fs/promises'
import path from 'node:path'
import ExcelJS from 'exceljs'
import { buildDriveFileName } from './drive/folder'
import { fillOfficeNames, type FillOfficeNamesResult } from './workbook-template'
import type { CaseDetail } from './types'

// 同梱テンプレ（空の申請書類作成フォーム）を読み、案件の事業所名を差し込んで返す。
// public/ ではなくサーバ専用ディレクトリに置いているため、URL 直叩きでは取得できない。
// 本番でファイルが同梱されるよう next.config.mjs の outputFileTracingIncludes に登録済み。

const TEMPLATE_RELATIVE_PATH = 'lib/portal/templates/application-workbook.xlsx'

/** ダウンロード時の書類名（ファイル名生成に使う）。 */
export const APPLICATION_WORKBOOK_DOCUMENT_NAME = '申請書類作成フォーム'

export interface GeneratedWorkbook {
  buffer: Buffer
  fileName: string
  /** 記入欄に収まらなかった事業所名（呼び出し側で利用者に伝える）。 */
  overflow: string[]
}

/** 同梱テンプレを読み込む（毎回ディスクから読む。ExcelJS の Workbook は使い回すと汚染されるため）。 */
async function loadTemplateWorkbook(): Promise<ExcelJS.Workbook> {
  const filePath = path.join(process.cwd(), TEMPLATE_RELATIVE_PATH)
  const buffer = await readFile(filePath)
  const workbook = new ExcelJS.Workbook()
  await workbook.xlsx.load(buffer)
  return workbook
}

/**
 * 案件の事業所名を差し込んだ申請書類作成フォームを生成する。
 * 事業所が0件の案件でも、空欄のままのテンプレを返す（企業が手で埋められる）。
 */
export async function generateApplicationWorkbook(
  detail: CaseDetail,
  now: Date = new Date()
): Promise<GeneratedWorkbook> {
  const workbook = await loadTemplateWorkbook()
  const officeNames = detail.offices.map((office) => office.name ?? '')
  const result: FillOfficeNamesResult = fillOfficeNames(workbook, officeNames)

  const arrayBuffer = await workbook.xlsx.writeBuffer()
  const fileName = buildDriveFileName({
    caseTitle: detail.title ?? detail.offices[0]?.name ?? null,
    documentName: APPLICATION_WORKBOOK_DOCUMENT_NAME,
    originalFileName: 'application-workbook.xlsx',
    date: now,
  })

  return { buffer: Buffer.from(arrayBuffer), fileName, overflow: result.overflow }
}
