import { asNumber, asText } from '../transforms'
import type { SheetMapping } from '../types'

/**
 * `はじめに` シート → kintone app34（マスタ_法人）のマッピング。
 *
 * マッピング根拠: docs/specs/2026-07-24-visa-excel-kintone-mapping-v2-visible-sheets.md（app34セクション）。
 * kintone フィールドコードは <scratchpad>/kintone_app_34_fields.json で実在確認済み。
 *
 * | Excelセル | kintoneコード              | 意味          | 変換     |
 * |-----------|---------------------------|---------------|----------|
 * | E14       | 法人番号_13桁_            | 法人番号(13桁) | asText   |
 * | E15       | 数値_1                    | 資本金        | asNumber |
 * | E18       | 年間売上金額_直近年度_    | 年間売上金額  | asNumber |
 * | E19       | 数値_0                    | 常勤職員数    | asNumber |
 *
 * upsert キー: 法人番号_13桁_（先頭0保持のため文字列で照合）。
 */
export const HAJIMENI_APP34: SheetMapping = {
  sheetName: 'はじめに',
  appId: '34',
  keyCode: '法人番号_13桁_',
  fields: [
    { cell: 'E14', code: '法人番号_13桁_', transform: asText },
    { cell: 'E15', code: '数値_1', transform: asNumber },
    { cell: 'E18', code: '年間売上金額_直近年度_', transform: asNumber },
    { cell: 'E19', code: '数値_0', transform: asNumber },
  ],
}
