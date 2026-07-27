import Link from 'next/link'
import { ArrowLeft } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { NewCaseForm } from '@/components/portal/new-case-form'
import { getAccessibleOffices } from '@/lib/portal/applications'

export const dynamic = 'force-dynamic'

export default async function NewApplicationPage() {
  const offices = await getAccessibleOffices()

  return (
    <div className="space-y-6 p-6">
      <div>
        <Button asChild variant="ghost" size="sm" className="mb-2 -ml-2 gap-1">
          <Link href="/applications">
            <ArrowLeft className="h-4 w-4" />
            申請ポータルに戻る
          </Link>
        </Button>
        <h1 className="text-3xl font-bold text-foreground">新規案件</h1>
        <p className="mt-2 text-muted-foreground">
          事業所と申請の内容を選ぶと、必要書類のチェックリストが自動で作られます。人材は作成後に追加できます。
        </p>
      </div>

      <NewCaseForm offices={offices} />
    </div>
  )
}
