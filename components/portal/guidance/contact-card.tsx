import { LifeBuoy } from 'lucide-react'

// 言い回しは lib/funbase-faq.ts の問い合わせ案内に揃えている。
const TIPS = ['案件名または管理番号', '対象の人材名', '確認したいこと・困っていること']

export function ContactCard() {
  return (
    <section className="rounded-xl border border-border bg-card p-4 shadow-sm">
      <div className="flex items-center gap-2">
        <LifeBuoy className="h-4 w-4 text-muted-foreground" aria-hidden />
        <h2 className="text-sm font-medium text-foreground">困ったときは</h2>
      </div>
      <p className="mt-3 text-xs leading-5 text-muted-foreground">
        通常の連絡ルートで Funtoco 担当者へご連絡ください。次の内容をあわせてお伝えいただくと、確認がスムーズです。
      </p>
      <ul className="mt-2 space-y-1.5">
        {TIPS.map((tip) => (
          <li key={tip} className="text-xs leading-5 text-foreground">
            {tip}
          </li>
        ))}
      </ul>
    </section>
  )
}
