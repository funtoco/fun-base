"use client"

import { createContext, useContext, useEffect, useMemo, useState } from "react"
import { initialCases, type DocumentStatus, type PortalCase } from "@/lib/portal-data"
import { useToast } from "@/lib/hooks/use-toast"

type PortalContextValue = {
  cases: PortalCase[]
  updateDocument: (caseId: string, documentId: string, status: DocumentStatus, note?: string) => void
  uploadDocument: (caseId: string, documentId: string, fileName: string) => void
  addComment: (caseId: string, message: string) => void
  sendReminder: (caseId: string) => void
  registerVisaCase: (visa: { id: string; person: string; company: string; type: string; deadline?: string }) => void
}

const PortalContext = createContext<PortalContextValue | null>(null)
const STORAGE_KEY = "funbase-visa-portal-demo"

export function PortalProvider({ children }: { children: React.ReactNode }) {
  const [cases, setCases] = useState(initialCases)
  const [ready, setReady] = useState(false)
  const { toast } = useToast()

  useEffect(() => {
    const saved = window.localStorage.getItem(STORAGE_KEY)
    if (saved) {
      try { setCases(JSON.parse(saved)) } catch { window.localStorage.removeItem(STORAGE_KEY) }
    }
    setReady(true)
  }, [])

  useEffect(() => {
    if (ready) window.localStorage.setItem(STORAGE_KEY, JSON.stringify(cases))
  }, [cases, ready])

  const mutateCase = (caseId: string, updater: (item: PortalCase) => PortalCase) => {
    setCases((current) => current.map((item) => item.id === caseId ? updater(item) : item))
  }

  const updateDocument = (caseId: string, documentId: string, status: DocumentStatus, note?: string) => {
    mutateCase(caseId, (item) => ({
      ...item,
      status: status === "要修正" ? "修正対応中" : item.status,
      responsibility: status === "要修正" ? "企業" : item.responsibility,
      documents: item.documents.map((doc) => doc.id === documentId ? { ...doc, status, note } : doc),
      activities: [{ id: crypto.randomUUID(), title: status === "承認済み" ? "書類を承認" : "修正依頼を送信", detail: `${item.documents.find((doc) => doc.id === documentId)?.name}を${status}に更新しました`, time: "たった今" }, ...item.activities],
    }))
    toast({ title: status === "承認済み" ? "書類を承認しました" : "修正依頼を送信しました" })
  }

  const uploadDocument = (caseId: string, documentId: string, fileName: string) => {
    mutateCase(caseId, (item) => ({
      ...item,
      responsibility: "運営",
      documents: item.documents.map((doc) => doc.id === documentId ? { ...doc, status: "確認中", updatedAt: "たった今", version: doc.version + 1, note: undefined } : doc),
      activities: [{ id: crypto.randomUUID(), title: "書類をアップロード", detail: `${fileName} を提出しました`, time: "たった今" }, ...item.activities],
    }))
    toast({ title: "書類を提出しました", description: "運営担当者に確認を依頼しました。" })
  }

  const addComment = (caseId: string, message: string) => {
    if (!message.trim()) return
    mutateCase(caseId, (item) => ({ ...item, activities: [{ id: crypto.randomUUID(), title: "コメントを追加", detail: message, time: "たった今" }, ...item.activities] }))
    toast({ title: "コメントを追加しました" })
  }

  const sendReminder = (caseId: string) => {
    mutateCase(caseId, (item) => ({ ...item, activities: [{ id: crypto.randomUUID(), title: "リマインドメールを送信", detail: "企業担当者へ期限と対応内容を通知しました", time: "たった今" }, ...item.activities] }))
    toast({ title: "メールを送信しました", description: "送信履歴を活動に記録しました。" })
  }

  const registerVisaCase = (visa: { id: string; person: string; company: string; type: string; deadline?: string }) => {
    setCases((current) => {
      if (current.some((item) => item.id === visa.id)) return current

      return [...current, {
        id: visa.id,
        person: visa.person,
        romanName: visa.person,
        company: visa.company || "所属企業未設定",
        visa: visa.type,
        status: "書類準備中",
        responsibility: "企業",
        progress: 25,
        deadline: visa.deadline || "未設定",
        priority: "中",
        reason: "必要書類の準備を進めてください",
        country: "未設定",
        tasks: [
          { id: `${visa.id}-task-1`, title: "必要書類の提出", assignee: "企業", due: visa.deadline || "未設定", done: false },
          { id: `${visa.id}-task-2`, title: "申請内容の確認", assignee: "運営", due: visa.deadline || "未設定", done: false },
        ],
        documents: [
          { id: `${visa.id}-doc-1`, name: "パスポート写し", category: "本人書類", status: "未提出", updatedAt: "—", version: 0 },
          { id: `${visa.id}-doc-2`, name: "在留カード写し", category: "本人書類", status: "未提出", updatedAt: "—", version: 0 },
          { id: `${visa.id}-doc-3`, name: "雇用契約書", category: "企業書類", status: "未提出", updatedAt: "—", version: 0 },
        ],
        activities: [{ id: `${visa.id}-activity-1`, title: "申請案件を連携", detail: "ビザ進捗管理から申請書類の管理を開始しました", time: "たった今" }],
      }]
    })
  }

  const value = useMemo(() => ({ cases, updateDocument, uploadDocument, addComment, sendReminder, registerVisaCase }), [cases])
  return <PortalContext.Provider value={value}>{children}</PortalContext.Provider>
}

export function usePortal() {
  const value = useContext(PortalContext)
  if (!value) throw new Error("usePortal must be used within PortalProvider")
  return value
}
