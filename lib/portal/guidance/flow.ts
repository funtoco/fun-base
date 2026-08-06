import type { FlowStep } from './types'

// 「在留資格申請手続きの流れ」（ご案内資料 P01）をデータ化したもの。
// 配列の順序がそのまま表示順になる。
export const FLOW_STEPS: FlowStep[] = [
  {
    id: 'company-prepare-initial-corporate',
    lane: 'company',
    title: '書類の作成 / 準備',
    shortTitle: '書類の準備',
    description: '法人書類をご取得ください。揃い次第 Funtoco 大阪本社宛にご郵送ください。',
    note: { tone: 'warning', body: '書類有効期限は発行日から3ヶ月です。' },
    entityTypes: ['corporate'],
    categories: ['initial'],
  },
  {
    id: 'company-prepare-initial-sole',
    lane: 'company',
    title: '書類の作成 / 準備',
    shortTitle: '書類の準備',
    description:
      '個人事業主として必要な書類をご取得ください。揃い次第 Funtoco 大阪本社宛にご郵送ください。',
    note: { tone: 'warning', body: '書類有効期限は発行日から3ヶ月です。' },
    entityTypes: ['sole_proprietor'],
    categories: ['initial'],
  },
  {
    id: 'company-prepare-renewal',
    lane: 'company',
    title: '書類の準備',
    shortTitle: '書類の準備',
    description: '前回申請している書類一式などをご準備ください。',
    categories: ['renewal'],
  },
  {
    id: 'company-council-join',
    lane: 'company',
    title: '協議会加入登録 / 入会申請',
    shortTitle: '協議会登録',
    description: '分野ごとの協議会へ加入し、加入証明書を取得します。',
    categories: ['initial'],
  },
  {
    id: 'company-council-check',
    lane: 'company',
    title: '協議会登録確認（配属事業所の登録）',
    shortTitle: '協議会確認',
    description: '配属先事業所が協議会に登録されているかご確認ください。',
    categories: ['renewal'],
  },
  {
    id: 'company-review',
    lane: 'company',
    title: '確認・内容修正 / 承諾',
    shortTitle: '内容の確認',
    description: 'Funtoco からお送りする修正提案をご確認ください。',
  },
  {
    id: 'company-seal-corporate',
    lane: 'company',
    title: '書類への押印対応 / 返送',
    shortTitle: '押印・返送',
    note: {
      tone: 'warning',
      body: '法人印押印のうえ、弊社大阪本社宛にご返送ください。',
    },
    entityTypes: ['corporate'],
  },
  {
    id: 'company-seal-sole',
    lane: 'company',
    title: '書類への押印対応 / 返送',
    shortTitle: '押印・返送',
    note: {
      tone: 'warning',
      body: '押印（実印又は認印）のうえ、弊社大阪本社宛にご返送ください。',
    },
    entityTypes: ['sole_proprietor'],
  },
  {
    id: 'company-interview',
    lane: 'company',
    title: '行政書士と申請内容確認面談',
    shortTitle: '確認面談',
  },
  {
    id: 'funtoco-review',
    lane: 'funtoco',
    title: '確認 / 修正提案',
    note: {
      tone: 'info',
      body: '入管で審査がスムーズになるよう、メールで内容のすり合わせをいたします。変更点あればご教示くださいませ。',
    },
  },
  {
    id: 'funtoco-send-seal',
    lane: 'funtoco',
    title: '押印書類郵送',
  },
  {
    id: 'funtoco-send-signature',
    lane: 'funtoco',
    title: '本人サイン書類準備 / 送付',
  },
  {
    id: 'funtoco-precheck',
    lane: 'funtoco',
    title: '申請に向けた事前確認',
  },
  {
    id: 'funtoco-submit',
    lane: 'funtoco',
    title: '行政書士による申請手続き',
  },
  {
    id: 'funtoco-result',
    lane: 'funtoco',
    title: '申請結果の共有（行政書士からの連絡に基づき）',
    note: {
      tone: 'warning',
      body: '審査中、出入国在留管理局からの指示により、必要に応じ追加 / 修正の対応を行います。',
    },
  },
  {
    id: 'candidate-documents',
    lane: 'candidate',
    title: '本人取得書類準備',
  },
  {
    id: 'candidate-sign',
    lane: 'candidate',
    title: '本人サイン / 返送',
  },
  {
    id: 'candidate-interview',
    lane: 'candidate',
    title: '行政書士と申請内容確認面談',
  },
]

export const FLOW_LANE_LABELS: Record<FlowStep['lane'], string> = {
  company: '貴社にご対応いただくこと',
  funtoco: 'Funtoco が行うこと',
  candidate: '内定者ご本人が行うこと',
}
