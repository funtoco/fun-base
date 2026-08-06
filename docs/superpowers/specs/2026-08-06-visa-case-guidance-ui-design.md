# 申請ポータルのご案内UI 設計

対象: `/applications`（申請ポータル＝ビザ案件管理の一覧画面）と新規の `/applications/guide`

## 背景と課題

`/applications` は現在ページタイトルと案件テーブルだけで、申請手続きの説明が一切ない。
一方で OP は在留資格申請のご案内を PDF（`1．ご案内資料(法人向け).pdf` / `1．ご案内資料(個人事業主向け).pdf`）にまとめ、
企業担当者へメールで送っている。結果として、

- FunBase を開いた企業担当者は「で、自分は何をすればいいのか」がわからない
- 案内内容はメールの中に埋もれ、必要なときに参照されない
- 全員に同じ PDF を送るため、自分に関係のない情報（法人向けの書類、他分野の協議会手順）を読まされる

## ゴール

1. 案件一覧を開いた時点で、手続きの全体像と自分が対応することが把握できる
2. メールで送っている案内内容をアプリ内に置き、**案件の属性に合った分だけ**を出す
3. 書類の取得ミス（本籍地の記載漏れ、納税証明書の税目チェック漏れ）をサンプル画像で減らす

## 非ゴール

- 案件の新規作成 UI（現状 `getAccessibleOffices` は未使用。案件は OP が用意する運用）
- 期間・料金の案内（社内で確定した数値がないため扱わない）
- 一覧テーブルの構造変更（列の増減・カード化はしない）
- お知らせ / FAQ の右カラム掲載（既存の `/announcements`・`/faq` に任せる）

## 出し分けの軸

資料は 3 つの軸で内容が分岐しており、いずれも `visa_application_cases` のカラムに対応する。

| 資料の分岐 | カラム | 値 |
|---|---|---|
| 法人向け / 個人事業主向け | `entity_type` | `corporate` / `sole_proprietor` |
| 初めて受け入れる / 既に受け入れ済み | `application_category` | `initial` / `renewal` |
| 協議会の登録手順・営業許可証の要否 | `field` | `care` / `food_service` / `food_manufacturing` / `accommodation` / `other` |

## 全体構成

```text
lib/portal/guidance/
├── types.ts       ガイダンス用の型
├── flow.ts        在留資格申請手続きの流れ（3レーン）
├── council.ts     協議会加入登録方法（分野別）
├── documents.ts   取得書類一覧（entityType × category）
├── samples.ts     書類サンプル画像のメタ
└── index.ts       selectGuidance() — 画面が触る唯一の公開API

components/portal/guidance/
├── flow-summary.tsx      一覧に置く横並びステップ（貴社レーンのみ）
├── guide-entry-cards.tsx 「最初にご確認ください」入口カード3枚
├── submission-rules.tsx  右カラム「書類の提出について」
├── contact-card.tsx      右カラム「困ったときは」
├── flow-lanes.tsx        ガイドページの3レーン図
├── council-section.tsx   ガイドページの協議会セクション
├── document-table.tsx    ガイドページの取得書類テーブル
└── sample-dialog.tsx     サンプル画像のダイアログ

app/applications/page.tsx        既存 + ご案内と右カラム
app/applications/guide/page.tsx  新規
scripts/extract-guidance-samples.sh  PDF → public/guidance/samples/
public/guidance/samples/*.webp       生成物（コミットする）
```

## データ層

### `types.ts`

```ts
import type { ApplicationCategory, EntityType, Field } from '@/lib/portal/types'

export type FlowLane = 'company' | 'funtoco' | 'candidate'

export interface FlowNote {
  tone: 'info' | 'warning'
  body: string
}

export interface FlowStep {
  id: string
  lane: FlowLane
  title: string
  description?: string
  note?: FlowNote
  /** 未指定なら全 entityType に出す */
  entityTypes?: EntityType[]
  /** 未指定なら全 category に出す */
  categories?: ApplicationCategory[]
}

export interface CouncilGuide {
  id: string
  label: string
  fields: Field[]
  steps: string[]
  requiredDocuments: { heading?: string; items: string[] }[]
  links: { label: string; url: string }[]
}

export interface RequiredDocument {
  no: number
  name: string
  /** 「原本」「写し」「原本 又は 写し」「①原本 ②写し」など資料の表記をそのまま持つ */
  copyType: string
  issuer: string | null
  notes: string[]
  /** 未指定なら全分野。営業許可証のように分野限定のものだけ指定する */
  fields?: Field[]
  sampleIds?: string[]
}

export interface DocumentSample {
  id: string
  title: string
  src: string
  /** next/image に渡す実寸。切り出しプリセットで決まる（half = 982×1200 / full = 1200×733） */
  width: number
  height: number
  caption?: string
  /** 「交付請求時のポイント」のような手順 */
  points?: string[]
  warning?: string
}

export interface Guidance {
  entityType: EntityType
  category: ApplicationCategory
  field: Field | null
  flow: Record<FlowLane, FlowStep[]>
  councils: CouncilGuide[]
  documents: RequiredDocument[]
  samples: DocumentSample[]
}
```

### `index.ts`

```ts
export function selectGuidance(input: {
  entityType: EntityType
  category: ApplicationCategory
  field?: Field | null
}): Guidance
```

挙動:

- `flow` は `entityTypes` / `categories` で絞ったうえでレーンごとに配列を返す
- `councils` は `field` が指定されていればその分野を含むものを先頭に、残りを後ろに並べる。`field` が null なら定義順
- `documents` は `` `${entityType}:${category}` `` で引いたうえで、`fields` を持つ項目は `field` が一致するときだけ残す。`field` が null のときは全部残す（どの分野かわからないので落とさない）
- `samples` は `documents` が参照する `sampleIds` を解決したもの

### `documents.ts` のキー

```ts
const DOCUMENTS: Record<`${EntityType}:${ApplicationCategory}`, RequiredDocument[]>
```

`corporate:renewal` と `sole_proprietor:renewal` は同一内容だが、キーは 4 つとも明示的に持つ（将来の分岐に備え、共通配列を両方から参照する）。

## コンテンツ

以下は上記 PDF 2 本からの転記。PDF はリポジトリに含めないため、この節を実装時の原典とする。

### 申請手続きの流れ

**貴社（受け入れ機関）レーン**

| id | title | 条件 | 補足 |
|---|---|---|---|
| `company-prepare-initial` | 書類の作成 / 準備 | `initial` | 取得書類一覧を参照 |
| `company-prepare-renewal` | 書類の準備 | `renewal` | 準備書類一覧を参照 |
| `company-council-join` | 協議会加入登録 / 入会申請 | `initial` | 協議会セクションを参照 |
| `company-council-check` | 協議会登録確認（配属事業所の登録） | `renewal` | |
| `company-review` | 確認・内容修正 / 承諾 | | |
| `company-seal` | 書類への押印対応 / 返送 | | 注記が entityType で変わる（下記） |
| `company-interview` | 行政書士と申請内容確認面談 | | |

`company-seal` の注記（`tone: 'warning'`）:

- `sole_proprietor`: 押印（実印又は認印）のうえ、弊社大阪本社宛にご返送ください。
- `corporate`: 法人印押印のうえ、弊社大阪本社宛にご返送ください。

`company-prepare-*` の注記（`tone: 'info'`）:

- `sole_proprietor`: 個人事業主として必要な書類をご取得ください。揃い次第弊社宛にご郵送ください。※書類有効期限は発行日から3ヶ月です。
- `corporate`: 法人書類をご取得ください。揃い次第弊社宛にご郵送ください。※書類有効期限は発行日から3ヶ月です。

**Funtoco レーン**

| id | title | note |
|---|---|---|
| `funtoco-review` | 確認 / 修正提案 | info: 入管で審査がスムーズになるよう、メールで内容のすり合わせをいたします。変更点あればご教示くださいませ。 |
| `funtoco-send-seal` | 押印書類郵送 | |
| `funtoco-send-signature` | 本人サイン書類準備 / 送付 | |
| `funtoco-precheck` | 申請に向けた事前確認 | |
| `funtoco-submit` | 行政書士による申請手続き | |
| `funtoco-result` | 申請結果の共有（行政書士からの連絡に基づき） | warning: 審査中、出入国在留管理局からの指示により、必要に応じ追加 / 修正の対応を行います。 |

**内定者レーン**

| id | title |
|---|---|
| `candidate-documents` | 本人取得書類準備 |
| `candidate-sign` | 本人サイン / 返送 |
| `candidate-interview` | 行政書士と申請内容確認面談 |

一覧ページの `flow-summary.tsx` は貴社レーンのみを横並びで出す。

### 協議会加入登録方法

見出しの説明文: 特定技能で外国人を受け入れるには、各分野ごとの協議会へ加入し、『加入証明書』を取得する必要があります。

**介護**（`fields: ['care']`）

申し込み方法:

1. Webでアカウントの発行を申請する。詳細は基本操作マニュアルをご参照ください。
2. ログイン後「構成員名簿の情報公開可否」の回答を登録。
3. 受け入れ機関 / 受け入れ事業所情報を登録し、入会申請を行う。事業所登録後審査が行われ、約2週間で加入証明書が発行される。
4. 証明書は各種手続き『入会証明書ダウンロード』にてダウンロードする。ご登録いただいた事業所でのみ就労が可能です。就労する事業所が複数の時は複数登録する必要あり。

必要書類:

1. 事業所の指定通知書 — 『医療保険』『介護保険』『障害福祉』サービス等の指定を受けた際に都道府県や市区町村等から通知される「指定通知書」の写しをご提出ください。
2. 介護分野における業務を行わせる事業所の概要書等（分野参考様式第1-2号）

リンク: 新規登録 / 操作マニュアル（URL未取得）

**外食業・飲食料品製造業**（`fields: ['food_service', 'food_manufacturing']`）

申し込み方法:

1. Webで加入申請フォームを入力する。
2. 申請フォームを送信した後協議会からメールが届く。
3. メールに必要書類を添付し、ご返信いただく。※ここから入会審査が行われる。※メールで追加書類が求められる場合がある。
4. 承認後、約2週間~1ヶ月で加入証明書がメールで送付される。

必要書類（外食業分野）:

1. 外食分野における特定技能外国人の受入れに関する誓約書（分野参考様式第14-1号）の写し
2. 営業許可証の写し

必要書類（飲食料品製造業分野）:

1. 飲食料品製造業分野における特定技能外国人の受入れに関する誓約書（分野参考様式第13-1号）の写し
2. 営業許可証の写し

リンク: 新規登録（URL未取得）

**その他分野**（`fields: ['accommodation', 'other']`）: 別途ご案内いたします。

### 取得書類一覧 — 個人事業主 × 初めて受け入れる（全8種類）

補足: 書類が揃い次第弊社大阪本社宛にご郵送ください。

| No | 書類 | 区分 | 請求先 | 備考 |
|---|---|---|---|---|
| 1 | 個人事業主の住民票の写し | 原本 | 市区町村役場 | マイナンバー記載なし・本籍地記載ありのものが必要です。 |
| 2 | ①労働保険の適用事業所の場合: 労働保険料等納付証明書（未納なし証明）<br>②労働保険の適用事業所でない場合: 労災保険に代わる民間保険の加入を証明する資料 | ①原本 ②写し | ①労働局 ②— | 納付や換価の猶予を受けている場合は、納付の猶予許可通知書又は換価の猶予許可通知書の写しも必要です。 |
| 3 | 個人事業主の納税証明書（その３） | 原本 | 税務署 | 該当税目: ①源泉所得税及び復興特別所得税 ②申告所得税及び復興特別所得税 ③消費税及び地方消費税 ④相続税 ⑤贈与税<br>納税の猶予又は納付受託の適用を受けている場合は、当該適用がある旨の記載がある納税証明書及び未納がある税目についての納税証明書（その１）も必要。 |
| 4 | 健康保険・厚生年金保険の適用事業所の場合: 社会保険料納入状況回答票 または直近24か月分の健康保険・厚生年金保険料領収証書の写し | 原本 又は 写し | 日本年金機構 又は 年金事務所 | 申請する月の前々月までの24か月分が必要です。 |
| 5 | 健康保険・厚生年金保険の適用事業所でない場合<br>①医療保険: マイナポータルの資格情報の写し又は資格確認書の写し、直近2年度分の国民健康保険料（税）納付証明書<br>②国民年金: 被保険者記録照会回答票 または直近24か月分の国民年金保険料領収証書の写し | ①写し／原本 ②原本 | ①市区町村役場 ②日本年金機構 | 保険者番号・基礎年金番号は必ずマスキング（黒塗り）してください。 |
| 6 | 直近2年度分の個人事業主の個人住民税の納税証明書 | 原本 | 市区町村役場 | 納税緩和措置（換価の猶予、納税の猶予又は納付受託）の適用を受けている場合で、当該適用を受けていることが納税証明書に記載されていないときは、当該適用に係る通知書の写しも必要です。 |
| 7 | [外食] 保健所長の営業許可証 / [宿泊] 旅館業許可証 | 写し | — | 就業する事業所全ての営業許可書が必要です。<br>有効期限内のものをご用意ください。 |
| 8 | 特定技能協議会加入証明書 | 写し | — | [介護分野の場合] 配属先事業所がご登録されているかご確認ください。 |

No.7 は `fields: ['food_service', 'accommodation']`。

### 取得書類一覧 — 法人 × 初めて受け入れる（全8種類）

| No | 書類 | 区分 | 請求先 | 備考 |
|---|---|---|---|---|
| 1 | 履歴事項全部証明書 | 原本 | 法務局 | — |
| 2 | 住民票（本籍地記載あり / マイナンバー記載無） | 原本 | 市区町村役場 | 業務執行に関与する役員 = 特定技能受け入れに関わる役員です。<br>代表者の住民票をご用意ください。ただし、書類作成責任者が代表者ではない役員の場合は書類作成責任者の住民票をご用意ください。 |
| 3 | 労働保険料等納付証明書 | 原本 | 労働局 | （資料に「詳細はこちら」リンクあり・URL未取得） |
| 4 | 税務署発行の納税証明書（その３）<br>税目は下記３つ全てが必要です。①源泉所得税及び復興特別所得税 ②法人税 ③消費税及び地方消費税 | 原本 | 税務署 / 国税庁 | 市税事業所ではない点にご注意ください。<br>（資料に「詳細はこちら」リンクあり・URL未取得） |
| 5 | ①社会保険料納入状況照会回答票 ②健康保険 / 厚生年金保険料領収証書 — ①②のいずれか | ①原本 ②写し | 年金機構 | 申請する月の前々月までの24か月分が必要です。<br>（資料に「詳細はこちら」リンクあり・URL未取得） |
| 6 | 法人住民税納税証明書 | 原本 | 市税事業所 | 直近1年度分が必要です。<br>社会福祉法人の場合不要です。 |
| 7 | [外食] 保健所長の営業許可証 / [宿泊] 旅館業許可証 | 写し | — | 就業する事業所全ての営業許可書が必要です。<br>有効期限内のものをご用意ください。 |
| 8 | 特定技能協議会加入証明書 | 写し | — | [介護分野の場合] 配属先事業所がご登録されているかご確認ください。 |

### 準備書類一覧 — 既に受け入れ済み（法人・個人事業主 共通、3種類）

セクション注記: 申請後、入管より追加で書類を提出するよう指示がある場合がございます。予めご了承ください。

| No | 書類 / 情報 | 備考 |
|---|---|---|
| 1 | 前回申請している書類一式 | 前回申請した書類のデータの送付または、添付のエクセルに情報をご入力ください。 |
| 2 | 特定技能協議会加入証明書 | 介護分野の場合、配属先事業所がご登録されているかご確認ください。<br>有効期限を確認し、写しをお送りください。 |
| 3 | [外食] 保健所長の営業許可証 / [宿泊] 旅館業許可証 | 写しをお送りください。就業する事業所全ての営業許可書が必要です。有効期限内のものをご用意ください。 |

### サンプル画像の一覧

個人事業主向け PDF（PDFページ 8–11 = スライド P06–P09）:

| sampleId | PDFページ | プリセット | 対応 No | タイトル | 注釈 |
|---|---|---|---|---|---|
| `sp-residence-certificate` | 8 | half-left | 1 | 住民票の写し（個人事業主） | 本籍地記載必須 |
| `sp-labor-insurance-certificate` | 8 | half-right | 2 | 労働保険料等納付証明書 | |
| `sp-tax-certificate-3` | 9 | half-left | 3 | 個人事業主の納税証明書（その３） | 下記「交付請求時のポイント」 |
| `sp-resident-tax-certificate` | 10 | full | 6 | 直近2年度分の個人住民税の納税証明書 | 市区町村により様式は異なります。直近2年度分（2枚）が必要です。 |
| `business-permit-food` | 11 | half-left | 7 | 営業許可証（外食） | |
| `business-permit-lodging` | 11 | half-right | 7 | 営業許可証（宿泊） | |

スライド P07（PDFページ 9）の右半分は「交付請求時のポイント」のテキストカードのため、画像として切り出さず `points` / `warning` に転記する。

`sp-tax-certificate-3` の `points`:

1. 証明書の種類は「その３の２」（個人事業主用）を選択
2. 基本の税目にチェック — 申告所得税及び復興特別所得税 / 消費税及び地方消費税
3. 「その他」欄に追記 — 源泉所得税及び復興特別所得税（記載漏れが多い項目です）/ 該当する場合のみ: 相続税・贈与税
4. 証明を受けようとする年度は直近のものを記入

`warning`: 「法人税」の項目は個人事業主には関係ありません。チェック不要です。
`caption`: 個人事業主の場合、「代表者氏名」欄は空欄のままで問題ありません。

法人向け PDF（PDFページ 8–13 = スライド P06–P11）:

| sampleId | PDFページ | プリセット | 対応 No | タイトル | 注釈 |
|---|---|---|---|---|---|
| `corp-registry` | 8 | half-left | 1 | 履歴事項全部証明書 | |
| `corp-residence-certificate` | 8 | half-right | 2 | 住民票の写し | 本籍地記載必須 |
| `corp-labor-insurance-certificate` | 9 | full | 3 | 労働保険料等納付証明書 | |
| `corp-tax-certificate-3` | 10 | half-left | 4 | 納税証明書その3 | |
| `corp-tax-certificate-3-form` | 10 | half-right | 4 | 納税証明書その3の請求書記入例 | その他の（ ）内は追記でご記入ください。 |
| `social-insurance-inquiry` | 11 | half-left | 5-① | 社会保険料納入状況照会回答票 | |
| `social-insurance-receipt` | 11 | half-right | 5-② | 健康保険 / 厚生年金保険料領収証書 | |
| `corp-resident-tax-certificate` | 12 | full | 6 | 法人住民税 納税証明書 | |

法人向け No.7（営業許可証）は個人事業主向け PDF のスライドと同一内容のため、`business-permit-food` / `business-permit-lodging` を共有し、法人向け PDF からは切り出さない。
サンプル画像は合計14枚。

## 画面仕様

### `/applications`（既存を拡張）

`lg` 以上で 2 カラム（メイン : 右カラム ≒ 2 : 1）、`lg` 未満では右カラムがメインの下へ回る。
右カラムは `lg:sticky lg:top-6`。

メインカラム（上から）:

1. ページヘッダー — 見出しは「申請ポータル」のまま、説明文を手続き案内寄りに変更
2. 「申請の流れ」カード — 貴社レーンのステップを横並び。末尾に `/applications/guide` への導線
3. 「最初にご確認ください」— 入口カード3枚
   - 申請手続きの流れ → `/applications/guide#flow`
   - 協議会への加入登録 → `/applications/guide#council`
   - 取得書類一覧（サンプル付き）→ `/applications/guide#documents`
4. 案件一覧テーブル — 現状のまま。案件0件のときの `EmptyState` も現状のまま

右カラム:

- 「書類の提出について」— アップロードは1ファイル10MBまで（`MAX_UPLOAD_BYTES`）、対応形式は PDF / JPG / PNG / WebP / HEIC、申請書類作成フォームのみ `.xlsx`（`checklist-table.tsx` の `accept` と一致させる）、原本は大阪本社へ郵送、書類有効期限は発行日から3ヶ月
- 「困ったときは」— 画面名・対象者名・お困りの内容を添えて Funtoco 担当者へ。`lib/funbase-faq.ts` と同じ言い回しに揃える

ご案内は権限で出し分けない（OP にも表示される）。

### `/applications/guide`（新規）

ページ本体は Server Component。`searchParams` と `listCases()` から表示条件を決め、`selectGuidance()` の結果をサーバー側でレンダリングする。
`selectGuidance` は DB を触らない純粋関数なので、切り替えのたびにクエリを変えてサーバーで描き直せばよく、
クライアントコンポーネントは切り替えトグル（`router.replace` でクエリを書き換えるだけ）とサンプルダイアログの2つに限定する。

- クエリ: `?entity=corporate|sole_proprietor` `&category=initial|renewal` `&field=care|food_service|accommodation|food_manufacturing|other`
- 表示条件の決定順: クエリ > 最新案件（`listCases()` の先頭）の `entityType` / `applicationCategory` / `field` > `corporate` × `initial` × field なし
- 不正な値のクエリは無視して次の優先順位にフォールバックする
- 切り替えは `router.replace`（`scroll: false`）。トグルのたびに履歴が積まれないようにする
- セクション: `#flow` 3レーン → `#council` 協議会 → `#documents` 取得書類（サンプルは Dialog）
- `field` が確定しているときは、協議会セクションでその分野を先頭に置き、営業許可証の行を分野に応じて出し入れする
- 3レーンは `lg` で3カラム、それ未満では「貴社 → Funtoco → 内定者」の順に縦積み

### `/applications/[caseId]`（既存を微修正）

`CaseProgressHeader` の下に「この案件のご案内を見る」リンクを1つ追加。
`entity` / `category` / `field` をクエリに載せて `/applications/guide` へ渡す。

## サンプル画像パイプライン

`scripts/extract-guidance-samples.sh` を追加する。

- 入力: ローカルの PDF 2 本（パスは引数、既定は `~/Downloads/`）
- 実装: `pdftoppm -r 150 -x -y -W -H -png` で各スライドから書類部分を切り出し、`sips -s format jpeg -s formatOptions 70 -Z 1200` で JPEG 化・長辺 1200px にリサイズ
- 出力: `public/guidance/samples/<sampleId>.jpg`
- PDF はコミットしない。生成された JPEG のみコミットする（1枚あたり約 180KB、全14枚で約 2.5MB）

切り出しは 150dpi のページ（1754 × 1241 px）に対する3プリセットで表現する。スライドはすべて 2-up か中央1点のため、これで全サンプルを賄える。

| プリセット | x | y | W | H | 出力実寸 |
|---|---|---|---|---|---|
| `half-left` | 0 | 170 | 877 | 1071 | 982 × 1200 |
| `half-right` | 877 | 170 | 877 | 1071 | 982 × 1200 |
| `full` | 0 | 170 | 1754 | 1071 | 1200 × 733 |

`y = 170` はスライド見出し「取得書類一覧サンプル」を落とし、書類名と No. を残す位置。
`pdftoppm` の領域指定と各プリセットの出力は実機で確認済み。

**`sips` は WebP を出力できない**（macOS 26 で `-s format webp` が失敗、`cwebp` も未インストール）ため JPEG を採用する。
`next.config.mjs` で `images.unoptimized: true` のため、`next/image` は実寸の `width` / `height` を渡して素の `img` として描画される。

前提: これらは元資料の時点でマスキング済みで、既にメール配布している内容のため `public/`（未認証アクセス可）に置いてよいものとする。認証を必須にする場合は API ルート経由の配信に変更する。

## テスト

`__tests__/portal-guidance.test.ts`（vitest）。対象は `selectGuidance` のみ。

- `sole_proprietor` × `initial` で書類が8件返る
- `corporate` × `initial` で書類が8件返り、No.1 が「履歴事項全部証明書」である
- `renewal` は entityType によらず3件返る
- `field: 'care'` のとき営業許可証（No.7）が落ちる
- `field: 'food_service'` のとき営業許可証が残る
- `field` 未指定のときは営業許可証を落とさない
- `field: 'care'` のとき協議会の先頭が介護になる
- `field: 'accommodation'` のとき協議会は「その他分野」を含む
- 押印ステップの注記が `corporate` では「法人印」、`sole_proprietor` では「実印又は認印」になる
- `initial` では協議会加入登録ステップ、`renewal` では協議会登録確認ステップが出る
- `documents` が参照する `sampleIds` がすべて `samples.ts` に存在する（参照切れ検出）

## 未決事項

1. **協議会の外部リンクURL**。PDF の各ページがラスタ画像でリンク注釈が埋め込まれておらず、URL を抽出できなかった。推測での記載は誤誘導になるため `links: []` で実装し、URL の提供を受けてから差し込む。同じ理由で法人向け書類 No.3 / No.4 / No.5 の「詳細はこちら」も保留。
2. **サイドバーへの導線**。`components/layout/sidebar.tsx` の申請ポータル項目はテスト期間中コメントアウトされている。本設計では触らない。

## 実装順序

1. `lib/portal/guidance/` のデータ層とテスト
2. `scripts/extract-guidance-samples.sh` と `public/guidance/samples/`
3. `/applications/guide` ページとセクションコンポーネント
4. `/applications` へのご案内ブロックと右カラム
5. `/applications/[caseId]` からの導線
