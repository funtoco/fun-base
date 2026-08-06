import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table'
import { SampleDialog } from './sample-dialog'
import {
  DOCUMENTS_INTRO_INITIAL,
  DOCUMENTS_INTRO_RENEWAL,
  type DocumentSample,
  type RequiredDocument,
} from '@/lib/portal/guidance'
import type { ApplicationCategory } from '@/lib/portal/types'

interface DocumentTableProps {
  documents: RequiredDocument[]
  samples: DocumentSample[]
  category: ApplicationCategory
}

export function DocumentTable({ documents, samples, category }: DocumentTableProps) {
  const sampleById = new Map(samples.map((sample) => [sample.id, sample]))

  return (
    <div className="space-y-3">
      <p className="text-sm leading-6 text-muted-foreground">
        {category === 'initial' ? DOCUMENTS_INTRO_INITIAL : DOCUMENTS_INTRO_RENEWAL}
      </p>
      <div className="overflow-x-auto rounded-xl border border-border bg-card shadow-sm">
        <Table className="min-w-[772px]">
          <TableHeader>
            <TableRow>
              <TableHead className="w-[44px]">No</TableHead>
              <TableHead className="min-w-[240px]">必要書類</TableHead>
              <TableHead className="w-[112px]">区分</TableHead>
              <TableHead className="w-[136px]">請求先</TableHead>
              <TableHead className="min-w-[240px]">備考</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {documents.map((doc) => {
              const docSamples = (doc.sampleIds ?? [])
                .map((id) => sampleById.get(id))
                .filter((sample): sample is DocumentSample => Boolean(sample))

              return (
                <TableRow key={doc.no}>
                  <TableCell className="align-top text-sm text-muted-foreground">
                    {doc.no}
                  </TableCell>
                  <TableCell className="align-top">
                    <p className="whitespace-pre-line text-sm font-medium text-foreground">
                      {doc.name}
                    </p>
                    {docSamples.length > 0 && (
                      <div className="mt-2 flex flex-wrap gap-2">
                        {docSamples.map((sample) => (
                          <SampleDialog key={sample.id} sample={sample} />
                        ))}
                      </div>
                    )}
                  </TableCell>
                  <TableCell className="align-top whitespace-pre-line text-sm">
                    {doc.copyType}
                  </TableCell>
                  <TableCell className="align-top whitespace-normal text-sm">
                    {doc.issuer ?? '—'}
                  </TableCell>
                  <TableCell className="align-top whitespace-normal">
                    {doc.notes.length === 0 ? (
                      <span className="text-sm text-muted-foreground">—</span>
                    ) : (
                      <ul className="space-y-1">
                        {doc.notes.map((note) => (
                          <li key={note} className="text-xs leading-5 text-muted-foreground">
                            {note}
                          </li>
                        ))}
                      </ul>
                    )}
                  </TableCell>
                </TableRow>
              )
            })}
          </TableBody>
        </Table>
      </div>
    </div>
  )
}
