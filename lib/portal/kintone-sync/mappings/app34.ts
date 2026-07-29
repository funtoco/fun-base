import { asNumber, asText, checkboxOn } from '../transforms'
import type { AppMapping } from '../types'

/**
 * 提出Excel → kintone app34（マスタ_法人）のマッピング（確定版 v4）。
 *
 * 出典: docs/specs/2026-07-29-visa-excel-kintone-mapping-v4-decided.md（app34セクション・13行）。
 * kintone フィールド定義（型・選択肢）は scratchpad/kintone_app_34_fields.json で実在確認済み。
 * - 技能/実習 の CHECK_BOX 選択肢は '■'（ON → ['■']）。
 *
 * ソースシート: `はじめに`（法人基本情報）＋ `1-11-1`（離職状況・行方不明者）。
 * upsert キー: 法人番号_13桁_（先頭0保持のため文字列で照合）。
 *
 * 年間売上金額_直近年度_ は「はじめに:E18 優先、空なら 1-11-1:F20」。
 * buildRecord のスカラ先勝ちマージで実現するため、はじめに:E18 を先に列挙する。
 *
 * スコープ外（v4決定・実装しない）: 受入れ初めて/受入れ済、郵送先住所、決算状況12欄、
 * 行方不明者数、所属役員一覧。
 */
const CHECK_ON = ['■']

export const APP34_MAPPING: AppMapping = {
  appId: '34',
  keyCode: '法人番号_13桁_',
  requiredSheet: 'はじめに',
  fields: [
    // ── はじめに（法人基本情報）──────────────────────────────
    { sheetName: 'はじめに', cell: 'E14', code: '法人番号_13桁_', kind: 'TEXT', transform: asText },
    { sheetName: 'はじめに', cell: 'E15', code: '数値_1', kind: 'NUMBER', transform: asNumber },
    // 年間売上: はじめに:E18 優先（先に列挙）→ 空なら 1-11-1:F20（後述）
    { sheetName: 'はじめに', cell: 'E18', code: '年間売上金額_直近年度_', kind: 'NUMBER', transform: asNumber },
    { sheetName: 'はじめに', cell: 'E19', code: '数値_0', kind: 'NUMBER', transform: asNumber },

    // ── 1-11-1（3(1)離職状況：人数を文字列で格納）───────────
    { sheetName: '1-11-1', cell: 'K32', code: '日本人_自発的離職者', kind: 'TEXT', transform: asText },
    { sheetName: '1-11-1', cell: 'P32', code: '日本人_非自発的離職者', kind: 'TEXT', transform: asText },
    { sheetName: '1-11-1', cell: 'K33', code: '外国人_自発的離職者', kind: 'TEXT', transform: asText },
    { sheetName: '1-11-1', cell: 'P33', code: '外国人_非自発的離職者', kind: 'TEXT', transform: asText },

    // 決算状況/売上高（前年度）= 直近年度。はじめに:E18 が空のときのフォールバック。
    { sheetName: '1-11-1', cell: 'F20', code: '年間売上金額_直近年度_', kind: 'NUMBER', transform: asNumber },

    // ── 1-11-1（責めに帰すべき事由による行方不明・該当/非該当）──
    { sheetName: '1-11-1', cell: 'Q34', code: '技能_該当あり', kind: 'CHECK_BOX', transform: checkboxOn(CHECK_ON) },
    { sheetName: '1-11-1', cell: 'Q35', code: '技能_該当なし', kind: 'CHECK_BOX', transform: checkboxOn(CHECK_ON) },
    { sheetName: '1-11-1', cell: 'Q36', code: '実習_該当あり', kind: 'CHECK_BOX', transform: checkboxOn(CHECK_ON) },
    { sheetName: '1-11-1', cell: 'Q37', code: '実習_該当なし', kind: 'CHECK_BOX', transform: checkboxOn(CHECK_ON) },
  ],
}
