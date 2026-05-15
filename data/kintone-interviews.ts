import type { RegularInterview, DailySupportRecord, DailySupportEntry, InterviewStatus, InterviewMethod } from "@/lib/models"

// Sample 企業提出用レポート content
const sampleCompanyReports = [
  `【面談概要】
本人の勤務状況は良好で、業務への適応も順調に進んでいる。
日本語でのコミュニケーション能力も向上しており、同僚との関係も良好。

【健康状態】
健康状態は良好。睡眠時間も確保できており、体調管理ができている。

【今後の課題・支援内容】
引き続き日本語学習のサポートを継続。JLPT N3受験に向けた準備を進める。`,
  `【面談概要】
業務遂行状況は問題なく、指示された作業を正確にこなしている。
職場環境にも慣れ、自発的に質問や提案ができるようになってきた。

【生活状況】
住居環境は安定している。近隣住民とのトラブルもなく、生活リズムも整っている。

【今後の支援計画】
在留資格更新に向けた書類準備のサポートを行う。`,
  `【面談概要】
今四半期は特に大きな問題なく過ごせている。
仕事面では新しい業務にも積極的に取り組んでいる。

【メンタル面】
精神的にも安定しており、ストレス管理もできている様子。
家族との連絡も定期的に取れている。

【次回面談に向けて】
資格試験の申込みサポートと、キャリアプランについて相談予定。`,
]

// Sample tableStorageDaily entries
const sampleDailyCategories: { dai: string; chu: string; shou: string }[] = [
  { dai: "生活支援", chu: "住居関連", shou: "引越し手続き" },
  { dai: "生活支援", chu: "住居関連", shou: "不動産会社連絡" },
  { dai: "生活支援", chu: "行政手続き", shou: "住民票取得" },
  { dai: "生活支援", chu: "行政手続き", shou: "マイナンバー申請" },
  { dai: "生活支援", chu: "銀行・送金", shou: "口座開設" },
  { dai: "生活支援", chu: "銀行・送金", shou: "海外送金手続き" },
  { dai: "生活支援", chu: "医療", shou: "病院予約" },
  { dai: "生活支援", chu: "医療", shou: "診察同行" },
  { dai: "就労支援", chu: "職場対応", shou: "上司への連絡" },
  { dai: "就労支援", chu: "職場対応", shou: "シフト調整" },
  { dai: "就労支援", chu: "キャリア", shou: "資格取得相談" },
  { dai: "就労支援", chu: "キャリア", shou: "転職相談" },
  { dai: "ビザ関連", chu: "書類準備", shou: "必要書類確認" },
  { dai: "ビザ関連", chu: "書類準備", shou: "申請書作成" },
  { dai: "ビザ関連", chu: "入管対応", shou: "申請同行" },
  { dai: "その他", chu: "通訳", shou: "電話通訳" },
  { dai: "その他", chu: "通訳", shou: "対面通訳" },
  { dai: "その他", chu: "相談", shou: "生活相談" },
]

const sampleNotes = [
  "対応完了。特に問題なし。",
  "継続対応中。来週フォローアップ予定。",
  "本人より感謝の言葉あり。",
  "企業担当者にも報告済み。",
  "追加書類が必要。本人に連絡済み。",
  "予約完了。日時を本人に連絡。",
  "",
]

const supportStaff = ["田中", "佐藤", "鈴木", "高橋", "渡辺", "山田", "伊藤"]
const salesStaff = ["営業A", "営業B", "営業C"]
const companies = [
  { id: "c001", name: "株式会社ABC製造" },
  { id: "c002", name: "丸山食品株式会社" },
  { id: "c003", name: "東京建設株式会社" },
  { id: "c004", name: "関西物流センター" },
  { id: "c005", name: "九州農業協同組合" },
]
const people = [
  { id: "p001", name: "RENO MAULY ADINUGRAHA", nickName: "レノ" },
  { id: "p002", name: "Raffi Test", nickName: "ラフィ" },
  { id: "p003", name: "TEST WAKABA NAKAMURA", nickName: "わかば" },
  { id: "p004", name: "NGUYEN VAN MINH", nickName: "ミン" },
  { id: "p005", name: "CHEN WEI MING", nickName: "ウェイ" },
  { id: "p006", name: "PARK JI HOON", nickName: "ジフン" },
  { id: "p007", name: "MARIA SANTOS", nickName: "マリア" },
  { id: "p008", name: "KUMAR RAJESH", nickName: "ラジェシュ" },
  { id: "p009", name: "TANAKA YUKI", nickName: "ゆき" },
  { id: "p010", name: "AHMED HASSAN", nickName: "ハッサン" },
]

const statuses: InterviewStatus[] = ["完了", "確認待ち", "承認済み"]
const methods: InterviewMethod[] = ["対面", "電話", "ビデオ通話"]
const quarters = ["2025年Q1", "2025年Q2", "2024年Q4", "2024年Q3"]

// Generate Regular Interviews (定期面談)
export const regularInterviews: RegularInterview[] = Array.from({ length: 30 }, (_, i) => {
  const person = people[i % people.length]
  const company = companies[i % companies.length]
  const interviewDate = new Date(2025, 5 - Math.floor(i / 10), 15 - (i % 15))
  
  return {
    id: `ri${(i + 1).toString().padStart(3, "0")}`,
    kintoneRecordId: `${9000 + i}`,
    personId: person.id,
    personName: person.name,
    nickName: person.nickName,
    companyId: company.id,
    companyName: company.name,
    interviewDate: interviewDate.toISOString().split("T")[0],
    startTime: "10:00",
    endTime: "11:00",
    targetQuarter: quarters[i % quarters.length],
    interviewDuration: 60,
    interviewMethod: methods[i % methods.length],
    interviewPlace: i % 3 === 0 ? "本社会議室" : i % 3 === 1 ? "オンライン" : "現場事務所",
    supportStaffName: supportStaff[i % supportStaff.length],
    salesStaffName: salesStaff[i % salesStaff.length],
    funtocoStaff: supportStaff[(i + 1) % supportStaff.length],
    status: statuses[i % statuses.length],
    companyReport: sampleCompanyReports[i % sampleCompanyReports.length],
    internalNotes: i % 4 === 0 ? "社内共有メモ: 次回フォローアップ必要" : undefined,
    createdAt: new Date(interviewDate.getTime() - 7 * 24 * 60 * 60 * 1000).toISOString(),
    updatedAt: interviewDate.toISOString(),
  }
})

// Generate Daily Support Records (日々の面談)
export const dailySupportRecords: DailySupportRecord[] = Array.from({ length: 50 }, (_, i) => {
  const person = people[i % people.length]
  const company = companies[i % companies.length]
  const supportDate = new Date(2025, 5, 15 - (i % 30))
  
  // Generate 1-3 daily entries per record
  const entryCount = 1 + (i % 3)
  const dailyEntries: DailySupportEntry[] = Array.from({ length: entryCount }, (_, j) => {
    const category = sampleDailyCategories[(i + j) % sampleDailyCategories.length]
    return {
      dai: category.dai,
      chu: category.chu,
      shou: category.shou,
      notes: sampleNotes[(i + j) % sampleNotes.length] || undefined,
    }
  })

  return {
    id: `ds${(i + 1).toString().padStart(3, "0")}`,
    kintoneRecordId: `${8000 + i}`,
    personId: person.id,
    personName: person.name,
    nickName: person.nickName,
    companyId: company.id,
    companyName: company.name,
    supportDate: supportDate.toISOString().split("T")[0],
    startTime: `${9 + (i % 8)}:00`,
    endTime: `${10 + (i % 8)}:00`,
    supportStaffName: supportStaff[i % supportStaff.length],
    status: statuses[i % statuses.length],
    dailyEntries,
    internalNotes: i % 5 === 0 ? "内部メモ: 継続フォロー" : undefined,
    createdAt: supportDate.toISOString(),
    updatedAt: supportDate.toISOString(),
  }
})

// Helper function to get interviews by person
export function getRegularInterviewsByPersonId(personId: string): RegularInterview[] {
  return regularInterviews.filter((interview) => interview.personId === personId)
}

export function getDailySupportByPersonId(personId: string): DailySupportRecord[] {
  return dailySupportRecords.filter((record) => record.personId === personId)
}

// Get unique categories from daily support records
export function getDailySupportCategories(): { dai: string; chu: string; shou: string }[] {
  const categories = new Set<string>()
  const result: { dai: string; chu: string; shou: string }[] = []
  
  dailySupportRecords.forEach((record) => {
    record.dailyEntries.forEach((entry) => {
      const key = `${entry.dai}|${entry.chu}|${entry.shou}`
      if (!categories.has(key)) {
        categories.add(key)
        result.push({ dai: entry.dai, chu: entry.chu, shou: entry.shou })
      }
    })
  })
  
  return result
}
