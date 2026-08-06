import { Upload } from 'lucide-react'
import { MAX_UPLOAD_BYTES } from '@/lib/portal/storage'

const MAX_UPLOAD_MB = Math.floor(MAX_UPLOAD_BYTES / (1024 * 1024))

// 数値と対応形式は lib/portal/storage.ts と components/portal/checklist-table.tsx に合わせている。
const RULES = [
  `1ファイルあたりの容量上限: ${MAX_UPLOAD_MB}MB`,
  '対応形式: PDF / JPG / PNG / WebP / HEIC',
  '申請書類作成フォームのみ Excel（.xlsx）',
  '原本は Funtoco 大阪本社宛にご郵送ください',
  '書類有効期限は発行日から3ヶ月です',
]

export function SubmissionRules() {
  return (
    <section className="rounded-xl border border-amber-200 bg-amber-50/60 p-4">
      <div className="flex items-center gap-2">
        <Upload className="h-4 w-4 text-amber-700" aria-hidden />
        <h2 className="text-sm font-medium text-amber-900">書類の提出について</h2>
      </div>
      <ul className="mt-3 space-y-1.5">
        {RULES.map((rule) => (
          <li key={rule} className="text-xs leading-5 text-amber-900">
            {rule}
          </li>
        ))}
      </ul>
    </section>
  )
}
