---
name: kintone-transcribe-mapping
description: >-
  FunBaseの申請書類作成フォーム(Excel)→kintone(app55=就労_ビザ書類作成_雇用条件書 / app34=マスタ_法人)
  への「転記マッピング」を追加・修正・検証する時の手順とハマりどころ。以下のような時は必ずこのスキルを使うこと：
  Excelの欄をkintoneに転記したい／マッピングを追加・修正したい／雇用条件書(app55)や法人(app34)のフィールドを増やしたい／
  「転記したのにkintoneに入らない・空になる」を調べたい／アップロード用のテスト用Excelを作りたい／
  lib/portal/kintone-sync/ 配下(mappings/transcribe/transforms/build-records/run-transcription)を触る時。
  Excel⇄kintone・雇用条件書・転記・マッピング・提出フォームといった話題なら明示的に頼まれなくても発動する。
---

# 申請書類フォーム(Excel) → kintone 転記マッピング

FunBaseの提出Excel「申請書類作成フォーム」を kintone へ転記する仕組みの**マッピング作業ガイド**。
セル↔フィールド対応を足す／直す／検証する時に使う。ハマりどころは実際に踏んだものばかりなので必ず目を通すこと。

## 転記の全体像
- 発生源 = kintone「就労_ビザ案件管理」**app296**。案件レコードが company_ref(→app34) と koyou_details サブテーブル(→app55を複数人)を**事前紐付け**（Aモデル＝照合レス）。
- 転記先 = **app34**(マスタ_法人 / company_ref) と **app55**(雇用条件書 / 各人)。app36(事業所)は対象外。
- 提出Excelの共通payloadを各人の app55 へ **fan-out**。人固有(氏名/性別/経験年数)は転記せず kintone の HRIDルックアップが補完。

## 主要ファイル
- `lib/portal/kintone-sync/mappings/app34.ts` / `app55.ts` — セル↔フィールドのマッピング定義（`fields[]` / `derived[]` / `subtables[]`）
- `transcribe.ts` — 転記エンジン。`transcribeWorkbook`(app34転記＋app55 payload生成)、`buildApp55Record`、`APP55_PERSON_SPECIFIC_CODES`
- `build-records.ts` — `buildRecord`（fields先勝ち／CHECK_BOXはOR合成／derived合成／subtable展開）
- `types.ts` — `FieldMapping` / `DerivedFieldMapping` / `SubtableMapping`
- `transforms.ts` — `asText/asNumber/asDate/checkboxOn/checkboxFromText/checkboxAlways/radioFromText/keepIfEquals/constantText/combineYmdDate`
- `run-transcription.ts` — `runCaseTranscription`(紐付け解決→app34 update＋app55 fan-out→app296書戻し) / `maybeAutoTranscribeOnUpload`(アップロード時自動トリガー)
- kintone認証(ローカル) = `~/workspace/funtoco/fun-hubspot-to-kintone/.env`（KINTONE_BASE_URL / KINTONE_USERNAME / KINTONE_PASSWORD、password認証）
- 同梱スクリプトは `scripts/`（下記手順で使う。パスは冒頭のTODOを書き換える）

## マッピングを追加する手順
1. **kintoneフィールドの実在・型を確認**：`/k/v1/app/form/fields.json?app=55` を取得（`X-Cybozu-Authorization: base64(user:pass)`）。
2. **書込可能か確認【最重要 → ハマり①】**：ルックアップのコピー先／CALCは書けない。`scripts/scan_locked_fields.py` で除外。
3. **Excelの入力セルを特定【ハマり④】**：`scripts/detect_inputs.py`（条件付き書式から入力欄を検出）。
4. **app55.ts / app34.ts にフィールド追加**：`{ sheetName, cell, code, kind, transform }`。日付分割は `derived`【ハマり②】、■/□は `checkboxFromText`【ハマり③】、サブテーブルは `subtables`。
5. **検証**：全項目フォーム(`scripts/build_test_form.py`)を作り `transcribeWorkbook` を dryRun → **payloadだけでなく実際にkintoneへ書いて再取得**して入ったか確認【ハマり①/検証の型】。
6. `pnpm`（npmではない）で `npx tsc --noEmit` と `npx vitest run __tests__/portal-kintone-transcribe.test.ts`。マッピングのみの変更ならDBマイグレ無し。

## ハマりどころ（実際に踏んだ学び）

### ① kintoneの「ルックアップ自動コピー先」は書込不可 ★最重要
app55の多くのフィールドは、別ルックアップ（**事業所OFID / COID / HRID / 相談担当者 / 連絡先ID_資料作成者**等）が
app36やマスタから**自動供給するコピー先**。`updateRecord`は**成功するのに値が入らない**（エラーにならず無視される）。CALCも書込不可。
- 検出：app fields JSON の各フィールド `lookup.fieldMappings[].field`（=コピー先）を全走査 → `scripts/scan_locked_fields.py`。
- 確証：`{"app":55,"id":<rec>,"record":{"<code>":{"value":"TEST"}}}` を PUT → 再取得して消えていれば書込ロック確定。
- 対処：マッピングから外す。これらは app55 に OFID 等が設定されれば kintone 側で自動的に入る（Excel転記対象外が正しい）。
- 実例で外したもの：事業所名/郵便/住所/連絡先・労働保険番号/雇用保険番号・所定労働時間(週月年)・所定労働日数(週月年)・年間休日・契約更新の有無・相談窓口・特定技能所属機関名・資料作成者。

### ② 日付が「年/月/日」の3セルに分かれている
kintoneの年/月/日フィールドは単一DATEからの**CALC**＝書けるのは日付フィールド1つだけ。
Excelの3セルを `combineYmdDate([年,月,日])` ＋ `derived` マッピング（複数セル→1フィールドの合成機構）で1日付に組み立てる。単位付き('2026年')も吸収、欠け/範囲外はnull。

### ③ ■/□ マーカーのチェックは checkboxFromText(['■'])
■のときON。`checkboxOn` は「非空なら真」なので **□ も誤ってONになる**。exact一致の `checkboxFromText(['■'])` を使う。

### ④ Excelの入力セルは「条件付き書式」で分かる
入力欄は空だとピンク＝`containsBlanks`の条件付き書式（`LEN(TRIM(cell))=0`）。そのCF範囲＝入力セル。テンプレでは空なので、
`scripts/detect_inputs.py` でCF範囲→結合アンカー→ラベル(テンプレに値ありの左見出し)を除外して抽出。
入力位置の規則：**単位ラベル(時/分/月/日/回)のすぐ左のセル**＝入力、**赤い結合枠**＝入力欄。

### ④-2 「ラベル文字が入った定型セル」を checkboxOn で読まない ★2026-08-13
`■/□` マーカーではなく **『有』『無』という見出し文字そのもの**が入っている定型セルがある
（例: 1-6 の `Y103='無'`。チェック本体は隣の `X103`＝True/False）。
`checkboxOn` は非空なら真なので、**見出しセルを読むとそのCHECK_BOXが毎回ONになる**（気づきにくい）。
入力チェックは「ラベル文字の**左**のブール値セル」。行ごとに `E列=有チェック / X列=無チェック / Y列='無'ラベル` を必ず確認する。
- 併せて: 昇給/賞与/退職金は**有無を選ばず「時期，金額等」だけ書く企業が多い**。記載あり→`有`をON、
  `無`は「無チェック かつ 時期金額等が空」のときだけON（`checkboxOffWhenNoted`）にしてある。

### ④-3 SUBTABLE の keyCol は「必ず埋まる列」以外にしない ★2026-08-13
`keyCol` が空の行は丸ごとスキップされる＝**サブテーブル全体が payload に載らず無反映**になる。
交代制シフト(1-6 行54〜62)は `適用日(P列)` を keyCol にしていたが、適用日は任意記入でほぼ空
（kintone実データでも全行空）だったため、シフトを書いていても1行も転記されていなかった。
→ 主キーになる列が無い明細は **`keyCol` を指定しない**（build-records の「全列null行はスキップ」に任せる）。

### ④-4 「1つのkintoneフィールドに複数セルを割り当てる」時は意味が同じか確認 ★2026-08-13
`月給金額` は 1-4「④申請人に対する報酬」と 1-6別紙「１．基本賃金」の**両方**から割り当てていたが、
企業は 1-4 に**支払概算額（基本賃金＋諸手当）**を書く。スカラは先勝ちなので 1-4 が勝ち、
基本賃金に概算額が入り、そこからCALCされる `_3_支払概算額`/`_5_支給概算額` まで連鎖して誤る。
→ 金額系は**意味が一致するシートだけ**を出所にする（基本賃金＝1-6別紙 F5/N5/W5 のみ）。

### ⑤ テスト用Excelは openpyxl 再保存禁止（画像消失・破損の元）
openpyxlでテンプレを再保存すると**全シートの画像が消え**（1-6は10枚等）、結合の一括解除で見た目が崩れ、exceljsが`anchors`エラーで読めなくなる。
→ **lxmlで `xl/worksheets/sheetN.xml` の該当セル値だけ書き換えてzip再パッケージ**（`scripts/build_test_form.py`）。画像/結合/書式/図形を100%保持し、exceljsも元形式のまま読める。値は inlineStr(text)/`<v>`(number)/`t="b"`(bool)。
- **数式セルを値で上書きしたら `xl/calcChain.xml` を除去**（＋`[Content_Types].xml`のOverrideと`xl/_rels/workbook.xml.rels`のRelationshipも）。残すと索引と矛盾→**Excelが「修復」して結合を消す**（openpyxl読取では正常に見えるので気づけない）。
- **Excel修復の主因チェック順**：(a)結合の非アンカーに値／(b)セル・行の順序不正・重複・spans外／(c)calcChain矛盾。
- テンプレ(ユーザー添付)は即 scratchpad にバックアップ（Downloadsは消える）。

### ⑥ テストデータの安全
- **app34は転記先が実在法人**(company_ref)。適当な値を入れると法人マスタを壊す → **no-op（その法人の現在値をそのまま入れる）**で保護。
- app55は**捨てレコード**へfan-out。**掃除はID指定のみ**（kintoneのlike検索は全文/トークン一致で誤爆し、無関係レコードを消す事故がある）。
- 事業所名などは**kintoneとFunBaseで名寄せが一致するテナント**を選ぶ（不一致だとWebhookミラーが `office_not_resolved` でサイレントskip）。

## 本番で「転記されない」時の切り分け
- **Vercel(fun-studio-v0)にkintone書込認証(`KINTONE_BASE_URL`/`KINTONE_USERNAME`/`KINTONE_PASSWORD` or `KINTONE_API_TOKEN_APP34`)が未設定 → `createKintoneWriteClientFromEnv()`がnull → 転記がドライラン → 無反映**。app296の `sync_log` 空・`synced_at` 空で判別。API tokenは1アプリのみ＝複数アプリ(34/55/296)書込は**ユーザー/パス方式**が必要。**パスワードをフォームに入力する設定は安全ルール上こちらでは行わない**＝ユーザーがVercel画面で設定→Redeploy。
- 回避で今すぐ流すなら、ローカル認証を読み込んで tsx 直接実行（`set -a; . fun-hubspot-to-kintone/.env; set +a; tsx script.ts`）。
- アップロード欄でExcelが**選べない**＝`components/portal/checklist-table.tsx`のfile input `accept`にxlsxが無い（`application_workbook`の時だけ `.xlsx` を許可）。
- 一度提出すると「確認中」で再アップロード不可＝`canUpload`を承認済み以外に拡大＋storage `upsert:true`（同名上書き）で差し替え可能に。

## 検証の型（合言葉）
「**updateRecord が成功するのに値が入らない**」＝ハマり①（ルックアップ書込ロック/CALC）を疑う。
payloadに入っていても書けていないことがあるので、**必ずkintone側を再取得して確認**する。dryRunのpayload一致だけで「OK」としない。
