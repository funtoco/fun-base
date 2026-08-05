import Link from 'next/link'
import { ClipboardList } from 'lucide-react'
import { Badge } from '@/components/ui/badge'
import { EmptyState } from '@/components/ui/empty-state'
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table'
import { listCases } from '@/lib/portal/applications'
import {
  APPLICATION_CATEGORY_LABELS,
  CASE_STATUS_LABELS,
  ENTITY_TYPE_LABELS,
  FIELD_LABELS,
} from '@/lib/portal/types'

export const dynamic = 'force-dynamic'

export default async function ApplicationsPage() {
  const cases = await listCases()

  return (
    <div className="space-y-6 p-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold text-foreground">申請ポータル</h1>
          <p className="mt-2 text-muted-foreground">
            ビザ申請の案件と、必要書類のチェックリストを確認します。
          </p>
        </div>
      </div>

      {cases.length === 0 ? (
        <div className="rounded-xl border border-border bg-card shadow-sm">
          <EmptyState
            icon={<ClipboardList className="h-10 w-10" />}
            title="案件がまだありません"
            description="案件は担当者が用意します。準備ができると、ここに必要書類のチェックリストが表示されます。"
          />
        </div>
      ) : (
        <div className="overflow-x-auto rounded-xl border border-border bg-card shadow-sm">
          <Table className="min-w-[880px]">
            <TableHeader>
              <TableRow>
                <TableHead>タイトル / 事業所</TableHead>
                <TableHead className="w-[140px]">分野</TableHead>
                <TableHead className="w-[120px]">種別</TableHead>
                <TableHead className="w-[100px]">初回/更新</TableHead>
                <TableHead className="w-[130px]">ステータス</TableHead>
                <TableHead className="w-[120px]">管理番号</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {cases.map((c) => (
                <TableRow key={c.id} className="cursor-pointer">
                  <TableCell>
                    <Link
                      href={`/applications/${c.id}`}
                      className="block font-medium text-foreground hover:underline"
                    >
                      {c.title || c.offices[0]?.name || '無題の案件'}
                    </Link>
                    {c.offices.length > 0 && (
                      <span className="text-xs text-muted-foreground">
                        {c.offices.map((o) => o.name ?? '（名称未取得）').join('／')}
                      </span>
                    )}
                  </TableCell>
                  <TableCell className="text-sm">{FIELD_LABELS[c.field]}</TableCell>
                  <TableCell className="text-sm">
                    {ENTITY_TYPE_LABELS[c.entityType]}
                  </TableCell>
                  <TableCell className="text-sm">
                    {APPLICATION_CATEGORY_LABELS[c.applicationCategory]}
                  </TableCell>
                  <TableCell>
                    <Badge variant="secondary">{CASE_STATUS_LABELS[c.status]}</Badge>
                  </TableCell>
                  <TableCell className="text-sm text-muted-foreground">
                    {c.managementNumber || '-'}
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      )}
    </div>
  )
}
