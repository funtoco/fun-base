import Link from 'next/link'
import { Building2, ChevronRight, Files, Route } from 'lucide-react'

interface GuideEntryCardsProps {
  guideHref: string
}

const ENTRIES = [
  {
    hash: '#flow',
    icon: Route,
    title: '申請手続きの流れ',
    description: '貴社・Funtoco・内定者が、それぞれ何をいつ行うかをまとめています。',
  },
  {
    hash: '#council',
    icon: Building2,
    title: '協議会への加入登録',
    description: '分野ごとの申し込み方法と、加入証明書の取得に必要な書類です。',
  },
  {
    hash: '#documents',
    icon: Files,
    title: '取得書類一覧',
    description: 'ご取得いただく書類と請求先。実物のサンプル画像も確認できます。',
  },
] as const

// 一覧ページの「最初にご確認ください」。実体はガイドページの各セクション。
export function GuideEntryCards({ guideHref }: GuideEntryCardsProps) {
  return (
    <section>
      <h2 className="mb-3 text-sm font-medium text-foreground">最初にご確認ください</h2>
      <div className="grid gap-3 sm:grid-cols-3">
        {ENTRIES.map((entry) => (
          <Link
            key={entry.hash}
            href={`${guideHref}${entry.hash}`}
            className="group rounded-xl border border-border bg-card p-4 shadow-sm transition-colors hover:border-primary/40"
          >
            <entry.icon className="h-5 w-5 text-primary" aria-hidden />
            <div className="mt-2 flex items-center gap-1">
              <span className="text-sm font-medium text-foreground">{entry.title}</span>
              <ChevronRight
                aria-hidden
                className="h-3.5 w-3.5 text-muted-foreground transition-transform group-hover:translate-x-0.5"
              />
            </div>
            <p className="mt-1 text-xs leading-5 text-muted-foreground">
              {entry.description}
            </p>
          </Link>
        ))}
      </div>
    </section>
  )
}
