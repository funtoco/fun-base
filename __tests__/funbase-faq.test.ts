import { describe, expect, it } from "vitest"
import { faqSections, quickStartSteps } from "@/lib/funbase-faq"

describe("FunBase FAQ content", () => {
  it("has a short first-use flow for busy company users", () => {
    expect(quickStartSteps).toHaveLength(3)
    expect(quickStartSteps.map((step) => step.title)).toEqual([
      "1. ログインする",
      "2. ホームで全体を確認する",
      "3. 気になる人材を開く",
    ])
  })

  it("covers the core questions from company users", () => {
    const questions = faqSections.flatMap((section) => section.items.map((item) => item.question))

    expect(questions).toContain("まず何を確認すれば良いですか？")
    expect(questions).toContain("ビザの進捗はどこで確認できますか？")
    expect(questions).toContain("面談や日々のサポート内容はどこで確認できますか？")
    expect(questions).toContain("人材情報を手動で新規登録する方法を教えてください")
    expect(questions).toContain("困ったときは誰に連絡すれば良いですか？")
  })

  it("adds a shareable manual person registration guide with FunBase-specific cautions", () => {
    const manualRegistrationItem = faqSections
      .flatMap((section) => section.items)
      .find((item) => item.id === "manual-person-registration")

    expect(manualRegistrationItem).toBeDefined()
    expect(manualRegistrationItem?.question).toBe("人材情報を手動で新規登録する方法を教えてください")
    expect(manualRegistrationItem?.answer).toContain("左メニューの「人材一覧」")
    expect(manualRegistrationItem?.answer).toContain("右上の「新規登録」")
    expect(manualRegistrationItem?.answer).toContain("Funtocoの支援内容や面談・サポート記録は自動では連携されません")
    expect(manualRegistrationItem?.answer).toContain("FunEdu側には反映されません")
    expect(manualRegistrationItem?.answer).not.toContain("Kintone")
  })

  it("uses polite customer-facing wording", () => {
    const faqText = [
      ...quickStartSteps.flatMap((step) => [step.title, step.description]),
      ...faqSections.flatMap((section) => [
        section.title,
        section.description,
        ...section.items.flatMap((item) => [item.question, item.answer]),
      ]),
    ].join("\n")

    expect(faqText).toContain("お使いいただ")
    expect(faqText).toContain("ご確認いただ")
    expect(faqText).not.toContain("見れば大丈夫")
    expect(faqText).not.toContain("使う企業")
  })
})
