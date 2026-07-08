import { describe, expect, it } from "vitest"
import { faqSections, quickStartSteps } from "@/lib/funbase-faq"

describe("FunBase FAQ content", () => {
  it("has a short first-use flow for busy company users", () => {
    expect(quickStartSteps).toHaveLength(3)
    expect(quickStartSteps.map((step) => step.title)).toEqual([
      "1. ログインする",
      "2. ホームで全体を見る",
      "3. 気になる人材を開く",
    ])
  })

  it("covers the core questions from company users", () => {
    const questions = faqSections.flatMap((section) => section.items.map((item) => item.question))

    expect(questions).toContain("まず何を見れば良いですか？")
    expect(questions).toContain("ビザの進捗はどこで確認できますか？")
    expect(questions).toContain("面談や日々のサポート内容はどこで見られますか？")
    expect(questions).toContain("困ったときは誰に連絡すれば良いですか？")
  })
})
