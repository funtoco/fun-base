export type Person = {
  id: string
  name: string
  kana?: string
  nationality?: string
  dob?: string
  specificSkillField?: string
  phone?: string
  employeeNumber?: string
  workingStatus?: string
  residenceCardNo?: string
  residenceCardExpiryDate?: string
  residenceCardIssuedDate?: string
  email?: string
  address?: string
  tenantName?: string
  company?: string
  note?: string
  visaId?: string
  externalId?: string
  imagePath?: string
  createdAt: string
  updatedAt: string
}

export type VisaStatus =
  | "書類準備中"
  | "書類作成中"
  | "書類確認中"
  | "申請準備中"
  | "ビザ申請準備中"
  | "申請中"
  | "ビザ取得済み"

export type Visa = {
  id: string
  personId: string
  status: VisaStatus
  type: "認定申請" | "変更申請" | "更新申請" | "特定活動申請" | "資格変更（特定技能2号）"
  expiryDate?: string
  submittedAt?: string
  resultAt?: string
  manager?: string
  updatedAt: string
  // Status history dates
  documentPreparationDate?: string
  documentCreationDate?: string
  documentConfirmationDate?: string
  applicationPreparationDate?: string
  visaApplicationPreparationDate?: string
  applicationDate?: string
  additionalDocumentsDate?: string
  visaAcquiredDate?: string
}

export type MeetingNote = {
  section: string
  item: string
  level?: "大" | "中" | "小"
  detail?: string
}

export type Meeting = {
  id: string
  personId: string
  kind: "仕事" | "プライベート"
  title: string
  datetime: string
  durationMin?: number
  attendees?: string[]
  createdBy?: string
  notes: MeetingNote[]
  createdAt: string
  updatedAt: string
}

export type SupportAction = {
  id: string
  personId: string
  category:
    | "銀行対応"
    | "水道"
    | "電気"
    | "ガス"
    | "住民票"
    | "SIM/ネット"
    | "病院"
    | "試験申込"
    | "送金"
    | "交通/IC"
    | "パスポート"
    | "ビザ更新"
    | "年末調整"
    | "住居"
    | "退職後"
    | "その他"
    | string
  title: string
  detail?: string
  status: "open" | "in_progress" | "done"
  assignee?: string
  due?: string
  createdAt: string
  updatedAt: string
}

export type ActivityItem = {
  id: string
  type: "meeting" | "visa" | "support"
  title: string
  personName: string
  datetime: string
  status?: string
  link: string
}

export type Company = {
  id: string
  name: string
  isActive: boolean
}

export type DocumentType = 'passport_front' | 'passport_back' | 'residence_card_front' | 'residence_card_back'

export type PersonDocument = {
  id: string
  personId: string
  tenantId: string
  documentType: DocumentType
  storagePath: string
  fileName?: string
  contentType?: string
  fileSizeBytes?: number
  uploadedBy?: string
  createdAt: string
  updatedAt: string
}
