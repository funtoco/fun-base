// 提出Excel → kintone 転記の共通型。
// シート別モジュール（mappings/*）はこの型を使ってマッピングを宣言する。

/** セル参照（例: 'E14'）を受け取り、正規化済みの生値を返す関数。 */
export type CellReader = (address: string) => unknown

/** 生セル値を kintone に入れる値へ変換する（空・未入力は null を返す）。 */
export type CellTransform = (value: unknown) => string | number | null

/** kintone レコードの1フィールド値（`{ value: ... }` 形式）。 */
export interface KintoneFieldValue {
  value: string | number
}

/** kintone レコード payload（`{ fieldCode: { value } }`）。空フィールドはキー自体を含めない。 */
export type KintoneRecordPayload = Record<string, KintoneFieldValue>

/** 1セル → 1フィールドのマッピング。 */
export interface FieldMapping {
  /** Excel のセル参照（例: 'E14'）。 */
  cell: string
  /** kintone のフィールドコード（例: '法人番号_13桁_'）。 */
  code: string
  /** セル値の変換関数。 */
  transform: CellTransform
}

/** 1シート → 1アプリのマッピング定義。 */
export interface SheetMapping {
  /** 読み取り対象のシート名（例: 'はじめに'）。 */
  sheetName: string
  /** 転記先の kintone アプリID（例: '34'）。 */
  appId: string
  /** upsert の照合キーに使うフィールドコード（fields にも含まれていること）。 */
  keyCode: string
  /** セル → フィールドの一覧。 */
  fields: FieldMapping[]
}
