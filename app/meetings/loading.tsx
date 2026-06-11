import { RecordListLoadingSkeleton } from "@/components/ui/funbase-loading"

export default function Loading() {
  return (
    <div className="p-6 space-y-6">
      <div>
        <h1 className="text-3xl font-bold text-foreground">面談一覧</h1>
        <p className="text-muted-foreground mt-2">定期面談の記録と定期面談レポートを管理</p>
      </div>
      <RecordListLoadingSkeleton />
    </div>
  )
}
