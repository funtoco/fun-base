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
  employmentNotificationDate?: string
  employmentChangeNotificationDate?: string
  // 入社前
  interviewDate?: string
  jobOfferDate?: string
  applicationNumber?: string
  departureProcedureStatus?: string
  entryConfirmedDate?: string
  myNumber?: string
  // 入社後
  joiningDate?: string
  // 社会保険／雇用保険
  insuranceNumber?: string
  insuranceAcquiredDate?: string
  insuranceEnrollmentStatus?: Record<string, boolean>
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
  receptionNumber?: string
  receptionDate?: string
  receptionApplicationNumber?: string
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

export type Announcement = {
  id: string
  title: string
  body: string
  published: boolean
  createdBy?: string
  createdAt: string
  updatedAt: string
}

export type AnnouncementRead = {
  id: string
  announcementId: string
  userId: string
  readAt: string
}

export type DocumentType = 'passport_front' | 'passport_back' | 'residence_card_front' | 'residence_card_back' | 'coe_copy' | 'flight_ticket_copy' | 'bank_card_copy' | 'resident_card_copy' | 'resume' | 'designation_document'

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

// Kintone App 98: 就労_面談記録 types
export type InterviewRecordType = "定期面談" | "日々の面談" | "家族面談"

export type InterviewMethod = "対面" | "電話" | "ビデオ通話" | "チャット" | "その他"

export type InterviewStatus = "下書き" | "完了" | "確認待ち" | "承認済み"

// tableStorageDaily parsed structure
export type DailySupportEntry = {
  dai: string // 大分類
  chu: string // 中分類
  shou: string // 小分類
  notes?: string // 備考
}

// Regular Interview Record (定期面談) - main content is 企業提出用レポート
export type RegularInterview = {
  id: string
  kintoneRecordId?: string
  personId: string // HRID
  personName: string
  nickName?: string
  companyId?: string // COID
  companyName?: string
  interviewDate: string
  startTime?: string
  endTime?: string
  targetQuarter?: string // 対象四半期
  interviewDuration?: number // timeInterview in minutes
  interviewMethod?: InterviewMethod
  interviewPlace?: string
  supportStaffName?: string // 支援担当者
  salesStaffName?: string // 営業担当者
  funtocoStaff?: string
  status: InterviewStatus
  // Main content for 定期面談
  companyReport: string // 企業提出用レポート
  // Secondary (internal notes)
  internalNotes?: string // interview field - keep secondary
  createdAt: string
  updatedAt: string
}

// Daily Support Record (日々の面談) - main content is tableStorageDaily
export type DailySupportRecord = {
  id: string
  kintoneRecordId?: string
  personId: string // HRID
  personName: string
  nickName?: string
  companyId?: string // COID
  companyName?: string
  supportDate: string // interviewDate
  startTime?: string
  endTime?: string
  supportStaffName?: string // 支援担当者
  status: InterviewStatus
  // Main content for 日々の面談
  dailyEntries: DailySupportEntry[] // parsed tableStorageDaily
  // Secondary (internal notes)
  internalNotes?: string
  createdAt: string
  updatedAt: string
}

// Combined timeline item type for mixed activities
export type TimelineActivityType = "visa" | "meeting" | "regular_interview" | "daily_support"

export type EnhancedActivityItem = {
  id: string
  type: TimelineActivityType
  title: string
  personId: string
  personName: string
  companyName?: string
  datetime: string
  status?: string
  link: string
  metadata?: Record<string, string | number | undefined>
}
