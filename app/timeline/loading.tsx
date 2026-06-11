import { RecordListLoadingSkeleton } from "@/components/ui/funbase-loading"

export default function Loading() {
  return (
    <div className="p-6 space-y-6">
      <div>
        <h1 className="text-3xl font-bold text-foreground">タイムライン</h1>
        <p className="text-muted-foreground mt-2">ビザ進捗、定期面談、日々対応を時系列で確認</p>
      </div>
      <RecordListLoadingSkeleton />
    </div>
  )
}
