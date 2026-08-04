// 提出Excel → kintone 転記の共通型。
// アプリ別モジュール（mappings/app34, mappings/app55）はこの型を使ってマッピングを宣言する。

/**
 * (シート名, セル参照) を受け取り、正規化済みの生値を返す関数。
 * app55 は複数シート（1-4/1-6/1-6別紙/居住費の詳細/【介護分野】事業所概要1）を跨ぐため、
 * シート名を第1引数に取る。存在しないシートは null を返す実装を想定する。
 */
export type CellReader = (sheetName: string, address: string) => unknown

/**
 * 生セル値を kintone に入れる値へ変換する。
 * - TEXT: string
 * - NUMBER: number
 * - DATE: 'YYYY-MM-DD' 文字列
 * - CHECK_BOX: 選択肢文字列の配列（例: ['■'] / ['男']）
 * - RADIO_BUTTON: 選択肢文字列（例: '男'）
 * 空・未入力・非該当は null（＝そのフィールドは書かない）。
 */
export type CellTransform = (value: unknown) => string | number | string[] | null

/** kintone のスカラ値（TEXT/NUMBER/DATE=string|number、CHECK_BOX=string[]）。 */
export type KintoneCellValue = string | number | string[]

/** SUBTABLE の1行（`{ value: { subCode: { value } } }`）。 */
export interface KintoneSubtableRow {
  value: Record<string, { value: string | number }>
}

/** kintone レコードの1フィールド値（スカラ or SUBTABLE 行配列）。 */
export interface KintoneFieldValue {
  value: KintoneCellValue | KintoneSubtableRow[]
}

/** kintone レコード payload（`{ fieldCode: { value } }`）。空フィールドはキー自体を含めない。 */
export type KintoneRecordPayload = Record<string, KintoneFieldValue>

/** マッピング行が対象とする kintone フィールドの種別（マージ挙動の決定に使う）。 */
export type KintoneFieldKind = 'TEXT' | 'NUMBER' | 'DATE' | 'CHECK_BOX' | 'RADIO_BUTTON'

/** 1セル → 1フィールドのマッピング。 */
export interface FieldMapping {
  /** 読み取り対象のシート名（例: '1-4'）。 */
  sheetName: string
  /** Excel のセル参照（例: 'E14'）。 */
  cell: string
  /** kintone のフィールドコード（例: '法人番号_13桁_'）。 */
  code: string
  /** フィールド種別。CHECK_BOX は複数行から OR 合成、それ以外は先勝ち（非null優先）。 */
  kind: KintoneFieldKind
  /** セル値の変換関数。 */
  transform: CellTransform
}

/** SUBTABLE 内の1列（サブフィールド）のマッピング。 */
export type SubtableColumnKind = 'TEXT' | 'NUMBER'

export interface SubtableColumn {
  /** SUBTABLE 内のサブフィールドコード（例: '手当名'）。 */
  subCode: string
  /** Excel の列（例: 'D'）。行番号は rowStart..rowEnd を下方向に展開して補う。 */
  col: string
  /** サブフィールド種別。 */
  kind: SubtableColumnKind
  /** セル値の変換関数。 */
  transform: CellTransform
}

/** SUBTABLE フィールドのマッピング（Excel の行範囲を下方向に展開）。 */
export interface SubtableMapping {
  /** SUBTABLE フィールドコード（例: '手当詳細'）。 */
  code: string
  /** 読み取り対象のシート名（例: '1-6別紙'）。 */
  sheetName: string
  /** 展開する先頭行（含む）。 */
  rowStart: number
  /** 展開する末尾行（含む）。 */
  rowEnd: number
  /** この列が空の行はスキップする（明細の主キー相当。例: 手当名の列 'D'）。 */
  keyCol: string
  /** サブフィールド一覧。 */
  columns: SubtableColumn[]
}

/** 1アプリ分のマッピング定義（複数シート＋SUBTABLE を含む）。 */
export interface AppMapping {
  /** 転記先の kintone アプリID（例: '34'）。 */
  appId: string
  /** upsert の照合キーに使うフィールドコード（app34 のみ。app55 は未定のため省略）。 */
  keyCode?: string
  /** app34 の必須シート（欠落時はエラーにする）。 */
  requiredSheet?: string
  /** セル → フィールドの一覧。 */
  fields: FieldMapping[]
  /** SUBTABLE フィールドの一覧（任意）。 */
  subtables?: SubtableMapping[]
}
