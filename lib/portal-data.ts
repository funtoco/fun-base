export type PortalRole = "company" | "ops"
export type CaseStatus = "書類準備中" | "審査中" | "修正対応中" | "申請準備完了"
export type Responsibility = "企業" | "運営" | "確認待ち"
export type DocumentStatus = "未提出" | "確認中" | "承認済み" | "要修正"

export interface PortalDocument {
  id: string
  name: string
  category: string
  status: DocumentStatus
  updatedAt: string
  version: number
  note?: string
}

export interface PortalTask {
  id: string
  title: string
  assignee: Responsibility
  due: string
  done: boolean
}

export interface PortalActivity {
  id: string
  title: string
  detail: string
  time: string
}

export interface PortalCase {
  id: string
  person: string
  romanName: string
  company: string
  visa: string
  status: CaseStatus
  responsibility: Responsibility
  progress: number
  deadline: string
  priority: "高" | "中" | "低"
  reason: string
  country: string
  tasks: PortalTask[]
  documents: PortalDocument[]
  activities: PortalActivity[]
}

export const initialCases: PortalCase[] = [
  {
    id: "FB-260701", person: "グエン・ヴァン・アン", romanName: "NGUYEN VAN AN", company: "株式会社青葉フーズ", visa: "技術・人文知識・国際業務", status: "修正対応中", responsibility: "企業", progress: 58, deadline: "2026-07-25", priority: "高", reason: "雇用理由書の修正版が本日締切", country: "ベトナム",
    tasks: [
      { id: "t1", title: "雇用理由書の修正", assignee: "企業", due: "7月23日", done: false },
      { id: "t2", title: "パスポート写しの確認", assignee: "運営", due: "7月24日", done: true },
      { id: "t3", title: "申請内容の最終確認", assignee: "確認待ち", due: "7月25日", done: false },
    ],
    documents: [
      { id: "d1", name: "雇用理由書", category: "企業書類", status: "要修正", updatedAt: "7月22日 16:40", version: 2, note: "業務内容と採用理由の関連を追記してください。" },
      { id: "d2", name: "パスポート写し", category: "本人書類", status: "承認済み", updatedAt: "7月21日 11:20", version: 1 },
      { id: "d3", name: "履歴書", category: "本人書類", status: "確認中", updatedAt: "7月22日 09:10", version: 1 },
    ],
    activities: [
      { id: "a1", title: "修正依頼を送信", detail: "雇用理由書 v2 にコメントしました", time: "7月22日 16:42" },
      { id: "a2", title: "書類を承認", detail: "パスポート写しを承認しました", time: "7月21日 13:05" },
    ],
  },
  {
    id: "FB-260708", person: "マリア・サントス", romanName: "MARIA SANTOS", company: "東都ケアサービス株式会社", visa: "特定技能1号", status: "審査中", responsibility: "運営", progress: 76, deadline: "2026-07-29", priority: "中", reason: "本日新規書類が3件提出されました", country: "フィリピン",
    tasks: [
      { id: "t4", title: "支援計画書の確認", assignee: "運営", due: "7月24日", done: false },
      { id: "t5", title: "健康診断書の提出", assignee: "企業", due: "7月27日", done: true },
    ],
    documents: [
      { id: "d4", name: "1号特定技能外国人支援計画書", category: "支援書類", status: "確認中", updatedAt: "7月23日 09:12", version: 1 },
      { id: "d5", name: "健康診断書", category: "本人書類", status: "確認中", updatedAt: "7月23日 09:08", version: 1 },
    ],
    activities: [{ id: "a3", title: "書類を提出", detail: "企業担当者が3件の書類を提出しました", time: "7月23日 09:12" }],
  },
  {
    id: "FB-260715", person: "ラジ・クマール", romanName: "RAJ KUMAR", company: "北斗テクノロジー合同会社", visa: "高度専門職1号ロ", status: "書類準備中", responsibility: "企業", progress: 32, deadline: "2026-08-05", priority: "低", reason: "不足書類2件・期限まで余裕あり", country: "インド",
    tasks: [
      { id: "t6", title: "卒業証明書の提出", assignee: "企業", due: "7月30日", done: false },
      { id: "t7", title: "ポイント計算表の作成", assignee: "運営", due: "8月1日", done: false },
    ],
    documents: [
      { id: "d6", name: "卒業証明書", category: "本人書類", status: "未提出", updatedAt: "—", version: 0 },
      { id: "d7", name: "雇用契約書", category: "企業書類", status: "承認済み", updatedAt: "7月20日 14:30", version: 1 },
    ],
    activities: [{ id: "a4", title: "案件を作成", detail: "必要書類リストを生成しました", time: "7月15日 10:00" }],
  },
]

export const statusTone: Record<string, string> = {
  "書類準備中": "bg-secondary text-secondary-foreground",
  "審査中": "bg-primary/10 text-primary",
  "修正対応中": "bg-amber-100 text-amber-900",
  "申請準備完了": "bg-primary text-primary-foreground",
  "未提出": "bg-muted text-muted-foreground",
  "確認中": "bg-primary/10 text-primary",
  "承認済み": "bg-secondary text-secondary-foreground",
  "要修正": "bg-amber-100 text-amber-900",
  "企業": "bg-amber-100 text-amber-900",
  "運営": "bg-primary/10 text-primary",
  "確認待ち": "bg-muted text-muted-foreground",
}
