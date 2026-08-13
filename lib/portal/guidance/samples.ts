import type { DocumentSample } from './types'

// 「取得書類一覧サンプル」（ご案内資料 P06 以降）の画像メタ。
// 画像は scripts/extract-guidance-samples.sh で生成する。
// 実寸は切り出しプリセットで決まる: half = 982 × 1200 / full = 1200 × 733

const HALF = { width: 982, height: 1200 } as const
const FULL = { width: 1200, height: 733 } as const

function src(id: string): string {
  return `/guidance/samples/${id}.jpg`
}

export const DOCUMENT_SAMPLES: Record<string, DocumentSample> = {
  'sp-residence-certificate': {
    id: 'sp-residence-certificate',
    title: '住民票の写し（個人事業主）',
    src: src('sp-residence-certificate'),
    ...HALF,
    caption: '本籍地の記載が必須です。マイナンバーは記載なしのものをご用意ください。',
  },
  'sp-labor-insurance-certificate': {
    id: 'sp-labor-insurance-certificate',
    title: '労働保険料等納付証明書',
    src: src('sp-labor-insurance-certificate'),
    ...HALF,
  },
  'sp-tax-certificate-3': {
    id: 'sp-tax-certificate-3',
    title: '個人事業主の納税証明書（その３）',
    src: src('sp-tax-certificate-3'),
    ...HALF,
    caption:
      '個人事業主の場合、「代表者氏名」欄は空欄のままで問題ありません。交付請求書の証明書の種類は「その３の２」（個人事業主用）を選択します。',
    points: [
      '証明書の種類は「その３の２」（個人事業主用）を選択',
      '基本の税目にチェック — 申告所得税及び復興特別所得税 / 消費税及び地方消費税',
      '「その他」欄に追記 — 源泉所得税及び復興特別所得税（記載漏れが多い項目です）、該当する場合のみ相続税・贈与税',
      '証明を受けようとする年度は直近のものを記入',
    ],
    warning: '「法人税」の項目は個人事業主には関係ありません。チェック不要です。',
  },
  'sp-resident-tax-certificate': {
    id: 'sp-resident-tax-certificate',
    title: '直近2年度分の個人住民税の納税証明書',
    src: src('sp-resident-tax-certificate'),
    ...FULL,
    caption:
      '市区町村により様式は異なります。上記はイメージです。直近2年度分（2枚）が必要です。',
  },
  'business-permit-food': {
    id: 'business-permit-food',
    title: '営業許可証（外食）',
    src: src('business-permit-food'),
    ...HALF,
  },
  'business-permit-lodging': {
    id: 'business-permit-lodging',
    title: '営業許可証（宿泊）',
    src: src('business-permit-lodging'),
    ...HALF,
  },
  'corp-registry': {
    id: 'corp-registry',
    title: '履歴事項全部証明書',
    src: src('corp-registry'),
    ...HALF,
  },
  'corp-residence-certificate': {
    id: 'corp-residence-certificate',
    title: '住民票の写し',
    src: src('corp-residence-certificate'),
    ...HALF,
    caption: '本籍地の記載が必須です。マイナンバーは記載なしのものをご用意ください。',
  },
  'corp-labor-insurance-certificate': {
    id: 'corp-labor-insurance-certificate',
    title: '労働保険料等納付証明書',
    src: src('corp-labor-insurance-certificate'),
    ...FULL,
  },
  'corp-tax-certificate-3': {
    id: 'corp-tax-certificate-3',
    title: '納税証明書（その３）',
    src: src('corp-tax-certificate-3'),
    ...HALF,
  },
  'corp-tax-certificate-3-form': {
    id: 'corp-tax-certificate-3-form',
    title: '納税証明書（その３）の請求書記入例',
    src: src('corp-tax-certificate-3-form'),
    ...HALF,
    caption: '「その他」の（ ）内は追記でご記入ください。',
  },
  'social-insurance-inquiry': {
    id: 'social-insurance-inquiry',
    title: '社会保険料納入状況照会回答票',
    src: src('social-insurance-inquiry'),
    ...HALF,
  },
  'social-insurance-receipt': {
    id: 'social-insurance-receipt',
    title: '健康保険 / 厚生年金保険料領収証書',
    src: src('social-insurance-receipt'),
    ...HALF,
  },
  'corp-resident-tax-certificate': {
    id: 'corp-resident-tax-certificate',
    title: '法人住民税 納税証明書',
    src: src('corp-resident-tax-certificate'),
    ...FULL,
  },
}
