import type { ApplicationCategory, EntityType } from '@/lib/portal/types'
import type { RequiredDocument } from './types'

// 「取得書類一覧」「準備書類一覧」（ご案内資料 P03-P05）をデータ化したもの。

export const DOCUMENTS_INTRO_INITIAL =
  '書類が揃い次第、Funtoco 大阪本社宛にご郵送ください。'

export const DOCUMENTS_INTRO_RENEWAL =
  '申請後、入管より追加で書類を提出するよう指示がある場合がございます。予めご了承ください。'

const BUSINESS_PERMIT: RequiredDocument = {
  no: 7,
  name: '[外食] 保健所長の営業許可証 / [宿泊] 旅館業許可証',
  copyType: '写し',
  issuer: null,
  notes: [
    '就業する事業所全ての営業許可書が必要です。',
    '有効期限内のものをご用意ください。',
  ],
  fields: ['food_service', 'accommodation'],
  sampleIds: ['business-permit-food', 'business-permit-lodging'],
}

const COUNCIL_CERTIFICATE: RequiredDocument = {
  no: 8,
  name: '特定技能協議会加入証明書',
  copyType: '写し',
  issuer: null,
  notes: ['[介護分野の場合] 配属先事業所がご登録されているかご確認ください。'],
}

const SOLE_PROPRIETOR_INITIAL: RequiredDocument[] = [
  {
    no: 1,
    name: '個人事業主の住民票の写し',
    copyType: '原本',
    issuer: '市区町村役場',
    notes: ['マイナンバー記載なし・本籍地記載ありのものが必要です。'],
    sampleIds: ['sp-residence-certificate'],
  },
  {
    no: 2,
    name: '①労働保険の適用事業所の場合: 労働保険料等納付証明書（未納なし証明）\n②労働保険の適用事業所でない場合: 労災保険に代わる民間保険の加入を証明する資料',
    copyType: '①原本 ②写し',
    issuer: '①労働局 ②—',
    notes: [
      '納付や換価の猶予を受けている場合は、納付の猶予許可通知書又は換価の猶予許可通知書の写しも必要です。',
    ],
    sampleIds: ['sp-labor-insurance-certificate'],
  },
  {
    no: 3,
    name: '個人事業主の納税証明書（その３）',
    copyType: '原本',
    issuer: '税務署',
    notes: [
      '該当税目: ①源泉所得税及び復興特別所得税 ②申告所得税及び復興特別所得税 ③消費税及び地方消費税 ④相続税 ⑤贈与税',
      '納税の猶予又は納付受託の適用を受けている場合は、当該適用がある旨の記載がある納税証明書及び未納がある税目についての納税証明書（その１）も必要です。',
    ],
    sampleIds: ['sp-tax-certificate-3'],
  },
  {
    no: 4,
    name: '健康保険・厚生年金保険の適用事業所の場合: 社会保険料納入状況回答票 または直近24か月分の健康保険・厚生年金保険料領収証書の写し',
    copyType: '原本 又は 写し',
    issuer: '日本年金機構 又は 年金事務所',
    notes: ['申請する月の前々月までの24か月分が必要です。'],
  },
  {
    no: 5,
    name: '健康保険・厚生年金保険の適用事業所でない場合\n①医療保険: マイナポータルの資格情報の写し又は資格確認書の写し、直近2年度分の国民健康保険料（税）納付証明書\n②国民年金: 被保険者記録照会回答票 または直近24か月分の国民年金保険料領収証書の写し',
    copyType: '①写し／原本 ②原本',
    issuer: '①市区町村役場 ②日本年金機構',
    notes: ['保険者番号・基礎年金番号は必ずマスキング（黒塗り）してください。'],
  },
  {
    no: 6,
    name: '直近2年度分の個人事業主の個人住民税の納税証明書',
    copyType: '原本',
    issuer: '市区町村役場',
    notes: [
      '納税緩和措置（換価の猶予、納税の猶予又は納付受託）の適用を受けている場合で、当該適用を受けていることが納税証明書に記載されていないときは、当該適用に係る通知書の写しも必要です。',
    ],
    sampleIds: ['sp-resident-tax-certificate'],
  },
  BUSINESS_PERMIT,
  COUNCIL_CERTIFICATE,
]

const CORPORATE_INITIAL: RequiredDocument[] = [
  {
    no: 1,
    name: '履歴事項全部証明書',
    copyType: '原本',
    issuer: '法務局',
    notes: [],
    sampleIds: ['corp-registry'],
  },
  {
    no: 2,
    name: '住民票（本籍地記載あり / マイナンバー記載無）',
    copyType: '原本',
    issuer: '市区町村役場',
    notes: [
      '業務執行に関与する役員 = 特定技能受け入れに関わる役員です。',
      '代表者の住民票をご用意ください。ただし、書類作成責任者が代表者ではない役員の場合は、書類作成責任者の住民票をご用意ください。',
    ],
    sampleIds: ['corp-residence-certificate'],
  },
  {
    no: 3,
    name: '労働保険料等納付証明書',
    copyType: '原本',
    issuer: '労働局',
    notes: [],
    sampleIds: ['corp-labor-insurance-certificate'],
  },
  {
    no: 4,
    name: '税務署発行の納税証明書（その３）\n税目は下記3つ全てが必要です。①源泉所得税及び復興特別所得税 ②法人税 ③消費税及び地方消費税',
    copyType: '原本',
    issuer: '税務署 / 国税庁',
    notes: ['市税事業所ではない点にご注意ください。'],
    sampleIds: ['corp-tax-certificate-3', 'corp-tax-certificate-3-form'],
  },
  {
    no: 5,
    name: '①社会保険料納入状況照会回答票 ②健康保険 / 厚生年金保険料領収証書（①②のいずれか）',
    copyType: '①原本 ②写し',
    issuer: '年金機構',
    notes: ['申請する月の前々月までの24か月分が必要です。'],
    sampleIds: ['social-insurance-inquiry', 'social-insurance-receipt'],
  },
  {
    no: 6,
    name: '法人住民税納税証明書',
    copyType: '原本',
    issuer: '市税事業所',
    notes: ['直近1年度分が必要です。', '社会福祉法人の場合は不要です。'],
    sampleIds: ['corp-resident-tax-certificate'],
  },
  BUSINESS_PERMIT,
  COUNCIL_CERTIFICATE,
]

const RENEWAL: RequiredDocument[] = [
  {
    no: 1,
    name: '前回申請している書類一式',
    copyType: '—',
    issuer: null,
    notes: [
      '前回申請した書類のデータの送付、または添付のエクセルに情報をご入力ください。',
    ],
  },
  {
    no: 2,
    name: '特定技能協議会加入証明書',
    copyType: '写し',
    issuer: null,
    notes: [
      '介護分野の場合、配属先事業所がご登録されているかご確認ください。',
      '有効期限を確認し、写しをお送りください。',
    ],
  },
  {
    no: 3,
    name: '[外食] 保健所長の営業許可証 / [宿泊] 旅館業許可証',
    copyType: '写し',
    issuer: null,
    notes: [
      '写しをお送りください。就業する事業所全ての営業許可書が必要です。',
      '有効期限内のものをご用意ください。',
    ],
    fields: ['food_service', 'accommodation'],
    sampleIds: ['business-permit-food', 'business-permit-lodging'],
  },
]

export const DOCUMENTS: Record<
  `${EntityType}:${ApplicationCategory}`,
  RequiredDocument[]
> = {
  'sole_proprietor:initial': SOLE_PROPRIETOR_INITIAL,
  'corporate:initial': CORPORATE_INITIAL,
  'sole_proprietor:renewal': RENEWAL,
  'corporate:renewal': RENEWAL,
}
