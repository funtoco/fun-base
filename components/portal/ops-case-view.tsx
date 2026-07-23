"use client"

import Link from "next/link"
import { ArrowLeft, Check, FileText, Mail, MessageSquare, RotateCcw } from "lucide-react"
import { useMemo, useState } from "react"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog"
import { Textarea } from "@/components/ui/textarea"
import { Chip } from "@/components/portal/portal-widgets"
import { usePortal } from "@/components/portal/portal-provider"
import type { PortalCase } from "@/lib/portal-data"

export function OpsCaseView({ item }: { item: PortalCase }) {
  const { updateDocument, addComment, sendReminder } = usePortal()
  const [selectedId, setSelectedId] = useState(item.documents[0]?.id ?? "")
  const [correctionOpen, setCorrectionOpen] = useState(false)
  const [emailOpen, setEmailOpen] = useState(false)
  const [comment, setComment] = useState("")
  const [note, setNote] = useState("")
  const selected = useMemo(() => item.documents.find((doc) => doc.id === selectedId), [item, selectedId])

  return <div className="mx-auto flex max-w-[1500px] flex-col gap-5">
    <div className="flex flex-col justify-between gap-4 lg:flex-row lg:items-end"><div><Link href="/visas" className="inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground"><ArrowLeft className="size-4" />ビザ進捗管理へ戻る</Link><div className="mt-3 flex flex-wrap items-center gap-2"><h1 className="text-2xl font-semibold">{item.person}</h1><Chip label={item.status} /><Chip label={item.responsibility} /></div><p className="mt-1 text-sm text-muted-foreground">{item.id} ・ {item.company} ・ {item.visa}</p></div><Button variant="outline" onClick={() => setEmailOpen(true)}><Mail data-icon="inline-start" />企業へ通知</Button></div>

    <div className="grid min-h-[620px] gap-5 lg:grid-cols-[320px_1fr] xl:grid-cols-[360px_1fr]">
      <aside className="flex flex-col gap-4">
        <Card><CardHeader><CardTitle className="text-base">確認対象の書類</CardTitle><CardDescription>{item.documents.length}件の提出書類</CardDescription></CardHeader><CardContent className="flex flex-col gap-2 py-1">{item.documents.map((doc) => <button key={doc.id} onClick={() => setSelectedId(doc.id)} className={`flex w-full items-start gap-3 rounded-lg border p-3 text-left ${selectedId === doc.id ? "border-primary bg-primary/5" : "hover:bg-muted"}`}><FileText className="mt-0.5 size-4 shrink-0" /><div className="min-w-0 flex-1"><p className="truncate text-sm font-medium">{doc.name}</p><div className="mt-1 flex items-center justify-between gap-2"><Chip label={doc.status} /><span className="text-xs text-muted-foreground">v{doc.version}</span></div></div></button>)}</CardContent></Card>
        <Card><CardHeader><CardTitle className="text-base">確認タスク</CardTitle></CardHeader><CardContent className="flex flex-col gap-3 py-1">{item.tasks.map((task) => <div key={task.id} className="flex items-start gap-2"><span className={`mt-1 size-2 rounded-full ${task.done ? "bg-primary" : "bg-amber-500"}`} /><div><p className="text-sm font-medium">{task.title}</p><p className="text-xs text-muted-foreground">{task.assignee} ・ {task.due}</p></div></div>)}</CardContent></Card>
      </aside>

      <section className="flex min-w-0 flex-col gap-4">
        <Card className="flex-1"><CardHeader><div className="flex flex-col justify-between gap-3 sm:flex-row sm:items-start"><div><CardTitle>{selected?.name}</CardTitle><CardDescription>{selected?.category} ・ 更新 {selected?.updatedAt} ・ バージョン {selected?.version}</CardDescription></div>{selected && <Chip label={selected.status} />}</div></CardHeader><CardContent className="flex min-h-[340px] items-center justify-center py-1"><div className="flex h-full min-h-[330px] w-full flex-col items-center justify-center rounded-lg border bg-muted/50 text-center"><FileText className="size-10 text-muted-foreground" /><p className="mt-4 font-medium">{selected?.name} のプレビュー</p><p className="mt-1 text-sm text-muted-foreground">PDFプレビュー領域（デモ）</p><div className="mt-6 w-full max-w-md rounded-lg bg-card p-5 text-left shadow-sm"><p className="text-xs font-medium text-muted-foreground">抽出された確認項目</p><dl className="mt-3 grid grid-cols-2 gap-3 text-sm"><dt className="text-muted-foreground">申請人</dt><dd>{item.person}</dd><dt className="text-muted-foreground">所属企業</dt><dd>{item.company}</dd><dt className="text-muted-foreground">在留資格</dt><dd>{item.visa}</dd></dl></div></div></CardContent></Card>
        <Card className="sticky bottom-4"><CardContent className="flex flex-col gap-4 py-1"><div className="flex flex-col justify-between gap-3 sm:flex-row sm:items-center"><div><p className="font-medium">審査結果を記録</p><p className="text-xs text-muted-foreground">操作は企業担当画面と活動履歴に即時反映されます。</p></div><div className="flex flex-wrap gap-2"><Button variant="outline" onClick={() => setCorrectionOpen(true)} disabled={!selected}><RotateCcw data-icon="inline-start" />修正依頼</Button><Button onClick={() => selected && updateDocument(item.id, selected.id, "承認済み")} disabled={!selected}><Check data-icon="inline-start" />承認する</Button></div></div><div className="flex gap-2"><Textarea value={comment} onChange={(event) => setComment(event.target.value)} placeholder="案件にコメントを追加" className="min-h-9" /><Button variant="secondary" size="icon" aria-label="コメントを送信" onClick={() => { addComment(item.id, comment); setComment("") }}><MessageSquare /></Button></div></CardContent></Card>
      </section>
    </div>

    <Dialog open={correctionOpen} onOpenChange={setCorrectionOpen}><DialogContent><DialogHeader><DialogTitle>修正を依頼</DialogTitle><DialogDescription>{selected?.name}について、企業担当者へ修正内容を送信します。</DialogDescription></DialogHeader><Textarea value={note} onChange={(event) => setNote(event.target.value)} placeholder="修正箇所と対応方法を具体的に入力してください" /><DialogFooter><Button variant="outline" onClick={() => setCorrectionOpen(false)}>キャンセル</Button><Button disabled={!note.trim()} onClick={() => { if (selected) updateDocument(item.id, selected.id, "要修正", note); setCorrectionOpen(false); setNote("") }}>修正依頼を送信</Button></DialogFooter></DialogContent></Dialog>
    <Dialog open={emailOpen} onOpenChange={setEmailOpen}><DialogContent><DialogHeader><DialogTitle>企業へリマインドメールを送信</DialogTitle><DialogDescription>送信内容を確認してください。送信後、活動履歴に記録されます。</DialogDescription></DialogHeader><div className="flex flex-col gap-3 rounded-lg bg-muted p-4 text-sm"><p><span className="text-muted-foreground">宛先:</span> {item.company} ご担当者</p><p><span className="text-muted-foreground">件名:</span> 【FunBase】ビザ申請対応のお願い</p><p className="leading-6">{item.person}さんの申請について、期限までに必要な対応をご確認ください。</p></div><DialogFooter><Button variant="outline" onClick={() => setEmailOpen(false)}>キャンセル</Button><Button onClick={() => { sendReminder(item.id); setEmailOpen(false) }}><Mail data-icon="inline-start" />メールを送信</Button></DialogFooter></DialogContent></Dialog>
  </div>
}
