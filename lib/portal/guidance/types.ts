// ご案内資料（在留資格申請手続きのご案内）をデータとして持つための型。
// DB 由来の型は lib/portal/types.ts をそのまま使う。

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
  /** 一覧ページの横並び表示で使う短縮名。未指定なら title を使う。 */
  shortTitle?: string
  description?: string
  note?: FlowNote
  /** 未指定なら全 entityType に出す */
  entityTypes?: EntityType[]
  /** 未指定なら全 applicationCategory に出す */
  categories?: ApplicationCategory[]
}

export interface CouncilRequiredDocumentGroup {
  heading?: string
  items: string[]
}

export interface CouncilGuide {
  id: string
  label: string
  fields: Field[]
  /** 申し込み方法。空配列なら steps を出さず description だけ出す。 */
  steps: string[]
  requiredDocuments: CouncilRequiredDocumentGroup[]
  links: { label: string; url: string }[]
  /** 手順が用意されていない分野向けの一文 */
  description?: string
}

export interface RequiredDocument {
  no: number
  name: string
  /** 「原本」「写し」「原本 又は 写し」など資料の表記をそのまま持つ */
  copyType: string
  issuer: string | null
  notes: string[]
  /** 未指定なら全分野。営業許可証のように分野限定のものだけ指定する。 */
  fields?: Field[]
  sampleIds?: string[]
}

export interface DocumentSample {
  id: string
  title: string
  src: string
  /** next/image に渡す実寸。切り出しプリセットで決まる。 */
  width: number
  height: number
  caption?: string
  /** 「交付請求時のポイント」のような手順 */
  points?: string[]
  warning?: string
}

export interface GuidanceCondition {
  entityType: EntityType
  category: ApplicationCategory
  field: Field | null
}

export interface Guidance extends GuidanceCondition {
  flow: Record<FlowLane, FlowStep[]>
  councils: CouncilGuide[]
  documents: RequiredDocument[]
  samples: DocumentSample[]
}
