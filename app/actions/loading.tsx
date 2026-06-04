import { ListPanelLoadingSkeleton } from "@/components/ui/funbase-loading"

export default function Loading() {
  return (
    <div className="p-6 space-y-6">
      <div>
        <h1 className="text-3xl font-bold text-foreground">対応アクション</h1>
        <p className="text-muted-foreground mt-2">優先度と進捗を確認</p>
      </div>
      <ListPanelLoadingSkeleton />
    </div>
  )
}
