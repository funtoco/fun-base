"use client"

import { useState, useEffect, useMemo, useRef, type ChangeEvent, type FormEvent } from "react"
import { Card } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Textarea } from "@/components/ui/textarea"
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog"
import { Upload, Trash2, RefreshCw, Loader2, Pencil, Save } from "lucide-react"
import { getDocumentSignedUrl, uploadDocumentDirect } from "@/lib/supabase/person-documents"
import { cn } from "@/lib/utils"

type ExistingDocument = {
  id: string
  storagePath: string
  title?: string
  fileName?: string
  contentType?: string
  note?: string
}

interface DocumentUploadCardProps {
  label: string
  personId: string
  documentType: string
  existingDocument?: ExistingDocument | null
  existingDocuments?: ExistingDocument[]
  allowMultiple?: boolean
  className?: string
  onUploadComplete?: () => void
  onDeleteComplete?: () => void
}

export function DocumentUploadCard({
  label,
  personId,
  documentType,
  existingDocument,
  existingDocuments,
  allowMultiple = false,
  className,
  onUploadComplete,
  onDeleteComplete,
}: DocumentUploadCardProps) {
  const [uploading, setUploading] = useState(false)
  const [deletingId, setDeletingId] = useState<string | null>(null)
  const [editingTitleId, setEditingTitleId] = useState<string | null>(null)
  const [savingTitleId, setSavingTitleId] = useState<string | null>(null)
  const [savingNoteId, setSavingNoteId] = useState<string | null>(null)
  const [titleDraft, setTitleDraft] = useState("")
  const [titleDialogOpen, setTitleDialogOpen] = useState(false)
  const [newDocumentTitle, setNewDocumentTitle] = useState("")
  const [newDocumentNote, setNewDocumentNote] = useState("")
  const [signedUrls, setSignedUrls] = useState<Record<string, string>>({})
  const [noteDrafts, setNoteDrafts] = useState<Record<string, string>>({})
  const [savedNotes, setSavedNotes] = useState<Record<string, string>>({})
  const [errorMessage, setErrorMessage] = useState<string | null>(null)
  const [noteMessageId, setNoteMessageId] = useState<string | null>(null)
  const fileInputRef = useRef<HTMLInputElement>(null)
  const replaceDocumentIdRef = useRef<string | null>(null)
  const uploadTitleRef = useRef<string | null>(null)
  const uploadNoteRef = useRef<string | null>(null)

  const documents = useMemo(
    () => existingDocuments ?? (existingDocument ? [existingDocument] : []),
    [existingDocument, existingDocuments]
  )
  const hasDocuments = documents.length > 0
  const newDocumentNoteInputId = `document-note-new-${personId}-${documentType}`

  useEffect(() => {
    if (documents.length === 0) {
      setSignedUrls({})
      return
    }

    let active = true
    const fetchUrls = async () => {
      const entries = await Promise.all(
        documents.map(async (document) => {
          const url = await getDocumentSignedUrl(document.storagePath)
          return [document.id, url] as const
        })
      )
      if (!active) return
      setSignedUrls(
        entries.reduce<Record<string, string>>((acc, [id, url]) => {
          if (url) acc[id] = url
          return acc
        }, {})
      )
    }
    fetchUrls()
    return () => { active = false }
  }, [documents])

  useEffect(() => {
    const nextNotes = documents.reduce<Record<string, string>>((acc, document) => {
      acc[document.id] = document.note || ""
      return acc
    }, {})
    setNoteDrafts(nextNotes)
    setSavedNotes(nextNotes)
    setNoteMessageId(null)
  }, [documents])

  const handleFileChange = async (e: ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (!file) return

    if (file.size > 10 * 1024 * 1024) {
      setErrorMessage("ファイルサイズは10MB以下にしてください")
      return
    }

    setErrorMessage(null)
    setUploading(true)
    try {
      const result = await uploadDocumentDirect(personId, documentType, file, {
        replaceDocumentId: replaceDocumentIdRef.current,
        title: uploadTitleRef.current,
        note: uploadNoteRef.current ?? undefined,
      })
      if (!result.success) throw new Error(result.error || 'Upload failed')
      setNewDocumentNote("")
      onUploadComplete?.()
    } catch (error) {
      console.error("Upload error:", error)
      setErrorMessage(error instanceof Error ? error.message : "アップロードに失敗しました")
    } finally {
      setUploading(false)
      replaceDocumentIdRef.current = null
      uploadTitleRef.current = null
      uploadNoteRef.current = null
      if (fileInputRef.current) fileInputRef.current.value = ""
    }
  }

  const handleDelete = async (documentId: string) => {
    setDeletingId(documentId)

    try {
      const res = await fetch(`/api/people/${personId}/documents/${documentId}`, {
        method: "DELETE",
      })

      if (!res.ok) throw new Error(`Delete failed: ${res.statusText}`)
      onDeleteComplete?.()
    } catch (error) {
      console.error("Delete error:", error)
      setErrorMessage("削除に失敗しました")
    } finally {
      setDeletingId(null)
    }
  }

  const handleUpdateTitle = async (documentId: string) => {
    const nextTitle = titleDraft.trim()

    if (!nextTitle) {
      setErrorMessage("タイトルを入力してください")
      return
    }

    setSavingTitleId(documentId)
    setErrorMessage(null)
    try {
      const res = await fetch(`/api/people/${personId}/documents/${documentId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ title: nextTitle }),
      })

      if (!res.ok) throw new Error(`Update failed: ${res.statusText}`)
      setEditingTitleId(null)
      setTitleDraft("")
      onUploadComplete?.()
    } catch (error) {
      console.error("Update title error:", error)
      setErrorMessage("タイトルの更新に失敗しました")
    } finally {
      setSavingTitleId(null)
    }
  }

  const handleSaveNote = async (documentId: string) => {
    const note = noteDrafts[documentId] || ""

    setSavingNoteId(documentId)
    setErrorMessage(null)
    setNoteMessageId(null)
    try {
      const res = await fetch(`/api/people/${personId}/documents/${documentId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ note }),
      })

      if (!res.ok) {
        const data = await res.json().catch(() => null)
        throw new Error(data?.error || `Save note failed: ${res.statusText}`)
      }

      setSavedNotes((current) => ({ ...current, [documentId]: note.trim() }))
      setNoteMessageId(documentId)
      onUploadComplete?.()
    } catch (error) {
      console.error("Save note error:", error)
      setErrorMessage(error instanceof Error ? error.message : "メモの保存に失敗しました")
    } finally {
      setSavingNoteId(null)
    }
  }

  const startEditingTitle = (document: ExistingDocument, fallbackTitle: string) => {
    setEditingTitleId(document.id)
    setTitleDraft(document.title || fallbackTitle)
    setErrorMessage(null)
  }

  const triggerFileInput = (replaceDocumentId?: string, title?: string | null, note?: string | null) => {
    replaceDocumentIdRef.current = replaceDocumentId ?? null
    uploadTitleRef.current = title?.trim() || null
    uploadNoteRef.current = note ?? null
    fileInputRef.current?.click()
  }

  const handleStartAdd = () => {
    if (!allowMultiple) {
      triggerFileInput(undefined, undefined, newDocumentNote)
      return
    }

    setNewDocumentTitle("")
    setNewDocumentNote("")
    setErrorMessage(null)
    setTitleDialogOpen(true)
  }

  const handleSubmitNewDocumentTitle = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault()

    const title = newDocumentTitle.trim()
    if (!title) {
      setErrorMessage("タイトルを入力してください")
      return
    }

    setTitleDialogOpen(false)
    triggerFileInput(undefined, title, newDocumentNote)
  }

  const renderEmptyUploadButton = () => (
    <button
      type="button"
      onClick={handleStartAdd}
      className="flex h-32 w-full cursor-pointer flex-col items-center justify-center gap-2 rounded-md border-2 border-dashed border-muted-foreground/25 text-muted-foreground transition-colors hover:border-muted-foreground/50 hover:text-foreground"
    >
      <Upload className="h-6 w-6" />
      <span className="text-xs">{allowMultiple ? `${label}を追加` : label}</span>
    </button>
  )

  const renderTitleDialog = () => (
    <Dialog open={titleDialogOpen} onOpenChange={setTitleDialogOpen}>
      <DialogContent>
        <form onSubmit={handleSubmitNewDocumentTitle} className="space-y-4">
          <DialogHeader>
            <DialogTitle>その他書類を追加</DialogTitle>
          </DialogHeader>
          <div className="space-y-2">
            <label className="text-sm font-medium" htmlFor="other-document-title">
              タイトル
            </label>
            <Input
              id="other-document-title"
              value={newDocumentTitle}
              onChange={(event) => setNewDocumentTitle(event.target.value)}
              placeholder="例: 健康診断書"
              autoFocus
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="other-document-note" className="text-sm font-medium">
              メモ（任意）
            </Label>
            <Textarea
              id="other-document-note"
              value={newDocumentNote}
              onChange={(event) => setNewDocumentNote(event.target.value)}
              placeholder="アップロード時に一緒に残すメモ"
              className="min-h-20 resize-none text-sm"
            />
          </div>
          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => setTitleDialogOpen(false)}>
              キャンセル
            </Button>
            <Button type="submit">ファイルを選択</Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  )

  if (allowMultiple) {
    return (
      <div className={cn("space-y-3", className)}>
        <input
          ref={fileInputRef}
          type="file"
          accept="image/png,image/jpeg,image/webp,image/heic,image/heif,application/pdf"
          className="hidden"
          onChange={handleFileChange}
        />

        <div className="flex justify-end">
          <Button type="button" variant="outline" size="sm" onClick={handleStartAdd} disabled={uploading}>
            {uploading ? (
              <Loader2 className="mr-1 h-3 w-3 animate-spin" />
            ) : (
              <Upload className="mr-1 h-3 w-3" />
            )}
            追加
          </Button>
        </div>

        {hasDocuments ? (
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            {documents.map((document, index) => {
              const signedUrl = signedUrls[document.id]
              const isPdf = document.contentType === 'application/pdf'
              const fallbackTitle = `${label} ${index + 1}`
              const title = document.title || fallbackTitle
              const noteInputId = `document-note-${personId}-${document.id}`
              const noteDraft = noteDrafts[document.id] || ""
              const savedNote = savedNotes[document.id] || ""

              return (
                <Card key={document.id} className="space-y-2 p-3">
                  {signedUrl ? (
                    <Dialog>
                      <DialogTrigger asChild>
                        <button type="button" className="w-full cursor-pointer">
                          {isPdf ? (
                            <div className="flex h-32 w-full items-center justify-center rounded-md bg-muted">
                              <span className="text-sm text-muted-foreground">PDF</span>
                            </div>
                          ) : (
                            <img
                              src={signedUrl}
                              alt={title}
                              className="h-32 w-full rounded-md object-cover"
                            />
                          )}
                        </button>
                      </DialogTrigger>
                      <DialogContent className="max-w-3xl">
                        {isPdf ? (
                          <object
                            data={signedUrl}
                            type="application/pdf"
                            className="h-[80vh] w-full rounded-md"
                            aria-label={title}
                          >
                            <p>PDFを表示できません。<a href={signedUrl} target="_blank" rel="noopener noreferrer">ダウンロード</a></p>
                          </object>
                        ) : (
                          <img
                            src={signedUrl}
                            alt={title}
                            className="w-full rounded-md object-contain"
                          />
                        )}
                      </DialogContent>
                    </Dialog>
                  ) : (
                    <div className="flex h-32 w-full items-center justify-center rounded-md bg-muted">
                      <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
                    </div>
                  )}

                  <div className="min-w-0 space-y-1">
                    {editingTitleId === document.id ? (
                      <form className="flex gap-1" onSubmit={(event) => {
                        event.preventDefault()
                        handleUpdateTitle(document.id)
                      }}>
                        <Input
                          value={titleDraft}
                          onChange={(event) => setTitleDraft(event.target.value)}
                          className="h-8 text-xs"
                          disabled={savingTitleId === document.id}
                          aria-label={`${fallbackTitle}のタイトル`}
                        />
                        <Button type="submit" size="sm" disabled={savingTitleId === document.id}>
                          {savingTitleId === document.id ? (
                            <Loader2 className="h-3 w-3 animate-spin" />
                          ) : (
                            "保存"
                          )}
                        </Button>
                      </form>
                    ) : (
                      <div className="flex items-center gap-1">
                        <p className="min-w-0 flex-1 truncate text-xs font-medium">{title}</p>
                        <Button
                          type="button"
                          variant="ghost"
                          size="sm"
                          className="h-7 px-2"
                          onClick={() => startEditingTitle(document, fallbackTitle)}
                        >
                          <Pencil className="h-3 w-3" />
                          <span className="sr-only">タイトル変更</span>
                        </Button>
                      </div>
                    )}
                    {document.fileName && (
                      <p className="truncate text-xs text-muted-foreground">{document.fileName}</p>
                    )}
                  </div>

                  <div className="space-y-2">
                    <Label htmlFor={noteInputId} className="text-xs">
                      メモ
                    </Label>
                    <Textarea
                      id={noteInputId}
                      value={noteDraft}
                      onChange={(event) => {
                        setNoteDrafts((current) => ({ ...current, [document.id]: event.target.value }))
                        setNoteMessageId(null)
                      }}
                      placeholder="確認事項や対応メモを入力"
                      className="min-h-20 resize-none text-xs"
                      disabled={savingNoteId === document.id}
                    />
                  </div>

                  <div className="flex gap-1">
                    <Button
                      type="button"
                      variant="outline"
                      size="sm"
                      className="flex-1"
                      onClick={() => triggerFileInput(document.id, document.title || fallbackTitle, noteDraft)}
                    >
                      <RefreshCw className="mr-1 h-3 w-3" />
                      差し替え
                    </Button>
                    <Button
                      type="button"
                      variant="outline"
                      size="sm"
                      onClick={() => handleSaveNote(document.id)}
                      disabled={savingNoteId === document.id || noteDraft.trim() === savedNote.trim()}
                    >
                      {savingNoteId === document.id ? (
                        <Loader2 className="h-3 w-3 animate-spin" />
                      ) : (
                        <Save className="h-3 w-3" />
                      )}
                      保存
                    </Button>
                    <Button
                      type="button"
                      variant="outline"
                      size="sm"
                      onClick={() => handleDelete(document.id)}
                      disabled={deletingId === document.id}
                    >
                      {deletingId === document.id ? (
                        <Loader2 className="h-3 w-3 animate-spin" />
                      ) : (
                        <Trash2 className="h-3 w-3" />
                      )}
                    </Button>
                  </div>

                  {noteMessageId === document.id && (
                    <p className="text-xs text-muted-foreground">メモを保存しました</p>
                  )}
                </Card>
              )
            })}
          </div>
        ) : (
          <Card className="p-3 sm:w-1/2">
            {renderEmptyUploadButton()}
          </Card>
        )}

        {errorMessage && (
          <p className="text-xs text-destructive">{errorMessage}</p>
        )}

        {renderTitleDialog()}
      </div>
    )
  }

  return (
    <Card className={cn("p-3 gap-3", className)}>
      <input
        ref={fileInputRef}
        type="file"
        accept="image/png,image/jpeg,image/webp,image/heic,image/heif,application/pdf"
        className="hidden"
        onChange={handleFileChange}
      />

      {uploading ? (
        <div className="flex h-32 items-center justify-center">
          <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
        </div>
      ) : hasDocuments ? (
        <div className="space-y-3">
          {allowMultiple && (
            <div className="flex items-center justify-between gap-2">
              <p className="text-sm font-medium">{label}</p>
              <Button type="button" variant="outline" size="sm" onClick={handleStartAdd}>
                <Upload className="mr-1 h-3 w-3" />
                追加
              </Button>
            </div>
          )}

          <div className="space-y-3">
            {documents.map((document, index) => {
              const signedUrl = signedUrls[document.id]
              const isPdf = document.contentType === 'application/pdf'
              const fallbackTitle = allowMultiple ? `${label} ${index + 1}` : label
              const title = document.title || fallbackTitle
              const noteInputId = `document-note-${personId}-${document.id}`
              const noteDraft = noteDrafts[document.id] || ""
              const savedNote = savedNotes[document.id] || ""

              return (
                <div key={document.id} className="space-y-2 rounded-md border border-border p-2">
                  {signedUrl ? (
                    <Dialog>
                      <DialogTrigger asChild>
                        <button type="button" className="w-full cursor-pointer">
                          {isPdf ? (
                            <div className="flex h-32 w-full items-center justify-center rounded-md bg-muted">
                              <span className="text-sm text-muted-foreground">PDF</span>
                            </div>
                          ) : (
                            <img
                              src={signedUrl}
                              alt={title}
                              className="h-32 w-full rounded-md object-cover"
                            />
                          )}
                        </button>
                      </DialogTrigger>
                      <DialogContent className="max-w-3xl">
                        {isPdf ? (
                          <object
                            data={signedUrl}
                            type="application/pdf"
                            className="h-[80vh] w-full rounded-md"
                            aria-label={title}
                          >
                            <p>PDFを表示できません。<a href={signedUrl} target="_blank" rel="noopener noreferrer">ダウンロード</a></p>
                          </object>
                        ) : (
                          <img
                            src={signedUrl}
                            alt={title}
                            className="w-full rounded-md object-contain"
                          />
                        )}
                      </DialogContent>
                    </Dialog>
                  ) : (
                    <div className="flex h-32 w-full items-center justify-center rounded-md bg-muted">
                      <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
                    </div>
                  )}

                  <div className="min-w-0 space-y-1">
                    {allowMultiple && editingTitleId === document.id ? (
                      <form className="flex gap-1" onSubmit={(event) => {
                        event.preventDefault()
                        handleUpdateTitle(document.id)
                      }}>
                        <Input
                          value={titleDraft}
                          onChange={(event) => setTitleDraft(event.target.value)}
                          className="h-8 text-xs"
                          disabled={savingTitleId === document.id}
                          aria-label={`${fallbackTitle}のタイトル`}
                        />
                        <Button type="submit" size="sm" disabled={savingTitleId === document.id}>
                          {savingTitleId === document.id ? (
                            <Loader2 className="h-3 w-3 animate-spin" />
                          ) : (
                            "保存"
                          )}
                        </Button>
                      </form>
                    ) : (
                      <div className="flex items-center gap-1">
                        <p className="min-w-0 flex-1 truncate text-xs font-medium">{title}</p>
                        {allowMultiple && (
                          <Button
                            type="button"
                            variant="ghost"
                            size="sm"
                            className="h-7 px-2"
                            onClick={() => startEditingTitle(document, fallbackTitle)}
                          >
                            <Pencil className="h-3 w-3" />
                            <span className="sr-only">タイトル変更</span>
                          </Button>
                        )}
                      </div>
                    )}
                    {document.fileName && (
                      <p className="truncate text-xs text-muted-foreground">{document.fileName}</p>
                    )}
                  </div>

                  <div className="space-y-2">
                    <Label htmlFor={noteInputId} className="text-xs">
                      メモ
                    </Label>
                    <Textarea
                      id={noteInputId}
                      value={noteDraft}
                      onChange={(event) => {
                        setNoteDrafts((current) => ({ ...current, [document.id]: event.target.value }))
                        setNoteMessageId(null)
                      }}
                      placeholder="確認事項や対応メモを入力"
                      className="min-h-20 resize-none text-xs"
                      disabled={savingNoteId === document.id}
                    />
                  </div>

                  <div className="flex gap-1">
                    <Button
                      type="button"
                      variant="outline"
                      size="sm"
                      className="flex-1"
                      onClick={() => triggerFileInput(document.id, document.title || fallbackTitle)}
                    >
                      <RefreshCw className="mr-1 h-3 w-3" />
                      差し替え
                    </Button>
                    <Button
                      type="button"
                      variant="outline"
                      size="sm"
                      onClick={() => handleSaveNote(document.id)}
                      disabled={savingNoteId === document.id || noteDraft.trim() === savedNote.trim()}
                    >
                      {savingNoteId === document.id ? (
                        <Loader2 className="h-3 w-3 animate-spin" />
                      ) : (
                        <Save className="h-3 w-3" />
                      )}
                      保存
                    </Button>
                    <Button
                      type="button"
                      variant="outline"
                      size="sm"
                      onClick={() => handleDelete(document.id)}
                      disabled={deletingId === document.id}
                    >
                      {deletingId === document.id ? (
                        <Loader2 className="h-3 w-3 animate-spin" />
                      ) : (
                        <Trash2 className="h-3 w-3" />
                      )}
                    </Button>
                  </div>

                  {noteMessageId === document.id && (
                    <p className="text-xs text-muted-foreground">メモを保存しました</p>
                  )}
                </div>
              )
            })}
          </div>
        </div>
      ) : (
        <>
          {allowMultiple && (
            <p className="text-sm font-medium">{label}</p>
          )}
          {renderEmptyUploadButton()}
        </>
      )}

      {!hasDocuments && !allowMultiple && !uploading && (
        <div className="space-y-2">
          <Label htmlFor={newDocumentNoteInputId} className="text-xs">
            登録時メモ（任意）
          </Label>
          <Textarea
            id={newDocumentNoteInputId}
            value={newDocumentNote}
            onChange={(event) => setNewDocumentNote(event.target.value)}
            placeholder="アップロード時に一緒に残すメモ"
            className="min-h-20 resize-none text-xs"
          />
        </div>
      )}

      {errorMessage && (
        <p className="text-xs text-destructive">{errorMessage}</p>
      )}

      {renderTitleDialog()}
    </Card>
  )
}
