"use client"

import { useState, useEffect, useRef } from "react"
import { Card } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Dialog, DialogContent, DialogTrigger } from "@/components/ui/dialog"
import { Upload, Trash2, RefreshCw, Loader2 } from "lucide-react"
import { getDocumentSignedUrl, uploadDocumentDirect } from "@/lib/supabase/person-documents"

interface DocumentUploadCardProps {
  label: string
  personId: string
  documentType: string
  existingDocument?: { id: string; storagePath: string; fileName?: string; contentType?: string } | null
  onUploadComplete?: () => void
  onDeleteComplete?: () => void
}

export function DocumentUploadCard({
  label,
  personId,
  documentType,
  existingDocument,
  onUploadComplete,
  onDeleteComplete,
}: DocumentUploadCardProps) {
  const [uploading, setUploading] = useState(false)
  const [deleting, setDeleting] = useState(false)
  const [signedUrl, setSignedUrl] = useState<string | null>(null)
  const [errorMessage, setErrorMessage] = useState<string | null>(null)
  const fileInputRef = useRef<HTMLInputElement>(null)

  const isPdf = existingDocument?.contentType === 'application/pdf'

  useEffect(() => {
    if (!existingDocument?.storagePath) {
      setSignedUrl(null)
      return
    }

    let active = true
    const fetchUrl = async () => {
      const url = await getDocumentSignedUrl(existingDocument.storagePath)
      if (active) setSignedUrl(url)
    }
    fetchUrl()
    return () => { active = false }
  }, [existingDocument?.storagePath])

  const handleFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (!file) return

    if (file.size > 10 * 1024 * 1024) {
      setErrorMessage("ファイルサイズは10MB以下にしてください")
      return
    }

    setErrorMessage(null)
    setUploading(true)
    try {
      const result = await uploadDocumentDirect(personId, documentType, file)
      if (!result.success) throw new Error(result.error || 'Upload failed')
      onUploadComplete?.()
    } catch (error) {
      console.error("Upload error:", error)
      setErrorMessage(error instanceof Error ? error.message : "アップロードに失敗しました")
    } finally {
      setUploading(false)
      if (fileInputRef.current) fileInputRef.current.value = ""
    }
  }

  const handleDelete = async () => {
    if (!existingDocument) return

    setDeleting(true)
    try {
      const res = await fetch(`/api/people/${personId}/documents/${existingDocument.id}`, {
        method: "DELETE",
      })

      if (!res.ok) throw new Error(`Delete failed: ${res.statusText}`)
      onDeleteComplete?.()
    } catch (error) {
      console.error("Delete error:", error)
    } finally {
      setDeleting(false)
    }
  }

  const triggerFileInput = () => {
    fileInputRef.current?.click()
  }

  return (
    <Card className="p-3 gap-2">
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
      ) : existingDocument && signedUrl ? (
        <div className="space-y-2">
          <Dialog>
            <DialogTrigger asChild>
              <button className="w-full cursor-pointer">
                {isPdf ? (
                  <div className="flex h-32 w-full items-center justify-center rounded-md bg-muted">
                    <span className="text-sm text-muted-foreground">PDF</span>
                  </div>
                ) : (
                  <img
                    src={signedUrl}
                    alt={label}
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
                  aria-label={label}
                >
                  <p>PDFを表示できません。<a href={signedUrl} target="_blank" rel="noopener noreferrer">ダウンロード</a></p>
                </object>
              ) : (
                <img
                  src={signedUrl}
                  alt={label}
                  className="w-full rounded-md object-contain"
                />
              )}
            </DialogContent>
          </Dialog>

          {existingDocument.fileName && (
            <p className="truncate text-xs text-muted-foreground">
              {existingDocument.fileName}
            </p>
          )}

          <div className="flex gap-1">
            <Button
              variant="outline"
              size="sm"
              className="flex-1"
              onClick={triggerFileInput}
            >
              <RefreshCw className="mr-1 h-3 w-3" />
              再アップロード
            </Button>
            <Button
              variant="outline"
              size="sm"
              onClick={handleDelete}
              disabled={deleting}
            >
              {deleting ? (
                <Loader2 className="h-3 w-3 animate-spin" />
              ) : (
                <Trash2 className="h-3 w-3" />
              )}
            </Button>
          </div>
        </div>
      ) : (
        <button
          onClick={triggerFileInput}
          className="flex h-32 w-full cursor-pointer flex-col items-center justify-center gap-2 rounded-md border-2 border-dashed border-muted-foreground/25 text-muted-foreground transition-colors hover:border-muted-foreground/50 hover:text-foreground"
        >
          <Upload className="h-6 w-6" />
          <span className="text-xs">{label}</span>
        </button>
      )}

      {errorMessage && (
        <p className="text-xs text-destructive">{errorMessage}</p>
      )}
    </Card>
  )
}
