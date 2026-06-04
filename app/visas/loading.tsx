import { BoardLoadingSkeleton } from "@/components/ui/funbase-loading"

export default function Loading() {
  return (
    <div className="p-6 space-y-6">
      <div>
        <h1 className="text-3xl font-bold text-foreground">ビザ進捗管理</h1>
        <p className="text-muted-foreground mt-2">ビザ申請の進捗状況確認</p>
      </div>
      <BoardLoadingSkeleton />
    </div>
  )
}
