import { asNumber } from '../transforms'
import type { AppMapping } from '../types'

/**
 * 提出Excel → kintone app36（マスタ_事業所）のマッピング。
 *
 * 【なぜ app36 に書くのか】
 * 雇用条件書(app55)の「3.所定労働時間数 / 4.所定労働日数 / 年間合計休日日数」
 * （`_4_3_1_1_時間`〜`_4_3_3_2_分` / `_4_4_1_週所定労働日数`〜`_4_4_3_年所定労働日数` /
 * `_5_3_年間合計休日日数`）は、app55 の事業所(OFID)ルックアップが app36 から自動コピーする
 * **コピー先＝書込ロック**で、Excel から直接送っても kintone 側で無視される
 * （updateRecord は成功するのに値が入らない）。
 * そこで **コピー元である app36 側に書く**ことで、事業所マスタ経由で app55 に反映させる。
 * app36 更新後に app55 を OFID 付きで更新するとルックアップが再実行され、コピー先が最新化される
 * （run-transcription.ts 参照）。
 *
 * 【転記先レコード】app296「ビザ案件管理」の office_details サブテーブル office_ref
 * （= app36 のレコード番号）。事前紐付け済み（Aモデル・照合レス）。
 *
 * 【スコープ】事業所マスタは他案件・他人材からも参照される共有マスタのため、
 * 雇用条件書に必要な労働時間系のみに限定する（事業所名・住所・保険番号等は転記しない）。
 * Excel が空欄の項目は payload に含めないので、既存のマスタ値は消さない。
 *
 * ソースシート: `1-6`（Ⅳ．労働時間等 3./4.、Ⅴ．休日）。
 * 入力セルは条件付き書式（未入力＝ピンク）で確認済み。単位ラベルの左が入力欄。
 */
export const APP36_MAPPING: AppMapping = {
  appId: '36',
  fields: [
    // ── Ⅳ．労働時間等 3.所定労働時間数（1-6 行68）──
    // 「①週（ [E68] 時間 [H68] 分 ）②月（ [M68] 時間 [P68] 分） ③年（ [U68] 時間 [X68] 分 ）」
    { sheetName: '1-6', cell: 'E68', code: '所定労働時間_週_時間', kind: 'NUMBER', transform: asNumber },
    { sheetName: '1-6', cell: 'H68', code: '所定労働時間_週_分', kind: 'NUMBER', transform: asNumber },
    { sheetName: '1-6', cell: 'M68', code: '所定労働時間_月_時間', kind: 'NUMBER', transform: asNumber },
    { sheetName: '1-6', cell: 'P68', code: '所定労働時間_月_分', kind: 'NUMBER', transform: asNumber },
    { sheetName: '1-6', cell: 'U68', code: '所定労働時間_年_時間', kind: 'NUMBER', transform: asNumber },
    { sheetName: '1-6', cell: 'X68', code: '所定労働時間_年_分', kind: 'NUMBER', transform: asNumber },

    // ── Ⅳ．労働時間等 4.所定労働日数（1-6 行69）──
    // 「①週（ [I69] 日 ）②月（ [P69] 日 ）③年（ [W69] 日 ）」
    { sheetName: '1-6', cell: 'I69', code: '所定労働日数_週', kind: 'NUMBER', transform: asNumber },
    { sheetName: '1-6', cell: 'P69', code: '所定労働日数_月', kind: 'NUMBER', transform: asNumber },
    { sheetName: '1-6', cell: 'W69', code: '所定労働日数_年', kind: 'NUMBER', transform: asNumber },

    // ── Ⅴ．休日 1.定例日（1-6 行74）年間合計休日日数 ──
    { sheetName: '1-6', cell: 'X74', code: '年間合計休日日数', kind: 'NUMBER', transform: asNumber },
  ],
}
