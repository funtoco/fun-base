import ExcelJS from 'exceljs'

// 申請書類作成フォーム（企業が記入する Excel）のテンプレを、案件の事業所名を差し込んだ状態で組み立てる。
//
// 差し込み先は「はじめに」シートの Ⅲ.(今回受入れ予定の)事業所情報。C29〜C33 が ①〜⑤ の
// 事業所名欄（いずれも C:D の結合セルで、C 列が master）。同シートの B41:C45 は
// `=C29`〜`=C33` の数式なので、C29:C33 を書けば「協力確認書提出状況」側にも自動で反映される。
//
// 記入欄が5行しかないため、6件目以降は書き込めない（呼び出し側で利用者に伝える）。

/** 事業所名を差し込むシート名。 */
export const TEMPLATE_SHEET_NAME = 'はじめに'

/** 事業所名の書き込み先セル（①〜⑤の順）。 */
export const OFFICE_NAME_CELLS = ['C29', 'C30', 'C31', 'C32', 'C33'] as const

/** テンプレに書き込める事業所の上限。 */
export const MAX_TEMPLATE_OFFICES = OFFICE_NAME_CELLS.length

export interface FillOfficeNamesResult {
  /** 実際に書き込んだ件数。 */
  written: number
  /** 記入欄に収まらず書き込めなかった事業所名。 */
  overflow: string[]
}

/**
 * 「はじめに」シートの事業所名欄に名前を順に書き込む（純粋・破壊的にワークブックを変更する）。
 *
 * 空文字・空白のみの名前は欄を1つ消費せずスキップする。上限を超えた分は書き込まず overflow に返す。
 * 未使用の欄はテンプレのまま触らない（テンプレ側の書式・空欄をそのまま活かす）。
 *
 * @throws シートが見つからない場合（テンプレの破損・差し替えミスを早期に検知する）
 */
export function fillOfficeNames(
  workbook: ExcelJS.Workbook,
  officeNames: string[]
): FillOfficeNamesResult {
  const sheet = workbook.getWorksheet(TEMPLATE_SHEET_NAME)
  if (!sheet) {
    throw new Error(
      `テンプレに「${TEMPLATE_SHEET_NAME}」シートがありません（テンプレの差し替えミスの可能性）`
    )
  }

  const names = officeNames
    .map((name) => (name ?? '').trim())
    .filter((name) => name.length > 0)

  const writable = names.slice(0, MAX_TEMPLATE_OFFICES)
  writable.forEach((name, index) => {
    sheet.getCell(OFFICE_NAME_CELLS[index]).value = name
  })

  return { written: writable.length, overflow: names.slice(MAX_TEMPLATE_OFFICES) }
}
