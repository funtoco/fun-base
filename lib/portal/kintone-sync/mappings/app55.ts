import {
  asDate,
  asNumber,
  asText,
  checkboxAlways,
  checkboxFromText,
  checkboxOn,
  constantText,
  keepIfEquals,
  radioFromText,
} from '../transforms'
import type { AppMapping } from '../types'

/**
 * 提出Excel → kintone app55（就労_ビザ書類作成_雇用条件書）のマッピング（確定版 v4）。
 *
 * 出典: docs/specs/2026-07-29-visa-excel-kintone-mapping-v4-decided.md（app55セクション・118行）。
 * kintone フィールド定義（型・選択肢）は scratchpad/kintone_app_55_fields.json で実在確認済み。
 *
 * ソースシート: 1-4 / 1-6 / 1-6別紙 / 居住費の詳細 / 【介護分野】事業所概要1 / 1-11-1別紙。
 *
 * CHECK_BOX / RADIO の選択肢文字列（kintone 実定義）:
 * - 汎用チェック（月給/日給/時間給/毎月/口座振替/各種保険 等）: '■'
 * - 性別[RADIO_BUTTON]: ['女','男'] / 比較・近い日本人_性別[CHECK_BOX]: ['女','男']
 * - 規定の有無[CHECK_BOX]: ['無','有'] / 提供する宿泊施設[CHECK_BOX]: ['自己所有物件','借上物件']
 *
 * 値仕様（v4決定・厳守）:
 * - 賃金区分: 1-4:E13(月給金額)ありで `月給`ON、1-4:K13(時間給金額)ありで `時間給`ON（金額有無から自動判定）。
 *   加えて 1-6別紙 C5/K5/T5 の明示チェックも読む（CHECK_BOX は OR 合成、金額は先勝ちで dedupe）。
 * - (b)社会保険料（1-6別紙:S22）→ `厚生年金保険料` に合計を格納（`健康保険料` は設定しない）。
 * - 締切日/支払日の「毎月」CHECK_BOX（毎月4種）は常に ON（固定）。
 * - _4_f_控除額_備考 は固定文字『水道光熱費』。
 *
 * 実装しない行（v4で「転記不要」/対象外）:
 * - CALC: 申請人_年齢, _3_支払概算額(1-6別紙:S18), _4_控除額合計(U30), 日本人等合計 等
 * - 企業入力対象外/Funtoco既定: 休業手当・健康診断関連(1-6 行106/115/116), _9_2_3_その後の頻度(T116)
 * - ミラー/再掲で不要: 特定技能所属機関名（居住費の詳細:O52）
 * - ふりがな（1-4:E76/I76）: app39運用のためフィールド追加なし
 *
 * ※ upsert キーは未定。本モジュールは payload 生成（ドライラン）専用。
 */

const CHECK_ON = ['■']
const 性別_RADIO = ['女', '男']
const 性別_CHECK = ['女', '男']
const 規定有無_CHECK = ['無', '有']
const 宿泊施設_CHECK = ['自己所有物件', '借上物件']

export const APP55_MAPPING: AppMapping = {
  appId: '55',
  // keyCode 未定（TODO: app55 の upsert キー確定後に設定）。現状はドライランのみ。
  fields: [
    // ── 居住費の詳細 ─────────────────────────────────────────
    { sheetName: '居住費の詳細', cell: 'M3', code: '_4_e_控除額', kind: 'NUMBER', transform: asNumber },
    { sheetName: '居住費の詳細', cell: 'H4', code: '提供する宿泊施設の具体的な内容', kind: 'CHECK_BOX', transform: checkboxFromText(宿泊施設_CHECK) },
    { sheetName: '居住費の詳細', cell: 'H5', code: '居住費控除_4', kind: 'TEXT', transform: asText },
    { sheetName: '居住費の詳細', cell: 'H7', code: '同居人の人数', kind: 'NUMBER', transform: asNumber },
    // J2=IF(M3=0,"無","有")。「有」のときだけマーカー文字を入れる（居住費控除_無 は存在しない）。
    { sheetName: '居住費の詳細', cell: 'J2', code: '居住費控除_有', kind: 'TEXT', transform: keepIfEquals('有') },

    // ── 1-4（雇用条件書・申請人／比較日本人／近い日本人）──────
    { sheetName: '1-4', cell: 'D10', code: '申請人氏名', kind: 'TEXT', transform: asText },
    { sheetName: '1-4', cell: 'D11', code: '申請人_役職_職務内容_責任の程度', kind: 'TEXT', transform: asText },
    // E12 申請人_年齢 は CALC（生年月日から自動算出）→ 転記しない。
    { sheetName: '1-4', cell: 'H12', code: '性別', kind: 'RADIO_BUTTON', transform: radioFromText(性別_RADIO) },
    { sheetName: '1-4', cell: 'K12', code: '申請人_経験年数', kind: 'NUMBER', transform: asNumber },
    // ④報酬(月給): 金額を格納しつつ、金額の有無で 月給 CHECK_BOX を自動 ON。
    { sheetName: '1-4', cell: 'E13', code: '月給金額', kind: 'NUMBER', transform: asNumber },
    { sheetName: '1-4', cell: 'E13', code: '月給', kind: 'CHECK_BOX', transform: checkboxOn(CHECK_ON) },
    // ④報酬(時間給): 同上。
    { sheetName: '1-4', cell: 'K13', code: '時間給金額', kind: 'NUMBER', transform: asNumber },
    { sheetName: '1-4', cell: 'K13', code: '時間給', kind: 'CHECK_BOX', transform: checkboxOn(CHECK_ON) },
    { sheetName: '1-4', cell: 'D14', code: '申請人_その他', kind: 'TEXT', transform: asText },

    // 比較対象日本人
    { sheetName: '1-4', cell: 'D24', code: '比較日本人_の役職_職務内容_責任の程度', kind: 'TEXT', transform: asText },
    { sheetName: '1-4', cell: 'E26', code: '比較日本人_年齢', kind: 'NUMBER', transform: asNumber },
    { sheetName: '1-4', cell: 'H26', code: '比較日本人_性別', kind: 'CHECK_BOX', transform: checkboxFromText(性別_CHECK) },
    { sheetName: '1-4', cell: 'K26', code: '比較日本人_経験年数', kind: 'NUMBER', transform: asNumber },
    { sheetName: '1-4', cell: 'E28', code: '比較日本人_月給', kind: 'NUMBER', transform: asNumber },
    { sheetName: '1-4', cell: 'K28', code: '比較日本人_時間給', kind: 'NUMBER', transform: asNumber },
    { sheetName: '1-4', cell: 'D30', code: '比較日本人_規定の有無', kind: 'CHECK_BOX', transform: checkboxFromText(規定有無_CHECK) },
    { sheetName: '1-4', cell: 'E32', code: '比較日本人_規定月給', kind: 'NUMBER', transform: asNumber },
    { sheetName: '1-4', cell: 'K32', code: '比較日本人_規定時間給', kind: 'NUMBER', transform: asNumber },
    { sheetName: '1-4', cell: 'D33', code: '比較日本人_報酬額と同等以上であると考える理由', kind: 'TEXT', transform: asText },
    { sheetName: '1-4', cell: 'D35', code: '比較日本人_その他', kind: 'TEXT', transform: asText },

    // 最も近い職務の日本人
    { sheetName: '1-4', cell: 'D49', code: '近い日本人の役職_職務内容_責任の程度', kind: 'TEXT', transform: asText },
    { sheetName: '1-4', cell: 'E51', code: '近い日本人_年齢', kind: 'NUMBER', transform: asNumber },
    { sheetName: '1-4', cell: 'H51', code: '近い日本人_性別', kind: 'CHECK_BOX', transform: checkboxFromText(性別_CHECK) },
    { sheetName: '1-4', cell: 'K51', code: '近い日本人_経験年数', kind: 'NUMBER', transform: asNumber },
    { sheetName: '1-4', cell: 'E53', code: '近い日本人_月給', kind: 'NUMBER', transform: asNumber },
    { sheetName: '1-4', cell: 'K53', code: '近い日本人_時間給', kind: 'NUMBER', transform: asNumber },
    { sheetName: '1-4', cell: 'D55', code: '近い日本人_規定の有無', kind: 'CHECK_BOX', transform: checkboxFromText(規定有無_CHECK) },
    { sheetName: '1-4', cell: 'E57', code: '近い日本人_規定月給', kind: 'NUMBER', transform: asNumber },
    { sheetName: '1-4', cell: 'K57', code: '近い日本人_規定時間給', kind: 'NUMBER', transform: asNumber },
    { sheetName: '1-4', cell: 'D58', code: '近い日本人_報酬額と同等以上であると考える理由', kind: 'TEXT', transform: asText },
    { sheetName: '1-4', cell: 'D60', code: '近い日本人_その他', kind: 'TEXT', transform: asText },

    // 特定技能所属機関・作成責任者（1-4 が正）
    { sheetName: '1-4', cell: 'E75', code: '特定技能所属機関名_法人名', kind: 'TEXT', transform: asText },
    { sheetName: '1-4', cell: 'E77', code: '資料作成者_役職', kind: 'TEXT', transform: asText },
    { sheetName: '1-4', cell: 'I77', code: '資料作成者_氏名', kind: 'TEXT', transform: asText },
    // 作成日=署名日として同一視。DATE→YYYY-MM-DD。
    { sheetName: '1-4', cell: 'E74', code: '書類に反映する_作成日_署名日', kind: 'DATE', transform: asDate },

    // ── 1-11-1別紙（作成責任者 役職/氏名の再掲＝1-4と同一値。先勝ちで無視される）──
    { sheetName: '1-11-1別紙', cell: 'J1', code: '資料作成者_役職', kind: 'TEXT', transform: asText },
    { sheetName: '1-11-1別紙', cell: 'O1', code: '資料作成者_氏名', kind: 'TEXT', transform: asText },

    // ── 1-6別紙（賃金区分・時給換算・控除）───────────────────
    // 賃金区分の明示チェック（金額有無からの自動判定と OR 合成）。
    { sheetName: '1-6別紙', cell: 'C5', code: '月給', kind: 'CHECK_BOX', transform: checkboxOn(CHECK_ON) },
    { sheetName: '1-6別紙', cell: 'F5', code: '月給金額', kind: 'NUMBER', transform: asNumber },
    { sheetName: '1-6別紙', cell: 'K5', code: '日給', kind: 'CHECK_BOX', transform: checkboxOn(CHECK_ON) },
    { sheetName: '1-6別紙', cell: 'N5', code: '日給金額', kind: 'NUMBER', transform: asNumber },
    { sheetName: '1-6別紙', cell: 'T5', code: '時間給', kind: 'CHECK_BOX', transform: checkboxOn(CHECK_ON) },
    { sheetName: '1-6別紙', cell: 'W5', code: '時間給金額', kind: 'NUMBER', transform: asNumber },
    { sheetName: '1-6別紙', cell: 'R6', code: '_1_4_1_1時間あたりの金額', kind: 'NUMBER', transform: asNumber },
    { sheetName: '1-6別紙', cell: 'R7', code: '_1_4_2_１ヶ月あたりの金額', kind: 'NUMBER', transform: asNumber },

    // 控除(a)〜(f)。(b)社会保険料は 厚生年金保険料 に一本化（健康保険料は設定しない）。
    { sheetName: '1-6別紙', cell: 'S21', code: '_4_a_控除額', kind: 'NUMBER', transform: asNumber },
    { sheetName: '1-6別紙', cell: 'S22', code: '厚生年金保険料', kind: 'NUMBER', transform: asNumber },
    { sheetName: '1-6別紙', cell: 'S23', code: '_4_c_控除額', kind: 'NUMBER', transform: asNumber },
    { sheetName: '1-6別紙', cell: 'S24', code: '_4_d_控除額', kind: 'NUMBER', transform: asNumber },
    { sheetName: '1-6別紙', cell: 'S25', code: '_4_e_控除額', kind: 'NUMBER', transform: asNumber },
    { sheetName: '1-6別紙', cell: 'S26', code: '_4_f_控除額', kind: 'NUMBER', transform: asNumber },
    { sheetName: '1-6別紙', cell: 'C26', code: '_4_f_控除額_備考', kind: 'TEXT', transform: constantText('水道光熱費') },
    // S18(_3_支払概算額) / U30(_4_控除額合計) は CALC → 転記しない。

    // ── 1-6（割増率・締切/支払日・各種チェック・保険）──────────
    { sheetName: '1-6', cell: 'L94', code: '_7_3_1_1_法定超月60時間以内', kind: 'NUMBER', transform: asNumber },
    { sheetName: '1-6', cell: 'L95', code: '_7_3_1_2_法定超月60時間超', kind: 'NUMBER', transform: asNumber },
    { sheetName: '1-6', cell: 'L96', code: '_7_3_1_3_所定超', kind: 'NUMBER', transform: asNumber },
    { sheetName: '1-6', cell: 'H97', code: '_7_3_2_1_法定休日', kind: 'NUMBER', transform: asNumber },
    { sheetName: '1-6', cell: 'R97', code: '_7_3_2_2_法定外休日', kind: 'NUMBER', transform: asNumber },
    { sheetName: '1-6', cell: 'G98', code: '_7_3_3_深夜', kind: 'NUMBER', transform: asNumber },

    { sheetName: '1-6', cell: 'J99', code: '_1賃金締切日', kind: 'TEXT', transform: asText },
    { sheetName: '1-6', cell: 'Q99', code: '_2_賃金締切日', kind: 'TEXT', transform: asText },
    { sheetName: '1-6', cell: 'J100', code: '_1_賃金支払日', kind: 'TEXT', transform: asText },
    { sheetName: '1-6', cell: 'Q100', code: '_2_賃金支払日', kind: 'TEXT', transform: asText },

    // 締切/支払の「毎月」は常に ON（固定）。
    { sheetName: '1-6', cell: 'H99', code: '_1賃金締切日_毎月', kind: 'CHECK_BOX', transform: checkboxAlways(CHECK_ON) },
    { sheetName: '1-6', cell: 'O99', code: '_7_4_2_1_毎月', kind: 'CHECK_BOX', transform: checkboxAlways(CHECK_ON) },
    { sheetName: '1-6', cell: 'H100', code: '_1賃金支払_毎月', kind: 'CHECK_BOX', transform: checkboxAlways(CHECK_ON) },
    { sheetName: '1-6', cell: 'O100', code: '_2_毎月_賃金支払日', kind: 'CHECK_BOX', transform: checkboxAlways(CHECK_ON) },

    { sheetName: '1-6', cell: 'H101', code: '_7_6_1_口座振替', kind: 'CHECK_BOX', transform: checkboxOn(CHECK_ON) },
    { sheetName: '1-6', cell: 'O101', code: '_7_6_2_通貨払', kind: 'CHECK_BOX', transform: checkboxOn(CHECK_ON) },
    { sheetName: '1-6', cell: 'O102', code: '_7_7_1_控除無', kind: 'CHECK_BOX', transform: checkboxOn(CHECK_ON) },
    { sheetName: '1-6', cell: 'Q102', code: '_7_7_2_控除有', kind: 'CHECK_BOX', transform: checkboxOn(CHECK_ON) },

    { sheetName: '1-6', cell: 'E103', code: '_7_8_1_昇給有', kind: 'CHECK_BOX', transform: checkboxOn(CHECK_ON) },
    { sheetName: '1-6', cell: 'Y103', code: '_7_8_2_昇給無', kind: 'CHECK_BOX', transform: checkboxOn(CHECK_ON) },
    { sheetName: '1-6', cell: 'J103', code: '_7_8_3_昇給有の時期金額等', kind: 'TEXT', transform: asText },
    { sheetName: '1-6', cell: 'E104', code: '_7_9_1_賞与有', kind: 'CHECK_BOX', transform: checkboxOn(CHECK_ON) },
    { sheetName: '1-6', cell: 'X104', code: '_7_9_2_賞与無', kind: 'CHECK_BOX', transform: checkboxOn(CHECK_ON) },
    { sheetName: '1-6', cell: 'J104', code: '_7_9_1_賞与有の時期金額等', kind: 'TEXT', transform: asText },
    { sheetName: '1-6', cell: 'E105', code: '_7_10_1_退職金有', kind: 'CHECK_BOX', transform: checkboxOn(CHECK_ON) },
    { sheetName: '1-6', cell: 'X105', code: '_7_10_2_退職金無', kind: 'CHECK_BOX', transform: checkboxOn(CHECK_ON) },
    { sheetName: '1-6', cell: 'J105', code: '_7_10_3_退職金有の時期金額等', kind: 'TEXT', transform: asText },
    // 11. 休業手当・健康診断関連（行106/115/116）は企業入力対象外 → 実装しない。

    { sheetName: '1-6', cell: 'K113', code: '_9_1_1_厚生年金', kind: 'CHECK_BOX', transform: checkboxOn(CHECK_ON) },
    { sheetName: '1-6', cell: 'O113', code: '_9_1_2_健康保険', kind: 'CHECK_BOX', transform: checkboxOn(CHECK_ON) },
    { sheetName: '1-6', cell: 'S113', code: '_9_1_3_雇用保険', kind: 'CHECK_BOX', transform: checkboxOn(CHECK_ON) },
    { sheetName: '1-6', cell: 'V113', code: '_9_1_4_労災保険', kind: 'CHECK_BOX', transform: checkboxOn(CHECK_ON) },
    { sheetName: '1-6', cell: 'K114', code: '_9_1_5_国民年金', kind: 'CHECK_BOX', transform: checkboxOn(CHECK_ON) },
    { sheetName: '1-6', cell: 'O114', code: '_9_1_6_国民健康保険', kind: 'CHECK_BOX', transform: checkboxOn(CHECK_ON) },
    { sheetName: '1-6', cell: 'S114', code: '_9_1_7_その他', kind: 'CHECK_BOX', transform: checkboxOn(CHECK_ON) },
    { sheetName: '1-6', cell: 'U114', code: '_9_1_8_その他の内容', kind: 'TEXT', transform: asText },
    // T116(_9_2_3_その後の頻度) は弊社既定 → 実装しない。

    // ── 【介護分野】事業所概要1（app36対象外化に伴い app55 へ振替）──
    { sheetName: '【介護分野】事業所概要1', cell: 'A19', code: '_2その他特記事項', kind: 'TEXT', transform: asText },
  ],
  subtables: [
    // 諸手当(a)〜(h): 1-6別紙 行9〜16。手当名(D列)が空の行はスキップ。
    {
      code: '手当詳細',
      sheetName: '1-6別紙',
      rowStart: 9,
      rowEnd: 16,
      keyCol: 'D',
      columns: [
        { subCode: '手当名', col: 'D', kind: 'TEXT', transform: asText },
        { subCode: '手当_金額', col: 'K', kind: 'NUMBER', transform: asNumber },
        { subCode: '手当_計算方法', col: 'S', kind: 'TEXT', transform: asText },
      ],
    },
    // 追加控除項目(g)(h)(i): 1-6別紙 行27〜29。費用名(D列)が空の行はスキップ。
    {
      code: 'その他の控除の明細',
      sheetName: '1-6別紙',
      rowStart: 27,
      rowEnd: 29,
      keyCol: 'D',
      columns: [
        { subCode: 'その他控除項目', col: 'D', kind: 'TEXT', transform: asText },
        { subCode: 'その他の控除額', col: 'S', kind: 'NUMBER', transform: asNumber },
      ],
    },
  ],
}
