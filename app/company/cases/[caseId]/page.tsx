"use client"

import Link from "next/link"
import { useParams } from "next/navigation"
import { ArrowLeft, CheckCircle2, Circle, FileText, MessageSquare, Upload } from "lucide-react"
import { useState } from "react"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
import { Textarea } from "@/components/ui/textarea"
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog"
import { Chip, ProgressBar } from "@/components/portal/portal-widgets"
import { usePortal } from "@/components/portal/portal-provider"

export default function CompanyCaseDetail() {
  const { caseId } = useParams<{ caseId: string }>()
  const { cases, uploadDocument, addComment } = usePortal()
  const item = cases.find((entry) => entry.id === caseId)
  const [comment, setComment] = useState("")
  const [uploadFor, setUploadFor] = useState<{ id: string; name: string } | null>(null)
  const [fileName, setFileName] = useState("")

  if (!item) return <div className="mx-auto max-w-3xl rounded-xl border border-dashed p-16 text-center"><p className="text-lg font-medium">案件が見つかりませんでした</p><p className="mt-2 text-sm text-muted-foreground">案件番号をご確認ください。</p><Button asChild className="mt-6" variant="outline"><Link href="/company/cases"><ArrowLeft data-icon="inline-start" />案件一覧へ戻る</Link></Button></div>

  const steps = ["書類準備中", "審査中", "修正対応中", "申請準備完了"]
  const currentStep = steps.indexOf(item.status)

  return <div className="mx-auto flex max-w-5xl flex-col gap-6">
    <Link href="/company/cases" className="inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground"><ArrowLeft className="size-4" />案件一覧へ戻る</Link>
    <div className="flex flex-col gap-4 rounded-xl border bg-card p-6">
      <div className="flex flex-wrap items-start justify-between gap-3"><div><div className="flex flex-wrap items-center gap-2"><h1 className="text-2xl font-semibold tracking-tight">{item.person}</h1><Chip label={item.status} /><Chip label={item.responsibility} /></div><p className="mt-1 text-sm text-muted-foreground">{item.romanName} ・ {item.company} ・ {item.visa}</p></div><div className="text-right"><p className="text-xs text-muted-foreground">申請期限</p><p className="text-lg font-semibold">{item.deadline}</p></div></div>
      <div className="flex flex-col gap-2"><div className="flex items-center justify-between text-sm"><span className="text-muted-foreground">進捗</span><span className="font-medium">{item.progress}%</span></div><ProgressBar value={item.progress} /></div>
      <div className="flex flex-wrap gap-2">{steps.map((step, index) => <div key={step} className={`flex items-center gap-1.5 rounded-full px-3 py-1 text-xs font-medium ${index <= currentStep ? "bg-primary/10 text-primary" : "bg-muted text-muted-foreground"}`}>{index < currentStep ? <CheckCircle2 className="size-3.5" /> : <Circle className="size-3.5" />}{step}</div>)}</div>
    </div>

    <Tabs defaultValue="documents">
      <TabsList className="w-full justify-start"><TabsTrigger value="documents">書類</TabsTrigger><TabsTrigger value="tasks">タスク</TabsTrigger><TabsTrigger value="activity">活動履歴</TabsTrigger></TabsList>
      <TabsContent value="documents" className="mt-4 flex flex-col gap-3">
        {item.documents.map((doc) => <Card key={doc.id}><CardContent className="flex flex-col gap-3 py-1 sm:flex-row sm:items-center sm:justify-between"><div className="flex items-start gap-3"><FileText className="mt-0.5 size-5 text-muted-foreground" /><div><div className="flex flex-wrap items-center gap-2"><p className="font-medium">{doc.name}</p><Chip label={doc.status} /></div><p className="text-xs text-muted-foreground">{doc.category} ・ 更新 {doc.updatedAt} ・ 版 v{doc.version}</p>{doc.note && <p className="mt-2 rounded-md bg-amber-50 px-3 py-2 text-xs text-amber-900">運営コメント: {doc.note}</p>}</div></div><Button variant={doc.status === "要修正" || doc.status === "未提出" ? "default" : "outline"} size="sm" onClick={() => { setUploadFor({ id: doc.id, name: doc.name }); setFileName("") }}><Upload data-icon="inline-start" />{doc.version === 0 ? "アップロード" : "差し替え"}</Button></CardContent></Card>)}
      </TabsContent>
      <TabsContent value="tasks" className="mt-4 flex flex-col gap-3">{item.tasks.map((task) => <Card key={task.id}><CardContent className="flex items-center gap-3 py-1">{task.done ? <CheckCircle2 className="size-5 text-primary" /> : <Circle className="size-5 text-muted-foreground" />}<div className="flex-1"><p className={task.done ? "text-muted-foreground line-through" : "font-medium"}>{task.title}</p><p className="text-xs text-muted-foreground">担当 {task.assignee} ・ 期限 {task.due}</p></div><Chip label={task.assignee} /></CardContent></Card>)}</TabsContent>
      <TabsContent value="activity" className="mt-4 flex flex-col gap-4">
        <Card><CardHeader><CardTitle className="text-base">コメントを追加</CardTitle></CardHeader><CardContent className="flex flex-col gap-3 py-1"><Textarea value={comment} onChange={(event) => setComment(event.target.value)} placeholder="運営担当者への連絡事項を入力" /><div className="flex justify-end"><Button size="sm" onClick={() => { addComment(item.id, comment); setComment("") }}><MessageSquare data-icon="inline-start" />送信</Button></div></CardContent></Card>
        <div className="flex flex-col gap-4 border-l pl-5">{item.activities.map((activity) => <div key={activity.id} className="relative"><span className="absolute -left-[26px] top-1.5 size-2.5 rounded-full bg-primary" /><p className="text-sm font-medium">{activity.title}</p><p className="text-sm text-muted-foreground">{activity.detail}</p><p className="text-xs text-muted-foreground">{activity.time}</p></div>)}</div>
      </TabsContent>
    </Tabs>

    <Dialog open={!!uploadFor} onOpenChange={(open) => !open && setUploadFor(null)}>
      <DialogContent><DialogHeader><DialogTitle>書類のアップロード</DialogTitle><DialogDescription>{uploadFor?.name} を提出します。提出後、運営担当者が確認します。</DialogDescription></DialogHeader>
        <label className="flex cursor-pointer flex-col items-center gap-2 rounded-lg border border-dashed p-8 text-center"><Upload className="size-6 text-muted-foreground" /><span className="text-sm font-medium">{fileName || "ファイルを選択"}</span><span className="text-xs text-muted-foreground">PDF・JPG・PNG（デモ）</span><input type="file" className="hidden" onChange={(event) => setFileName(event.target.files?.[0]?.name ?? "選択したファイル.pdf")} /></label>
        <DialogFooter><Button variant="outline" onClick={() => setUploadFor(null)}>キャンセル</Button><Button disabled={!fileName} onClick={() => { if (uploadFor) uploadDocument(item.id, uploadFor.id, fileName); setUploadFor(null) }}>提出する</Button></DialogFooter>
      </DialogContent>
    </Dialog>
  </div>
}
