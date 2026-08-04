# ビザ申請ポータル フェーズ3（提出Excel → kintone 転記）実装計画

**Goal:** 企業が提出した `申請書類作成フォーム.xlsx` を FunBase 内でパースし、kintone **app34(マスタ_法人)** へ **upsert（法人番号で照合→更新/新規）** する。**シート別モジュール**で拡張可能に。まず `はじめに` シート → app34 のみ。**事業所(app36)・雇用条件(app55)は後続**。

**方針/制約:**
- **ドライラン既定**（本番kintone `funtoco.cybozu.com` を勝手に書かない）。実書き込みは `dryRun:false` ＋認証設定時のみ。
- **file-generation-only**：`supabase:reset` 不要（DB変更なし）。検証は `typecheck` ＋ `vitest`（kintone通信はモック）。本番kintoneへ書かない。
- ブランチ `claude/visa-portal-phase3`（fun-base本体のみ）。
- 依存追加：`exceljs`（xlsxのセル/結合セル読取）。

**マッピング根拠:** `docs/specs/2026-07-24-visa-excel-kintone-mapping-v2-visible-sheets.md`（app34セクション）。kintoneフィールド定義: `<scratchpad>/kintone_app_34_fields.json`。

---

## アーキテクチャ（`lib/portal/kintone-sync/`）
- `transforms.ts` — 値変換。`asText(v)`, `asNumber(v)`(カンマ/円/人/空白除去→数値)。将来 `asCheckbox`,`asDate`,辞書系。
- `mappings/hajimeni.ts` — `はじめに`→app34 の定義（下記）＋ upsertキー。**1シート=1ファイル**。
- `excel-reader.ts` — exceljsでworkbookを開き、`sheetCellReader(ws): (addr)=>value` を返す（結合セルはマスターセルの値）。
- `build-records.ts` — `buildRecord(getCell, mapping)`：マッピング適用→`{code:{value}}`（null/空はスキップ）。**getCellを注入**するのでテストはファイル不要。
- `kintone-write-client.ts` — 軽量RESTクライアント。env（`KINTONE_BASE_URL` ＋ `KINTONE_API_TOKEN_APP34` もしくは `KINTONE_USERNAME`/`KINTONE_PASSWORD`）。`getRecords(app,query)`,`createRecord(app,rec)`,`updateRecord(app,id,rec)`。認証未設定なら dryRun のみ許可。
- `transcribe.ts` — オーケストレーション。`transcribeHajimeni({buffer, dryRun=true})`→ workbook読取→app34レコード生成→（法人番号で既存検索）→ `{plan:{action:'create'|'update'|'dry-run', recordId?, record}}`。dryRun時は書かずplanを返す。

## API
- `app/api/applications/[caseId]/kintone-transcribe/route.ts`（POST）。認証（session＋writer）。案件の提出Excel（`office_documents` の `document_code='application_workbook'`）をStorageから取得→`transcribeHajimeni`（`?dryRun=true` 既定）→ planを返す。`dryRun=false` は当面ガード（未設定なら400/ドライランに強制）。

## マッピング（はじめに → app34）※v2の高確信
| Excelセル | kintoneコード | 変換 |
|---|---|---|
| `E14` | `法人番号_13桁_` | asText（13桁・先頭0保持・文字列） |
| `E15` | `数値_1`（資本金） | asNumber |
| `E18` | `年間売上金額_直近年度_` | asNumber |
| `E19` | `数値_0`（常勤職員数） | asNumber |

**upsertキー**: app34 `法人番号_13桁_`。`getRecords('34', '法人番号_13桁_ = "<値>"')` → 1件あれば updateRecord、無ければ createRecord。複数ヒットは中止＋要確認（重複）。

---

## Task 1: 依存追加＋transforms（TDD）
- `npm install exceljs`。
- `__tests__/portal-kintone-transcribe.test.ts`：`asNumber('10,000,000円')===10000000`, `asNumber('30人')===30`, `asNumber('')===null`, `asText(' x ')==='x'`。
- `lib/portal/kintone-sync/transforms.ts` 実装 → green。

## Task 2: mapping＋build-records（TDD）
- テスト：`buildRecord(getCell, HAJIMENI_APP34)` に `getCell=(a)=>({E14:'1180001012345',E15:'10,000,000円',E18:'50,000,000',E19:'30人'}[a])` を注入 → `{'法人番号_13桁_':{value:'1180001012345'},'数値_1':{value:10000000},'年間売上金額_直近年度_':{value:50000000},'数値_0':{value:30}}`。空セルはキー自体が出ないこと。
- `mappings/hajimeni.ts`＋`build-records.ts` 実装 → green。

## Task 3: excel-reader（exceljs）
- `openWorkbook(buffer)`＋`sheetCellReader(ws)`。`はじめに`シートの `ws.getCell('E14').value` が読めること。結合セルはマスターセル値。
- 簡易テスト：exceljsで最小workbookをメモリ生成→`はじめに`にE14等を入れ→reader経由で取得。または reader は薄いので transcribe のモックテストで担保。

## Task 4: kintone-write-client（モックテスト）
- env読取。`getRecords/createRecord/updateRecord`（fetchでkintone REST）。**実通信テストはしない**。
- テスト：`fetch` をモックし、getRecordsが1件→update呼び出し / 0件→create呼び出し、を検証（upsert判定は transcribe 側でも可）。

## Task 5: transcribe オーケストレーション（TDD）
- `transcribeHajimeni({buffer, dryRun})`。kintoneクライアントを注入可能に（テストでモック）。
- テスト：既存1件あり→ plan.action='update'＋recordId、無し→'create'、dryRun=true→書込メソッド未呼び出しで plan 返却、複数ヒット→エラー。

## Task 6: API ルート
- `POST /api/applications/[caseId]/kintone-transcribe`。認証・案件アクセス確認・Excel取得・transcribe（dryRun既定）・plan返却。`dryRun=false`は認証情報が揃い、かつ明示時のみ。
- `npm run typecheck` green。

## Task 7: 検証
- `npm test -- portal-kintone-transcribe` green。`npm run typecheck` 新規ファイルにエラーなし。
- 本番kintoneには書かない。ドライランのplan生成をユニットで担保。

## 後続（別PR）
- `1-4`→app55（雇用条件）, `1-6`→app55（賃金）, 居住費→app55, 事業所→app36。
- 実書込の有効化（app別APIトークン発行＋レビューフロー）。実記入済Excelでの精度確認。値変換辞書（分野/性別）。
