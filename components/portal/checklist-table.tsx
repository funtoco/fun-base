import { Badge } from '@/components/ui/badge'
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table'
import {
  COPY_TYPE_LABELS,
  REQUIREMENT_STATUS_LABELS,
  type CaseDocumentRequirement,
  type GroupedRequirements,
  type RequirementStatus,
} from '@/lib/portal/types'
import { Building2, User } from 'lucide-react'

function statusVariant(
  status: RequirementStatus
): 'default' | 'secondary' | 'destructive' | 'outline' {
  switch (status) {
    case 'approved':
      return 'default'
    case 'needs_fix':
      return 'destructive'
    case 'reviewing':
      return 'outline'
    case 'not_submitted':
    default:
      return 'secondary'
  }
}

function RequirementRows({ items }: { items: CaseDocumentRequirement[] }) {
  return (
    <>
      {items.map((item) => (
        <TableRow key={item.id}>
          <TableCell className="font-medium">{item.name}</TableCell>
          <TableCell>
            {item.isRequired ? (
              <Badge variant="outline" className="border-primary/30 text-primary">
                必須
              </Badge>
            ) : (
              <span className="text-sm text-muted-foreground">任意</span>
            )}
          </TableCell>
          <TableCell>
            {item.copyType ? (
              <span className="text-sm">{COPY_TYPE_LABELS[item.copyType]}</span>
            ) : (
              <span className="text-muted-foreground">-</span>
            )}
          </TableCell>
          <TableCell>
            <Badge variant={statusVariant(item.status)}>
              {REQUIREMENT_STATUS_LABELS[item.status]}
            </Badge>
          </TableCell>
        </TableRow>
      ))}
    </>
  )
}

function ChecklistSection({
  title,
  icon,
  items,
  emptyLabel,
}: {
  title: string
  icon: React.ReactNode
  items: CaseDocumentRequirement[]
  emptyLabel: string
}) {
  return (
    <div className="rounded-xl border border-border bg-card shadow-sm">
      <div className="flex items-center gap-2 border-b border-border px-4 py-3">
        {icon}
        <h4 className="text-sm font-semibold text-foreground">{title}</h4>
        <span className="text-xs text-muted-foreground">（{items.length}件）</span>
      </div>
      {items.length === 0 ? (
        <p className="px-4 py-6 text-center text-sm text-muted-foreground">
          {emptyLabel}
        </p>
      ) : (
        <div className="overflow-x-auto">
          <Table className="min-w-[560px]">
            <TableHeader>
              <TableRow>
                <TableHead>書類名</TableHead>
                <TableHead className="w-[100px]">必須/任意</TableHead>
                <TableHead className="w-[100px]">原本/写し</TableHead>
                <TableHead className="w-[120px]">ステータス</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              <RequirementRows items={items} />
            </TableBody>
          </Table>
        </div>
      )}
    </div>
  )
}

export function ChecklistTable({ requirements }: { requirements: GroupedRequirements }) {
  return (
    <div className="space-y-6">
      <ChecklistSection
        title="会社・事業所の書類"
        icon={<Building2 className="h-4 w-4 text-muted-foreground" />}
        items={requirements.office}
        emptyLabel="会社の必要書類はまだありません。"
      />

      <div className="space-y-4">
        <h4 className="text-sm font-semibold text-foreground">人材ごとの書類</h4>
        {requirements.persons.length === 0 ? (
          <p className="rounded-xl border border-dashed border-border px-4 py-6 text-center text-sm text-muted-foreground">
            まだ人材が追加されていません。「人材を追加」から人材を選ぶと、その人の必要書類が表示されます。
          </p>
        ) : (
          requirements.persons.map((group) => (
            <ChecklistSection
              key={group.personId}
              title={group.personName ?? '（氏名未取得）'}
              icon={<User className="h-4 w-4 text-muted-foreground" />}
              items={group.items}
              emptyLabel="この人材の必要書類はまだ生成されていません。"
            />
          ))
        )}
      </div>
    </div>
  )
}
