// フェーズ1スキーマ（visa_application_cases ほか）に一致するポータル用の型。

export type EntityType = 'corporate' | 'sole_proprietor'
export type ApplicationCategory = 'initial' | 'renewal'
export type Field =
  | 'care'
  | 'food_service'
  | 'accommodation'
  | 'food_manufacturing'
  | 'other'
export type CaseStatus =
  | 'draft'
  | 'collecting'
  | 'reviewing'
  | 'ready'
  | 'synced'
  | 'completed'
  | 'archived'
export type RequirementScope = 'office' | 'person'
export type CopyType = 'original' | 'copy'
export type RequirementStatus =
  | 'not_submitted'
  | 'reviewing'
  | 'approved'
  | 'needs_fix'

// 新規案件作成でユーザーが選べる事業所（アクセス可能なもの）
export interface AccessibleOffice {
  id: string
  tenantId: string
  tenantName: string | null
  name: string
}

// 案件に紐づく人材
export interface CaseMember {
  id: string
  caseId: string
  personId: string
  visaId: string | null
  personName: string | null
  createdAt: string
}

// 案件（一覧・詳細共通のコア）
export interface VisaApplicationCase {
  id: string
  tenantId: string
  tenantOfficeId: string
  officeName: string | null
  entityType: EntityType
  applicationCategory: ApplicationCategory
  field: Field
  applicationType: string | null
  managementNumber: string | null
  status: CaseStatus
  title: string | null
  note: string | null
  createdAt: string
  updatedAt: string
}

// 案件詳細（メンバー込み）
export interface CaseDetail extends VisaApplicationCase {
  members: CaseMember[]
}

// 必要書類チェックリスト1行
export interface CaseDocumentRequirement {
  id: string
  caseId: string
  documentCode: string
  name: string
  scope: RequirementScope
  personId: string | null
  isRequired: boolean
  copyType: CopyType | null
  issuer: string | null
  validityMonths: number | null
  status: RequirementStatus
  sortOrder: number
}

// 人材ごとにまとめた person 書類グループ
export interface PersonRequirementGroup {
  personId: string
  personName: string | null
  items: CaseDocumentRequirement[]
}

// office / person にグループ化した要件
export interface GroupedRequirements {
  office: CaseDocumentRequirement[]
  persons: PersonRequirementGroup[]
}

// 日本語ラベル（画面表示用）
export const ENTITY_TYPE_LABELS: Record<EntityType, string> = {
  corporate: '法人',
  sole_proprietor: '個人事業主',
}

export const APPLICATION_CATEGORY_LABELS: Record<ApplicationCategory, string> = {
  initial: '初回',
  renewal: '更新',
}

export const FIELD_LABELS: Record<Field, string> = {
  care: '介護',
  food_service: '外食業',
  accommodation: '宿泊',
  food_manufacturing: '飲食料品製造業',
  other: 'その他',
}

export const CASE_STATUS_LABELS: Record<CaseStatus, string> = {
  draft: '下書き',
  collecting: '書類収集中',
  reviewing: '確認中',
  ready: '申請準備完了',
  synced: '連携済み',
  completed: '完了',
  archived: 'アーカイブ',
}

export const REQUIREMENT_STATUS_LABELS: Record<RequirementStatus, string> = {
  not_submitted: '未提出',
  reviewing: '確認中',
  approved: '承認済み',
  needs_fix: '要修正',
}

export const COPY_TYPE_LABELS: Record<CopyType, string> = {
  original: '原本',
  copy: '写し',
}

// 申請の流れ（Stepper 表示順）。archived は途中経路ではないため除外。
export const CASE_FLOW_STEPS: CaseStatus[] = [
  'draft',
  'collecting',
  'reviewing',
  'ready',
  'synced',
  'completed',
]
