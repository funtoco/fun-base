import { ListPanelLoadingSkeleton } from "@/components/ui/funbase-loading"

export default function Loading() {
  return (
    <div className="p-6 space-y-6">
      <div>
        <h1 className="text-3xl font-bold text-foreground">面談記録</h1>
        <p className="text-muted-foreground mt-2">面談の記録と内容を管理</p>
      </div>
      <ListPanelLoadingSkeleton />
    </div>
  )
}
