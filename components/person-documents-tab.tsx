"use client"

import { useState, useCallback } from "react"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { DocumentUploadCard } from "@/components/ui/document-upload-card"
import type { PersonDocument, DocumentType } from "@/lib/models"

interface PersonDocumentsTabProps {
  personId: string
  personDocuments: PersonDocument[]
}

const DOCUMENT_SECTIONS: { title: string; types: { type: DocumentType; label: string }[] }[] = [
  {
    title: "パスポート",
    types: [
      { type: "passport_front", label: "パスポート（表）" },
      { type: "passport_back", label: "パスポート（裏）" },
    ],
  },
  {
    title: "在留カード",
    types: [
      { type: "residence_card_front", label: "在留カード（表）" },
      { type: "residence_card_back", label: "在留カード（裏）" },
    ],
  },
  {
    title: "入社前書類",
    types: [
      { type: "coe_copy", label: "COE写し" },
      { type: "flight_ticket_copy", label: "フライト写し" },
      { type: "bank_card_copy", label: "口座カード写し" },
    ],
  },
  {
    title: "入社後書類",
    types: [
      { type: "resume", label: "履歴書" },
      { type: "designation_document", label: "指定書写し" },
      { type: "employment_insurance_notice", label: "雇用保険通知書" },
    ],
  },
  {
    title: "その他書類",
    types: [
      { type: "other", label: "その他書類" },
    ],
  },
]

export function PersonDocumentsTab({ personId, personDocuments: initialDocuments }: PersonDocumentsTabProps) {
  const [documents, setDocuments] = useState<PersonDocument[]>(initialDocuments)

  const refreshDocuments = useCallback(async () => {
    try {
      const res = await fetch(`/api/people/${personId}/documents`)
      if (res.ok) {
        const data = await res.json()
        setDocuments(data)
      }
    } catch (error) {
      console.error('Failed to refresh documents:', error)
    }
  }, [personId])

  const getExistingDocument = (docType: DocumentType) => {
    const doc = documents.find((d) => d.documentType === docType)
    if (!doc) return null
    return {
      id: doc.id,
      storagePath: doc.storagePath,
      title: doc.title,
      fileName: doc.fileName,
      contentType: doc.contentType,
      note: doc.note,
    }
  }

  const getExistingDocuments = (docType: DocumentType) => (
    documents
      .filter((d) => d.documentType === docType)
      .map((doc) => ({
        id: doc.id,
        storagePath: doc.storagePath,
        title: doc.title,
        fileName: doc.fileName,
        contentType: doc.contentType,
        note: doc.note,
      }))
  )

  return (
    <div className="space-y-6">
      {DOCUMENT_SECTIONS.map((section) => (
        <Card key={section.title}>
          <CardHeader>
            <CardTitle>{section.title}</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              {section.types.map(({ type, label }) => (
                <DocumentUploadCard
                  key={type}
                  label={label}
                  personId={personId}
                  documentType={type}
                  existingDocument={type === "other" ? null : getExistingDocument(type)}
                  existingDocuments={type === "other" ? getExistingDocuments(type) : undefined}
                  allowMultiple={type === "other"}
                  onUploadComplete={refreshDocuments}
                  onDeleteComplete={refreshDocuments}
                />
              ))}
            </div>
          </CardContent>
        </Card>
      ))}
    </div>
  )
}
