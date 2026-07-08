import { HelpCircle, Mail, Search } from "lucide-react"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { faqSections, quickStartSteps } from "@/lib/funbase-faq"

const supportTips = [
  "画面名（例：ビザ進捗管理、人材詳細）",
  "対象者名",
  "確認したいこと・困っていること",
]

export default function FaqPage() {
  return (
    <div className="min-h-full bg-muted/20">
      <div className="mx-auto flex max-w-6xl flex-col gap-8 px-6 py-8 lg:px-10">
        <section className="overflow-hidden rounded-3xl border bg-gradient-to-br from-primary/10 via-background to-background p-6 shadow-sm md:p-8">
          <div className="max-w-3xl space-y-4">
            <div className="w-fit rounded-full bg-secondary px-3 py-1 text-xs font-medium text-secondary-foreground">
              企業様向け FunBaseガイド
            </div>
            <div className="space-y-3">
              <h1 className="text-3xl font-bold tracking-tight text-foreground md:text-4xl">
                よくある問い合わせ
              </h1>
              <p className="text-base leading-7 text-muted-foreground md:text-lg">
                はじめてFunBaseを使う企業担当者様向けに、最初に見る場所と困ったときの確認方法をまとめました。
                忙しい方は、まず下の3ステップだけ見れば大丈夫です。
              </p>
            </div>
          </div>
        </section>

        <section className="grid gap-4 md:grid-cols-3">
          {quickStartSteps.map((step) => (
            <Card key={step.title} className="rounded-2xl border bg-background shadow-sm">
              <CardHeader className="pb-3">
                <CardTitle className="text-base">{step.title}</CardTitle>
              </CardHeader>
              <CardContent>
                <p className="text-sm leading-6 text-muted-foreground">{step.description}</p>
              </CardContent>
            </Card>
          ))}
        </section>

        <section className="grid gap-6 lg:grid-cols-[1fr_320px]">
          <div className="space-y-6">
            {faqSections.map((section) => (
              <Card key={section.title} className="rounded-2xl border bg-background shadow-sm">
                <CardHeader className="gap-2">
                  <div className="flex items-start gap-3">
                    <div className="rounded-full bg-primary/10 p-2 text-primary">
                      <HelpCircle className="h-5 w-5" />
                    </div>
                    <div>
                      <CardTitle className="text-xl">{section.title}</CardTitle>
                      <p className="mt-1 text-sm text-muted-foreground">{section.description}</p>
                    </div>
                  </div>
                </CardHeader>
                <CardContent className="space-y-4">
                  {section.items.map((item) => (
                    <div key={item.question} className="rounded-xl border bg-muted/20 p-4">
                      <h3 className="font-medium text-foreground">Q. {item.question}</h3>
                      <p className="mt-2 text-sm leading-6 text-muted-foreground">A. {item.answer}</p>
                    </div>
                  ))}
                </CardContent>
              </Card>
            ))}
          </div>

          <aside className="space-y-4 lg:sticky lg:top-6 lg:self-start">
            <Card className="rounded-2xl border bg-background shadow-sm">
              <CardHeader>
                <CardTitle className="flex items-center gap-2 text-lg">
                  <Search className="h-5 w-5 text-primary" />
                  早く確認するコツ
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-3 text-sm leading-6 text-muted-foreground">
                <p>人材名が分かる場合は、まず「人材一覧」で検索してください。</p>
                <p>全体の状況を見たい場合は「ホーム」や「タイムライン」から確認するのがおすすめです。</p>
              </CardContent>
            </Card>

            <Card className="rounded-2xl border bg-background shadow-sm">
              <CardHeader>
                <CardTitle className="flex items-center gap-2 text-lg">
                  <Mail className="h-5 w-5 text-primary" />
                  問い合わせ時に伝えること
                </CardTitle>
              </CardHeader>
              <CardContent>
                <ul className="space-y-2 text-sm text-muted-foreground">
                  {supportTips.map((tip) => (
                    <li key={tip} className="flex gap-2">
                      <span className="mt-2 h-1.5 w-1.5 shrink-0 rounded-full bg-primary" />
                      <span>{tip}</span>
                    </li>
                  ))}
                </ul>
              </CardContent>
            </Card>
          </aside>
        </section>
      </div>
    </div>
  )
}
