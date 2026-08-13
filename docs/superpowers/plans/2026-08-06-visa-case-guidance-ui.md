# 申請ポータルのご案内UI Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** メールで配布している在留資格申請のご案内資料をアプリ内に取り込み、`/applications` と新規 `/applications/guide` で案件の属性に合った内容だけを表示する。

**Architecture:** ご案内の中身は `lib/portal/guidance/` に純粋なデータとして置き、`selectGuidance()` が `entityType` × `applicationCategory` × `field` で絞り込む。DB アクセスを含まないので、画面側は Server Component でそのまま描画でき、クライアント側は切り替えトグルとサンプルダイアログの2つだけに限定できる。書類サンプル画像は PDF から切り出したものを `public/guidance/samples/` に置く。

**Tech Stack:** Next.js 14 (App Router, React 18), TypeScript, Tailwind CSS v4, shadcn/ui, vitest（`environment: 'node'`）, poppler (`pdftoppm`), `sips`

**設計ドキュメント:** [docs/superpowers/specs/2026-08-06-visa-case-guidance-ui-design.md](../specs/2026-08-06-visa-case-guidance-ui-design.md)

---

## File Structure

| ファイル | 責務 |
|---|---|
| `lib/portal/guidance/types.ts` | ガイダンス専用の型。DB 由来の型は `lib/portal/types.ts` から import する |
| `lib/portal/guidance/flow.ts` | 申請手続きの流れ（3レーン分のステップ配列） |
| `lib/portal/guidance/council.ts` | 協議会加入登録方法（分野別） |
| `lib/portal/guidance/documents.ts` | 取得書類・準備書類のリスト |
| `lib/portal/guidance/samples.ts` | 書類サンプル画像のメタ |
| `lib/portal/guidance/index.ts` | `selectGuidance()` と `guidanceDefaultsFromCases()`。画面が触る唯一の入口 |
| `components/portal/guidance/flow-summary.tsx` | 一覧の横並びステップ（貴社レーンのみ） |
| `components/portal/guidance/guide-entry-cards.tsx` | 一覧の「最初にご確認ください」3枚 |
| `components/portal/guidance/submission-rules.tsx` | 一覧右カラム「書類の提出について」 |
| `components/portal/guidance/contact-card.tsx` | 一覧右カラム「困ったときは」 |
| `components/portal/guidance/flow-lanes.tsx` | ガイドページの3レーン図 |
| `components/portal/guidance/council-section.tsx` | ガイドページの協議会セクション |
| `components/portal/guidance/document-table.tsx` | ガイドページの取得書類テーブル |
| `components/portal/guidance/sample-dialog.tsx` | サンプル画像ダイアログ（Client） |
| `components/portal/guidance/guidance-switcher.tsx` | 法人⇄個人事業主・初回⇄更新のトグル（Client） |
| `app/applications/guide/page.tsx` | ガイドページ本体（Server） |
| `scripts/extract-guidance-samples.sh` | PDF → `public/guidance/samples/*.jpg` |
| `__tests__/portal-guidance.test.ts` | `selectGuidance` の分岐テスト |

---

### Task 1: 型定義と申請の流れ

**Files:**
- Create: `lib/portal/guidance/types.ts`
- Create: `lib/portal/guidance/flow.ts`
- Create: `lib/portal/guidance/index.ts`
- Test: `__tests__/portal-guidance.test.ts`

設計ドキュメントの型に `FlowStep.shortTitle` を追加している。一覧ページの横並び表示で `title`（例: `書類の作成 / 準備`）が長すぎるため、短縮名を別に持つ。

- [ ] **Step 1: 型定義を書く**

`lib/portal/guidance/types.ts`:

```ts
// ご案内資料（在留資格申請手続きのご案内）をデータとして持つための型。
// DB 由来の型は lib/portal/types.ts をそのまま使う。

import type { ApplicationCategory, EntityType, Field } from '@/lib/portal/types'

export type FlowLane = 'company' | 'funtoco' | 'candidate'

export interface FlowNote {
  tone: 'info' | 'warning'
  body: string
}

export interface FlowStep {
  id: string
  lane: FlowLane
  title: string
  /** 一覧ページの横並び表示で使う短縮名。未指定なら title を使う。 */
  shortTitle?: string
  description?: string
  note?: FlowNote
  /** 未指定なら全 entityType に出す */
  entityTypes?: EntityType[]
  /** 未指定なら全 applicationCategory に出す */
  categories?: ApplicationCategory[]
}

export interface CouncilRequiredDocumentGroup {
  heading?: string
  items: string[]
}

export interface CouncilGuide {
  id: string
  label: string
  fields: Field[]
  /** 申し込み方法。空配列なら steps を出さず description だけ出す。 */
  steps: string[]
  requiredDocuments: CouncilRequiredDocumentGroup[]
  links: { label: string; url: string }[]
  /** 手順が用意されていない分野向けの一文 */
  description?: string
}

export interface RequiredDocument {
  no: number
  name: string
  /** 「原本」「写し」「原本 又は 写し」など資料の表記をそのまま持つ */
  copyType: string
  issuer: string | null
  notes: string[]
  /** 未指定なら全分野。営業許可証のように分野限定のものだけ指定する。 */
  fields?: Field[]
  sampleIds?: string[]
}

export interface DocumentSample {
  id: string
  title: string
  src: string
  /** next/image に渡す実寸。切り出しプリセットで決まる。 */
  width: number
  height: number
  caption?: string
  /** 「交付請求時のポイント」のような手順 */
  points?: string[]
  warning?: string
}

export interface GuidanceCondition {
  entityType: EntityType
  category: ApplicationCategory
  field: Field | null
}

export interface Guidance extends GuidanceCondition {
  flow: Record<FlowLane, FlowStep[]>
  councils: CouncilGuide[]
  documents: RequiredDocument[]
  samples: DocumentSample[]
}
```

- [ ] **Step 2: 流れのデータを書く**

`lib/portal/guidance/flow.ts`:

```ts
import type { FlowStep } from './types'

// 「在留資格申請手続きの流れ」（ご案内資料 P01）をデータ化したもの。
// 配列の順序がそのまま表示順になる。
export const FLOW_STEPS: FlowStep[] = [
  {
    id: 'company-prepare-initial-corporate',
    lane: 'company',
    title: '書類の作成 / 準備',
    shortTitle: '書類の準備',
    description: '法人書類をご取得ください。揃い次第 Funtoco 大阪本社宛にご郵送ください。',
    note: { tone: 'warning', body: '書類有効期限は発行日から3ヶ月です。' },
    entityTypes: ['corporate'],
    categories: ['initial'],
  },
  {
    id: 'company-prepare-initial-sole',
    lane: 'company',
    title: '書類の作成 / 準備',
    shortTitle: '書類の準備',
    description:
      '個人事業主として必要な書類をご取得ください。揃い次第 Funtoco 大阪本社宛にご郵送ください。',
    note: { tone: 'warning', body: '書類有効期限は発行日から3ヶ月です。' },
    entityTypes: ['sole_proprietor'],
    categories: ['initial'],
  },
  {
    id: 'company-prepare-renewal',
    lane: 'company',
    title: '書類の準備',
    shortTitle: '書類の準備',
    description: '前回申請している書類一式などをご準備ください。',
    categories: ['renewal'],
  },
  {
    id: 'company-council-join',
    lane: 'company',
    title: '協議会加入登録 / 入会申請',
    shortTitle: '協議会登録',
    description: '分野ごとの協議会へ加入し、加入証明書を取得します。',
    categories: ['initial'],
  },
  {
    id: 'company-council-check',
    lane: 'company',
    title: '協議会登録確認（配属事業所の登録）',
    shortTitle: '協議会確認',
    description: '配属先事業所が協議会に登録されているかご確認ください。',
    categories: ['renewal'],
  },
  {
    id: 'company-review',
    lane: 'company',
    title: '確認・内容修正 / 承諾',
    shortTitle: '内容の確認',
    description: 'Funtoco からお送りする修正提案をご確認ください。',
  },
  {
    id: 'company-seal-corporate',
    lane: 'company',
    title: '書類への押印対応 / 返送',
    shortTitle: '押印・返送',
    note: {
      tone: 'warning',
      body: '法人印押印のうえ、弊社大阪本社宛にご返送ください。',
    },
    entityTypes: ['corporate'],
  },
  {
    id: 'company-seal-sole',
    lane: 'company',
    title: '書類への押印対応 / 返送',
    shortTitle: '押印・返送',
    note: {
      tone: 'warning',
      body: '押印（実印又は認印）のうえ、弊社大阪本社宛にご返送ください。',
    },
    entityTypes: ['sole_proprietor'],
  },
  {
    id: 'company-interview',
    lane: 'company',
    title: '行政書士と申請内容確認面談',
    shortTitle: '確認面談',
  },
  {
    id: 'funtoco-review',
    lane: 'funtoco',
    title: '確認 / 修正提案',
    note: {
      tone: 'info',
      body: '入管で審査がスムーズになるよう、メールで内容のすり合わせをいたします。変更点あればご教示くださいませ。',
    },
  },
  {
    id: 'funtoco-send-seal',
    lane: 'funtoco',
    title: '押印書類郵送',
  },
  {
    id: 'funtoco-send-signature',
    lane: 'funtoco',
    title: '本人サイン書類準備 / 送付',
  },
  {
    id: 'funtoco-precheck',
    lane: 'funtoco',
    title: '申請に向けた事前確認',
  },
  {
    id: 'funtoco-submit',
    lane: 'funtoco',
    title: '行政書士による申請手続き',
  },
  {
    id: 'funtoco-result',
    lane: 'funtoco',
    title: '申請結果の共有（行政書士からの連絡に基づき）',
    note: {
      tone: 'warning',
      body: '審査中、出入国在留管理局からの指示により、必要に応じ追加 / 修正の対応を行います。',
    },
  },
  {
    id: 'candidate-documents',
    lane: 'candidate',
    title: '本人取得書類準備',
  },
  {
    id: 'candidate-sign',
    lane: 'candidate',
    title: '本人サイン / 返送',
  },
  {
    id: 'candidate-interview',
    lane: 'candidate',
    title: '行政書士と申請内容確認面談',
  },
]

export const FLOW_LANE_LABELS: Record<FlowStep['lane'], string> = {
  company: '貴社にご対応いただくこと',
  funtoco: 'Funtoco が行うこと',
  candidate: '内定者ご本人が行うこと',
}
```

- [ ] **Step 3: 失敗するテストを書く**

`__tests__/portal-guidance.test.ts`:

```ts
import { describe, it, expect } from 'vitest'
import { selectGuidance } from '@/lib/portal/guidance'

describe('selectGuidance: 申請の流れ', () => {
  it('法人では押印ステップの注記が「法人印」になる', () => {
    const g = selectGuidance({ entityType: 'corporate', category: 'initial' })
    const seal = g.flow.company.filter((s) => s.title === '書類への押印対応 / 返送')
    expect(seal).toHaveLength(1)
    expect(seal[0].note?.body).toContain('法人印')
  })

  it('個人事業主では押印ステップの注記が「実印又は認印」になる', () => {
    const g = selectGuidance({ entityType: 'sole_proprietor', category: 'initial' })
    const seal = g.flow.company.filter((s) => s.title === '書類への押印対応 / 返送')
    expect(seal).toHaveLength(1)
    expect(seal[0].note?.body).toContain('実印又は認印')
  })

  it('初回は協議会加入登録、更新は協議会登録確認のステップが出る', () => {
    const initial = selectGuidance({ entityType: 'corporate', category: 'initial' })
    const renewal = selectGuidance({ entityType: 'corporate', category: 'renewal' })
    expect(initial.flow.company.map((s) => s.id)).toContain('company-council-join')
    expect(initial.flow.company.map((s) => s.id)).not.toContain('company-council-check')
    expect(renewal.flow.company.map((s) => s.id)).toContain('company-council-check')
    expect(renewal.flow.company.map((s) => s.id)).not.toContain('company-council-join')
  })

  it('Funtoco と内定者のレーンは条件によらず同じ', () => {
    const a = selectGuidance({ entityType: 'corporate', category: 'initial' })
    const b = selectGuidance({ entityType: 'sole_proprietor', category: 'renewal' })
    expect(a.flow.funtoco.map((s) => s.id)).toEqual(b.flow.funtoco.map((s) => s.id))
    expect(a.flow.candidate.map((s) => s.id)).toEqual(b.flow.candidate.map((s) => s.id))
  })
})
```

- [ ] **Step 4: テストが失敗することを確認する**

```bash
npx vitest run __tests__/portal-guidance.test.ts
```

期待: `Failed to resolve import "@/lib/portal/guidance"` で失敗する。

- [ ] **Step 5: selectGuidance を実装する（流れのみ）**

`lib/portal/guidance/index.ts`:

```ts
import type { ApplicationCategory, EntityType, Field } from '@/lib/portal/types'
import { FLOW_STEPS } from './flow'
import type { FlowLane, FlowStep, Guidance } from './types'

export * from './types'
export { FLOW_LANE_LABELS } from './flow'

const LANES: FlowLane[] = ['company', 'funtoco', 'candidate']

function matchesStep(
  step: FlowStep,
  entityType: EntityType,
  category: ApplicationCategory
): boolean {
  if (step.entityTypes && !step.entityTypes.includes(entityType)) return false
  if (step.categories && !step.categories.includes(category)) return false
  return true
}

function selectFlow(
  entityType: EntityType,
  category: ApplicationCategory
): Record<FlowLane, FlowStep[]> {
  const matched = FLOW_STEPS.filter((step) => matchesStep(step, entityType, category))
  return LANES.reduce(
    (acc, lane) => {
      acc[lane] = matched.filter((step) => step.lane === lane)
      return acc
    },
    {} as Record<FlowLane, FlowStep[]>
  )
}

export function selectGuidance(input: {
  entityType: EntityType
  category: ApplicationCategory
  field?: Field | null
}): Guidance {
  const field = input.field ?? null
  return {
    entityType: input.entityType,
    category: input.category,
    field,
    flow: selectFlow(input.entityType, input.category),
    councils: [],
    documents: [],
    samples: [],
  }
}
```

`GuidanceCondition` は `export * from './types'` 経由で公開されるので、ここで個別に re-export しないこと（重複 export になる）。

- [ ] **Step 6: テストが通ることを確認する**

```bash
npx vitest run __tests__/portal-guidance.test.ts
```

期待: 4 tests passed。

- [ ] **Step 7: 型チェックを通す**

```bash
npm run typecheck
```

期待: エラーなし。

- [ ] **Step 8: コミット**

```bash
git add lib/portal/guidance/types.ts lib/portal/guidance/flow.ts lib/portal/guidance/index.ts __tests__/portal-guidance.test.ts
git commit -m "feat(portal): ご案内の申請手続きの流れをデータ化"
```

---

### Task 2: 協議会加入登録方法

**Files:**
- Create: `lib/portal/guidance/council.ts`
- Modify: `lib/portal/guidance/index.ts`
- Test: `__tests__/portal-guidance.test.ts`

- [ ] **Step 1: 失敗するテストを追加する**

`__tests__/portal-guidance.test.ts` の末尾に追記:

```ts
describe('selectGuidance: 協議会', () => {
  it('分野が介護なら介護の協議会が先頭に来る', () => {
    const g = selectGuidance({ entityType: 'corporate', category: 'initial', field: 'care' })
    expect(g.councils[0].id).toBe('care')
  })

  it('分野が外食業なら外食・飲食料品製造の協議会が先頭に来る', () => {
    const g = selectGuidance({
      entityType: 'corporate',
      category: 'initial',
      field: 'food_service',
    })
    expect(g.councils[0].id).toBe('food')
  })

  it('分野が宿泊なら「その他分野」が先頭に来る', () => {
    const g = selectGuidance({
      entityType: 'corporate',
      category: 'initial',
      field: 'accommodation',
    })
    expect(g.councils[0].id).toBe('other')
  })

  it('分野が未指定でも協議会は全件返る', () => {
    const g = selectGuidance({ entityType: 'corporate', category: 'initial' })
    expect(g.councils.map((c) => c.id)).toEqual(['care', 'food', 'other'])
  })
})
```

- [ ] **Step 2: テストが失敗することを確認する**

```bash
npx vitest run __tests__/portal-guidance.test.ts
```

期待: 協議会の4テストが `expected undefined to be 'care'` などで失敗する。

- [ ] **Step 3: 協議会のデータを書く**

`lib/portal/guidance/council.ts`:

```ts
import type { CouncilGuide } from './types'

// 「協議会加入登録方法」（ご案内資料 P02）をデータ化したもの。
// links の URL は元資料がラスタ画像でリンク注釈を持たず抽出できなかったため空。
// URL の提供を受け次第ここに追加する。
export const COUNCIL_INTRO =
  '特定技能で外国人を受け入れるには、各分野ごとの協議会へ加入し、『加入証明書』を取得する必要があります。'

export const COUNCIL_GUIDES: CouncilGuide[] = [
  {
    id: 'care',
    label: '介護',
    fields: ['care'],
    steps: [
      'Webでアカウントの発行を申請する。詳細は基本操作マニュアルをご参照ください。',
      'ログイン後「構成員名簿の情報公開可否」の回答を登録する。',
      '受け入れ機関 / 受け入れ事業所情報を登録し、入会申請を行う。事業所登録後に審査が行われ、約2週間で加入証明書が発行される。',
      '証明書は各種手続き『入会証明書ダウンロード』にてダウンロードする。ご登録いただいた事業所でのみ就労が可能なため、就労する事業所が複数の場合は複数登録する必要がある。',
    ],
    requiredDocuments: [
      {
        items: [
          '事業所の指定通知書 — 『医療保険』『介護保険』『障害福祉』サービス等の指定を受けた際に都道府県や市区町村等から通知される「指定通知書」の写しをご提出ください。',
          '介護分野における業務を行わせる事業所の概要書等（分野参考様式第1-2号）',
        ],
      },
    ],
    links: [],
  },
  {
    id: 'food',
    label: '外食業・飲食料品製造業',
    fields: ['food_service', 'food_manufacturing'],
    steps: [
      'Webで加入申請フォームを入力する。',
      '申請フォームを送信した後、協議会からメールが届く。',
      'メールに必要書類を添付し、ご返信いただく。ここから入会審査が行われる。メールで追加書類が求められる場合がある。',
      '承認後、約2週間〜1ヶ月で加入証明書がメールで送付される。',
    ],
    requiredDocuments: [
      {
        heading: '外食業分野',
        items: [
          '外食分野における特定技能外国人の受入れに関する誓約書（分野参考様式第14-1号）の写し',
          '営業許可証の写し',
        ],
      },
      {
        heading: '飲食料品製造業分野',
        items: [
          '飲食料品製造業分野における特定技能外国人の受入れに関する誓約書（分野参考様式第13-1号）の写し',
          '営業許可証の写し',
        ],
      },
    ],
    links: [],
  },
  {
    id: 'other',
    label: 'その他分野',
    fields: ['accommodation', 'other'],
    steps: [],
    requiredDocuments: [],
    links: [],
    description: '別途ご案内いたします。担当者へお問い合わせください。',
  },
]
```

- [ ] **Step 4: index.ts に協議会の選択を足す**

`lib/portal/guidance/index.ts` の import に追記:

```ts
import { COUNCIL_GUIDES } from './council'
import type { CouncilGuide, FlowLane, FlowStep, Guidance } from './types'
```

`export { FLOW_LANE_LABELS } from './flow'` の下に追記:

```ts
export { COUNCIL_INTRO } from './council'
```

`selectFlow` の下に追記:

```ts
function selectCouncils(field: Field | null): CouncilGuide[] {
  if (!field) return COUNCIL_GUIDES
  const matched = COUNCIL_GUIDES.filter((guide) => guide.fields.includes(field))
  const rest = COUNCIL_GUIDES.filter((guide) => !guide.fields.includes(field))
  return [...matched, ...rest]
}
```

`selectGuidance` の戻り値の `councils: []` を差し替える:

```ts
    councils: selectCouncils(field),
```

- [ ] **Step 5: テストが通ることを確認する**

```bash
npx vitest run __tests__/portal-guidance.test.ts
```

期待: 8 tests passed。

- [ ] **Step 6: コミット**

```bash
git add lib/portal/guidance/council.ts lib/portal/guidance/index.ts __tests__/portal-guidance.test.ts
git commit -m "feat(portal): ご案内の協議会加入登録方法をデータ化"
```

---

### Task 3: 取得書類・準備書類

**Files:**
- Create: `lib/portal/guidance/documents.ts`
- Modify: `lib/portal/guidance/index.ts`
- Test: `__tests__/portal-guidance.test.ts`

- [ ] **Step 1: 失敗するテストを追加する**

`__tests__/portal-guidance.test.ts` の末尾に追記:

```ts
describe('selectGuidance: 取得書類', () => {
  it('個人事業主 × 初回は8件', () => {
    const g = selectGuidance({ entityType: 'sole_proprietor', category: 'initial' })
    expect(g.documents).toHaveLength(8)
    expect(g.documents[0].name).toContain('住民票')
  })

  it('法人 × 初回は8件で、1件目が履歴事項全部証明書', () => {
    const g = selectGuidance({ entityType: 'corporate', category: 'initial' })
    expect(g.documents).toHaveLength(8)
    expect(g.documents[0].name).toBe('履歴事項全部証明書')
  })

  it('更新は entityType によらず3件', () => {
    const corp = selectGuidance({ entityType: 'corporate', category: 'renewal' })
    const sole = selectGuidance({ entityType: 'sole_proprietor', category: 'renewal' })
    expect(corp.documents).toHaveLength(3)
    expect(sole.documents).toHaveLength(3)
  })

  it('介護分野では営業許可証が落ちる', () => {
    const g = selectGuidance({ entityType: 'corporate', category: 'initial', field: 'care' })
    expect(g.documents).toHaveLength(7)
    expect(g.documents.some((d) => d.name.includes('営業許可証'))).toBe(false)
  })

  it('外食業分野では営業許可証が残る', () => {
    const g = selectGuidance({
      entityType: 'corporate',
      category: 'initial',
      field: 'food_service',
    })
    expect(g.documents).toHaveLength(8)
    expect(g.documents.some((d) => d.name.includes('営業許可証'))).toBe(true)
  })

  it('分野が未指定なら営業許可証を落とさない', () => {
    const g = selectGuidance({ entityType: 'corporate', category: 'initial' })
    expect(g.documents.some((d) => d.name.includes('営業許可証'))).toBe(true)
  })
})
```

- [ ] **Step 2: テストが失敗することを確認する**

```bash
npx vitest run __tests__/portal-guidance.test.ts
```

期待: 取得書類の6テストが `expected [] to have a length of 8` などで失敗する。

- [ ] **Step 3: 書類のデータを書く**

`lib/portal/guidance/documents.ts`:

```ts
import type { ApplicationCategory, EntityType } from '@/lib/portal/types'
import type { RequiredDocument } from './types'

// 「取得書類一覧」「準備書類一覧」（ご案内資料 P03-P05）をデータ化したもの。

export const DOCUMENTS_INTRO_INITIAL =
  '書類が揃い次第、Funtoco 大阪本社宛にご郵送ください。'

export const DOCUMENTS_INTRO_RENEWAL =
  '申請後、入管より追加で書類を提出するよう指示がある場合がございます。予めご了承ください。'

const BUSINESS_PERMIT: RequiredDocument = {
  no: 7,
  name: '[外食] 保健所長の営業許可証 / [宿泊] 旅館業許可証',
  copyType: '写し',
  issuer: null,
  notes: [
    '就業する事業所全ての営業許可書が必要です。',
    '有効期限内のものをご用意ください。',
  ],
  fields: ['food_service', 'accommodation'],
  sampleIds: ['business-permit-food', 'business-permit-lodging'],
}

const COUNCIL_CERTIFICATE: RequiredDocument = {
  no: 8,
  name: '特定技能協議会加入証明書',
  copyType: '写し',
  issuer: null,
  notes: ['[介護分野の場合] 配属先事業所がご登録されているかご確認ください。'],
}

const SOLE_PROPRIETOR_INITIAL: RequiredDocument[] = [
  {
    no: 1,
    name: '個人事業主の住民票の写し',
    copyType: '原本',
    issuer: '市区町村役場',
    notes: ['マイナンバー記載なし・本籍地記載ありのものが必要です。'],
    sampleIds: ['sp-residence-certificate'],
  },
  {
    no: 2,
    name: '①労働保険の適用事業所の場合: 労働保険料等納付証明書（未納なし証明）\n②労働保険の適用事業所でない場合: 労災保険に代わる民間保険の加入を証明する資料',
    copyType: '①原本 ②写し',
    issuer: '①労働局 ②—',
    notes: [
      '納付や換価の猶予を受けている場合は、納付の猶予許可通知書又は換価の猶予許可通知書の写しも必要です。',
    ],
    sampleIds: ['sp-labor-insurance-certificate'],
  },
  {
    no: 3,
    name: '個人事業主の納税証明書（その３）',
    copyType: '原本',
    issuer: '税務署',
    notes: [
      '該当税目: ①源泉所得税及び復興特別所得税 ②申告所得税及び復興特別所得税 ③消費税及び地方消費税 ④相続税 ⑤贈与税',
      '納税の猶予又は納付受託の適用を受けている場合は、当該適用がある旨の記載がある納税証明書及び未納がある税目についての納税証明書（その１）も必要です。',
    ],
    sampleIds: ['sp-tax-certificate-3'],
  },
  {
    no: 4,
    name: '健康保険・厚生年金保険の適用事業所の場合: 社会保険料納入状況回答票 または直近24か月分の健康保険・厚生年金保険料領収証書の写し',
    copyType: '原本 又は 写し',
    issuer: '日本年金機構 又は 年金事務所',
    notes: ['申請する月の前々月までの24か月分が必要です。'],
  },
  {
    no: 5,
    name: '健康保険・厚生年金保険の適用事業所でない場合\n①医療保険: マイナポータルの資格情報の写し又は資格確認書の写し、直近2年度分の国民健康保険料（税）納付証明書\n②国民年金: 被保険者記録照会回答票 または直近24か月分の国民年金保険料領収証書の写し',
    copyType: '①写し／原本 ②原本',
    issuer: '①市区町村役場 ②日本年金機構',
    notes: ['保険者番号・基礎年金番号は必ずマスキング（黒塗り）してください。'],
  },
  {
    no: 6,
    name: '直近2年度分の個人事業主の個人住民税の納税証明書',
    copyType: '原本',
    issuer: '市区町村役場',
    notes: [
      '納税緩和措置（換価の猶予、納税の猶予又は納付受託）の適用を受けている場合で、当該適用を受けていることが納税証明書に記載されていないときは、当該適用に係る通知書の写しも必要です。',
    ],
    sampleIds: ['sp-resident-tax-certificate'],
  },
  BUSINESS_PERMIT,
  COUNCIL_CERTIFICATE,
]

const CORPORATE_INITIAL: RequiredDocument[] = [
  {
    no: 1,
    name: '履歴事項全部証明書',
    copyType: '原本',
    issuer: '法務局',
    notes: [],
    sampleIds: ['corp-registry'],
  },
  {
    no: 2,
    name: '住民票（本籍地記載あり / マイナンバー記載無）',
    copyType: '原本',
    issuer: '市区町村役場',
    notes: [
      '業務執行に関与する役員 = 特定技能受け入れに関わる役員です。',
      '代表者の住民票をご用意ください。ただし、書類作成責任者が代表者ではない役員の場合は、書類作成責任者の住民票をご用意ください。',
    ],
    sampleIds: ['corp-residence-certificate'],
  },
  {
    no: 3,
    name: '労働保険料等納付証明書',
    copyType: '原本',
    issuer: '労働局',
    notes: [],
    sampleIds: ['corp-labor-insurance-certificate'],
  },
  {
    no: 4,
    name: '税務署発行の納税証明書（その３）\n税目は下記3つ全てが必要です。①源泉所得税及び復興特別所得税 ②法人税 ③消費税及び地方消費税',
    copyType: '原本',
    issuer: '税務署 / 国税庁',
    notes: ['市税事業所ではない点にご注意ください。'],
    sampleIds: ['corp-tax-certificate-3', 'corp-tax-certificate-3-form'],
  },
  {
    no: 5,
    name: '①社会保険料納入状況照会回答票 ②健康保険 / 厚生年金保険料領収証書（①②のいずれか）',
    copyType: '①原本 ②写し',
    issuer: '年金機構',
    notes: ['申請する月の前々月までの24か月分が必要です。'],
    sampleIds: ['social-insurance-inquiry', 'social-insurance-receipt'],
  },
  {
    no: 6,
    name: '法人住民税納税証明書',
    copyType: '原本',
    issuer: '市税事業所',
    notes: ['直近1年度分が必要です。', '社会福祉法人の場合は不要です。'],
    sampleIds: ['corp-resident-tax-certificate'],
  },
  BUSINESS_PERMIT,
  COUNCIL_CERTIFICATE,
]

const RENEWAL: RequiredDocument[] = [
  {
    no: 1,
    name: '前回申請している書類一式',
    copyType: '—',
    issuer: null,
    notes: [
      '前回申請した書類のデータの送付、または添付のエクセルに情報をご入力ください。',
    ],
  },
  {
    no: 2,
    name: '特定技能協議会加入証明書',
    copyType: '写し',
    issuer: null,
    notes: [
      '介護分野の場合、配属先事業所がご登録されているかご確認ください。',
      '有効期限を確認し、写しをお送りください。',
    ],
  },
  {
    no: 3,
    name: '[外食] 保健所長の営業許可証 / [宿泊] 旅館業許可証',
    copyType: '写し',
    issuer: null,
    notes: [
      '写しをお送りください。就業する事業所全ての営業許可書が必要です。',
      '有効期限内のものをご用意ください。',
    ],
    fields: ['food_service', 'accommodation'],
    sampleIds: ['business-permit-food', 'business-permit-lodging'],
  },
]

export const DOCUMENTS: Record<
  `${EntityType}:${ApplicationCategory}`,
  RequiredDocument[]
> = {
  'sole_proprietor:initial': SOLE_PROPRIETOR_INITIAL,
  'corporate:initial': CORPORATE_INITIAL,
  'sole_proprietor:renewal': RENEWAL,
  'corporate:renewal': RENEWAL,
}
```

- [ ] **Step 4: index.ts に書類の選択を足す**

`lib/portal/guidance/index.ts` の import に追記:

```ts
import { DOCUMENTS } from './documents'
import type {
  CouncilGuide,
  FlowLane,
  FlowStep,
  Guidance,
  RequiredDocument,
} from './types'
```

`export { COUNCIL_INTRO } from './council'` の下に追記:

```ts
export { DOCUMENTS_INTRO_INITIAL, DOCUMENTS_INTRO_RENEWAL } from './documents'
```

`selectCouncils` の下に追記:

```ts
function selectDocuments(
  entityType: EntityType,
  category: ApplicationCategory,
  field: Field | null
): RequiredDocument[] {
  const list = DOCUMENTS[`${entityType}:${category}`]
  if (!field) return list
  return list.filter((doc) => !doc.fields || doc.fields.includes(field))
}
```

`selectGuidance` の戻り値の `documents: []` を差し替える:

```ts
    documents: selectDocuments(input.entityType, input.category, field),
```

- [ ] **Step 5: テストが通ることを確認する**

```bash
npx vitest run __tests__/portal-guidance.test.ts
```

期待: 14 tests passed。

なお `更新は entityType によらず3件` は `field` 未指定のため営業許可証を落とさず3件になる。

- [ ] **Step 6: 型チェックを通す**

```bash
npm run typecheck
```

期待: エラーなし。

- [ ] **Step 7: コミット**

```bash
git add lib/portal/guidance/documents.ts lib/portal/guidance/index.ts __tests__/portal-guidance.test.ts
git commit -m "feat(portal): ご案内の取得書類・準備書類をデータ化"
```

---

### Task 4: 書類サンプルのメタと参照整合

**Files:**
- Create: `lib/portal/guidance/samples.ts`
- Modify: `lib/portal/guidance/index.ts`
- Test: `__tests__/portal-guidance.test.ts`

- [ ] **Step 1: 失敗するテストを追加する**

まず `__tests__/portal-guidance.test.ts` の import 行を次の形にする:

```ts
import { describe, it, expect } from 'vitest'
import { selectGuidance } from '@/lib/portal/guidance'
import { DOCUMENTS } from '@/lib/portal/guidance/documents'
import { DOCUMENT_SAMPLES } from '@/lib/portal/guidance/samples'
```

そのうえでファイルの末尾に追記:

```ts
describe('selectGuidance: 書類サンプル', () => {
  it('書類が参照する sampleId はすべて samples に存在する', () => {
    const referenced = Object.values(DOCUMENTS)
      .flat()
      .flatMap((doc) => doc.sampleIds ?? [])
    expect(referenced.length).toBeGreaterThan(0)
    for (const id of referenced) {
      expect(DOCUMENT_SAMPLES[id], `未定義の sampleId: ${id}`).toBeDefined()
    }
  })

  it('個人事業主 × 初回のサンプルに住民票が含まれる', () => {
    const g = selectGuidance({ entityType: 'sole_proprietor', category: 'initial' })
    expect(g.samples.map((s) => s.id)).toContain('sp-residence-certificate')
  })

  it('介護分野では営業許可証のサンプルが出ない', () => {
    const g = selectGuidance({ entityType: 'corporate', category: 'initial', field: 'care' })
    expect(g.samples.map((s) => s.id)).not.toContain('business-permit-food')
  })

  it('同じサンプルが重複して返らない', () => {
    const g = selectGuidance({ entityType: 'corporate', category: 'initial' })
    const ids = g.samples.map((s) => s.id)
    expect(new Set(ids).size).toBe(ids.length)
  })
})
```

`__tests__/portal-guidance.test.ts` の先頭の import 行はファイル冒頭にまとめること。

- [ ] **Step 2: テストが失敗することを確認する**

```bash
npx vitest run __tests__/portal-guidance.test.ts
```

期待: `Failed to resolve import "@/lib/portal/guidance/samples"` で失敗する。

- [ ] **Step 3: サンプルのメタを書く**

`lib/portal/guidance/samples.ts`:

```ts
import type { DocumentSample } from './types'

// 「取得書類一覧サンプル」（ご案内資料 P06 以降）の画像メタ。
// 画像は scripts/extract-guidance-samples.sh で生成する。
// 実寸は切り出しプリセットで決まる: half = 982 × 1200 / full = 1200 × 733

const HALF = { width: 982, height: 1200 } as const
const FULL = { width: 1200, height: 733 } as const

function src(id: string): string {
  return `/guidance/samples/${id}.jpg`
}

export const DOCUMENT_SAMPLES: Record<string, DocumentSample> = {
  'sp-residence-certificate': {
    id: 'sp-residence-certificate',
    title: '住民票の写し（個人事業主）',
    src: src('sp-residence-certificate'),
    ...HALF,
    caption: '本籍地の記載が必須です。マイナンバーは記載なしのものをご用意ください。',
  },
  'sp-labor-insurance-certificate': {
    id: 'sp-labor-insurance-certificate',
    title: '労働保険料等納付証明書',
    src: src('sp-labor-insurance-certificate'),
    ...HALF,
  },
  'sp-tax-certificate-3': {
    id: 'sp-tax-certificate-3',
    title: '個人事業主の納税証明書（その３）',
    src: src('sp-tax-certificate-3'),
    ...HALF,
    caption:
      '個人事業主の場合、「代表者氏名」欄は空欄のままで問題ありません。交付請求書の証明書の種類は「その３の２」（個人事業主用）を選択します。',
    points: [
      '証明書の種類は「その３の２」（個人事業主用）を選択',
      '基本の税目にチェック — 申告所得税及び復興特別所得税 / 消費税及び地方消費税',
      '「その他」欄に追記 — 源泉所得税及び復興特別所得税（記載漏れが多い項目です）、該当する場合のみ相続税・贈与税',
      '証明を受けようとする年度は直近のものを記入',
    ],
    warning: '「法人税」の項目は個人事業主には関係ありません。チェック不要です。',
  },
  'sp-resident-tax-certificate': {
    id: 'sp-resident-tax-certificate',
    title: '直近2年度分の個人住民税の納税証明書',
    src: src('sp-resident-tax-certificate'),
    ...FULL,
    caption:
      '市区町村により様式は異なります。上記はイメージです。直近2年度分（2枚）が必要です。',
  },
  'business-permit-food': {
    id: 'business-permit-food',
    title: '営業許可証（外食）',
    src: src('business-permit-food'),
    ...HALF,
  },
  'business-permit-lodging': {
    id: 'business-permit-lodging',
    title: '営業許可証（宿泊）',
    src: src('business-permit-lodging'),
    ...HALF,
  },
  'corp-registry': {
    id: 'corp-registry',
    title: '履歴事項全部証明書',
    src: src('corp-registry'),
    ...HALF,
  },
  'corp-residence-certificate': {
    id: 'corp-residence-certificate',
    title: '住民票の写し',
    src: src('corp-residence-certificate'),
    ...HALF,
    caption: '本籍地の記載が必須です。マイナンバーは記載なしのものをご用意ください。',
  },
  'corp-labor-insurance-certificate': {
    id: 'corp-labor-insurance-certificate',
    title: '労働保険料等納付証明書',
    src: src('corp-labor-insurance-certificate'),
    ...FULL,
  },
  'corp-tax-certificate-3': {
    id: 'corp-tax-certificate-3',
    title: '納税証明書（その３）',
    src: src('corp-tax-certificate-3'),
    ...HALF,
  },
  'corp-tax-certificate-3-form': {
    id: 'corp-tax-certificate-3-form',
    title: '納税証明書（その３）の請求書記入例',
    src: src('corp-tax-certificate-3-form'),
    ...HALF,
    caption: '「その他」の（ ）内は追記でご記入ください。',
  },
  'social-insurance-inquiry': {
    id: 'social-insurance-inquiry',
    title: '社会保険料納入状況照会回答票',
    src: src('social-insurance-inquiry'),
    ...HALF,
  },
  'social-insurance-receipt': {
    id: 'social-insurance-receipt',
    title: '健康保険 / 厚生年金保険料領収証書',
    src: src('social-insurance-receipt'),
    ...HALF,
  },
  'corp-resident-tax-certificate': {
    id: 'corp-resident-tax-certificate',
    title: '法人住民税 納税証明書',
    src: src('corp-resident-tax-certificate'),
    ...FULL,
  },
}
```

- [ ] **Step 4: index.ts にサンプルの解決を足す**

`lib/portal/guidance/index.ts` の import に追記:

```ts
import { DOCUMENT_SAMPLES } from './samples'
import type {
  CouncilGuide,
  DocumentSample,
  FlowLane,
  FlowStep,
  Guidance,
  RequiredDocument,
} from './types'
```

`selectDocuments` の下に追記:

```ts
function collectSamples(documents: RequiredDocument[]): DocumentSample[] {
  const seen = new Set<string>()
  const samples: DocumentSample[] = []
  for (const doc of documents) {
    for (const id of doc.sampleIds ?? []) {
      if (seen.has(id)) continue
      const sample = DOCUMENT_SAMPLES[id]
      if (!sample) {
        throw new Error(`Unknown document sample id: ${id}`)
      }
      seen.add(id)
      samples.push(sample)
    }
  }
  return samples
}
```

`selectGuidance` を、書類を一度だけ計算してサンプルに渡す形に書き換える:

```ts
export function selectGuidance(input: {
  entityType: EntityType
  category: ApplicationCategory
  field?: Field | null
}): Guidance {
  const field = input.field ?? null
  const documents = selectDocuments(input.entityType, input.category, field)
  return {
    entityType: input.entityType,
    category: input.category,
    field,
    flow: selectFlow(input.entityType, input.category),
    councils: selectCouncils(field),
    documents,
    samples: collectSamples(documents),
  }
}
```

- [ ] **Step 5: テストが通ることを確認する**

```bash
npx vitest run __tests__/portal-guidance.test.ts
```

期待: 18 tests passed。

- [ ] **Step 6: コミット**

```bash
git add lib/portal/guidance/samples.ts lib/portal/guidance/index.ts __tests__/portal-guidance.test.ts
git commit -m "feat(portal): ご案内の書類サンプルのメタを追加"
```

---

### Task 5: 案件からの既定値を求めるヘルパー

**Files:**
- Modify: `lib/portal/guidance/index.ts`
- Test: `__tests__/portal-guidance.test.ts`

一覧ページとガイドページの両方で「案件から表示条件を決める」処理が要るので、`selectGuidance` と同じ場所に置く。

- [ ] **Step 1: 失敗するテストを追加する**

まず `__tests__/portal-guidance.test.ts` の import 行を次の形にする:

```ts
import { describe, it, expect } from 'vitest'
import { guidanceDefaultsFromCases, selectGuidance } from '@/lib/portal/guidance'
import { DOCUMENTS } from '@/lib/portal/guidance/documents'
import { DOCUMENT_SAMPLES } from '@/lib/portal/guidance/samples'
import type { VisaApplicationCase } from '@/lib/portal/types'
```

そのうえでファイルの末尾に追記:

```ts
describe('guidanceDefaultsFromCases', () => {
  const makeCase = (over: Partial<VisaApplicationCase>): VisaApplicationCase =>
    ({
      id: 'c1',
      tenantId: 't1',
      tenantOfficeId: 'o1',
      officeName: null,
      entityType: 'corporate',
      applicationCategory: 'initial',
      field: 'other',
      applicationType: null,
      managementNumber: null,
      status: 'collecting',
      title: null,
      note: null,
      kintoneRecordId: null,
      kintoneSyncStatus: null,
      kintoneLastSyncedAt: null,
      createdAt: '2026-01-01T00:00:00Z',
      updatedAt: '2026-01-01T00:00:00Z',
      ...over,
    }) as VisaApplicationCase

  it('案件がなければ 法人 × 初回 × 分野なし', () => {
    expect(guidanceDefaultsFromCases([])).toEqual({
      entityType: 'corporate',
      category: 'initial',
      field: null,
    })
  })

  it('先頭の案件の属性を使う', () => {
    const cases = [
      makeCase({ entityType: 'sole_proprietor', applicationCategory: 'renewal', field: 'care' }),
      makeCase({ id: 'c2', entityType: 'corporate' }),
    ]
    expect(guidanceDefaultsFromCases(cases)).toEqual({
      entityType: 'sole_proprietor',
      category: 'renewal',
      field: 'care',
    })
  })
})
```

- [ ] **Step 2: テストが失敗することを確認する**

```bash
npx vitest run __tests__/portal-guidance.test.ts
```

期待: `guidanceDefaultsFromCases is not a function` で失敗する。

- [ ] **Step 3: 実装する**

`lib/portal/guidance/index.ts` の1行目の import を次に差し替える:

```ts
import type {
  ApplicationCategory,
  EntityType,
  Field,
  VisaApplicationCase,
} from '@/lib/portal/types'
```

型の import に `GuidanceCondition` を追加する:

```ts
import type {
  CouncilGuide,
  DocumentSample,
  FlowLane,
  FlowStep,
  Guidance,
  GuidanceCondition,
  RequiredDocument,
} from './types'
```

ファイル末尾に追記:

```ts
/**
 * 案件一覧からご案内の初期表示条件を決める。
 * listCases() は created_at の降順なので、先頭 = 最新の案件を採用する。
 */
export function guidanceDefaultsFromCases(
  cases: VisaApplicationCase[]
): GuidanceCondition {
  const latest = cases[0]
  return {
    entityType: latest?.entityType ?? 'corporate',
    category: latest?.applicationCategory ?? 'initial',
    field: latest?.field ?? null,
  }
}
```

- [ ] **Step 4: テストが通ることを確認する**

```bash
npx vitest run __tests__/portal-guidance.test.ts
```

期待: 20 tests passed。

- [ ] **Step 5: コミット**

```bash
git add lib/portal/guidance/index.ts __tests__/portal-guidance.test.ts
git commit -m "feat(portal): 案件からご案内の初期表示条件を決めるヘルパーを追加"
```

---

### Task 6: サンプル画像の切り出しスクリプト

**Files:**
- Create: `scripts/extract-guidance-samples.sh`
- Create: `public/guidance/samples/*.jpg`（生成物）

前提: `pdftoppm`（poppler）が必要。未インストールなら `brew install poppler`。
入力 PDF はリポジトリに含めない。既定では `~/Downloads/` を見る。

- [ ] **Step 1: スクリプトを書く**

`scripts/extract-guidance-samples.sh`:

```bash
#!/usr/bin/env bash
# ご案内資料の PDF から書類サンプル画像を切り出して public/guidance/samples/ に出力する。
#
# 使い方:
#   ./scripts/extract-guidance-samples.sh [個人事業主向けPDF] [法人向けPDF]
#
# 切り出しは 150dpi のページ(1754 x 1241 px)に対する3プリセットで表現する。
#   half-left  : x=0    y=170 W=877  H=1071  -> 982 x 1200
#   half-right : x=877  y=170 W=877  H=1071  -> 982 x 1200
#   full       : x=0    y=170 W=1754 H=1071  -> 1200 x 733
# y=170 はスライド見出し「取得書類一覧サンプル」を落とし、書類名と No. を残す位置。
#
# 出力サイズや実寸を変えたら lib/portal/guidance/samples.ts の HALF / FULL も更新すること。

set -euo pipefail

SP_PDF="${1:-$HOME/Downloads/1．ご案内資料(個人事業主向け).pdf}"
CORP_PDF="${2:-$HOME/Downloads/1．ご案内資料(法人向け).pdf}"

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
OUT_DIR="$ROOT/public/guidance/samples"
TMP_DIR="$(mktemp -d)"
trap 'rm -rf "$TMP_DIR"' EXIT

for pdf in "$SP_PDF" "$CORP_PDF"; do
  if [ ! -f "$pdf" ]; then
    echo "PDF が見つかりません: $pdf" >&2
    exit 1
  fi
done

if ! command -v pdftoppm >/dev/null 2>&1; then
  echo "pdftoppm が必要です。brew install poppler を実行してください。" >&2
  exit 1
fi

mkdir -p "$OUT_DIR"

# extract <pdf> <page> <preset> <sampleId>
extract() {
  local pdf="$1" page="$2" preset="$3" id="$4"
  local x y w h
  case "$preset" in
    half-left)  x=0;   y=170; w=877;  h=1071 ;;
    half-right) x=877; y=170; w=877;  h=1071 ;;
    full)       x=0;   y=170; w=1754; h=1071 ;;
    *) echo "未知のプリセット: $preset" >&2; exit 1 ;;
  esac

  pdftoppm -f "$page" -l "$page" -r 150 \
    -x "$x" -y "$y" -W "$w" -H "$h" \
    -png "$pdf" "$TMP_DIR/$id"

  local png
  png="$(find "$TMP_DIR" -name "$id-*.png" -maxdepth 1 | head -1)"
  if [ -z "$png" ]; then
    echo "切り出しに失敗しました: $id" >&2
    exit 1
  fi

  sips -s format jpeg -s formatOptions 70 -Z 1200 "$png" --out "$OUT_DIR/$id.jpg" >/dev/null
  rm -f "$png"
  echo "  $id.jpg"
}

echo "個人事業主向け:"
extract "$SP_PDF"    8  half-left  sp-residence-certificate
extract "$SP_PDF"    8  half-right sp-labor-insurance-certificate
extract "$SP_PDF"    9  half-left  sp-tax-certificate-3
extract "$SP_PDF"   10  full       sp-resident-tax-certificate
extract "$SP_PDF"   11  half-left  business-permit-food
extract "$SP_PDF"   11  half-right business-permit-lodging

echo "法人向け:"
extract "$CORP_PDF"  8  half-left  corp-registry
extract "$CORP_PDF"  8  half-right corp-residence-certificate
extract "$CORP_PDF"  9  full       corp-labor-insurance-certificate
extract "$CORP_PDF" 10  half-left  corp-tax-certificate-3
extract "$CORP_PDF" 10  half-right corp-tax-certificate-3-form
extract "$CORP_PDF" 11  half-left  social-insurance-inquiry
extract "$CORP_PDF" 11  half-right social-insurance-receipt
extract "$CORP_PDF" 12  full       corp-resident-tax-certificate

echo "完了: $OUT_DIR"
```

- [ ] **Step 2: 実行権限をつけて実行する**

```bash
chmod +x scripts/extract-guidance-samples.sh && ./scripts/extract-guidance-samples.sh
```

期待: `sp-residence-certificate.jpg` から `corp-resident-tax-certificate.jpg` まで14行が出力され、最後に `完了: .../public/guidance/samples`。

- [ ] **Step 3: 14枚できていることと実寸を確認する**

```bash
ls public/guidance/samples/ | wc -l && sips -g pixelWidth -g pixelHeight public/guidance/samples/sp-residence-certificate.jpg public/guidance/samples/sp-resident-tax-certificate.jpg
```

期待: `14`。`sp-residence-certificate.jpg` が 982 × 1200、`sp-resident-tax-certificate.jpg` が 1200 × 733。
実寸がこれと違う場合は `lib/portal/guidance/samples.ts` の `HALF` / `FULL` を実際の値に合わせること。

- [ ] **Step 4: 何枚か目視で確認する**

`public/guidance/samples/sp-tax-certificate-3.jpg` と `public/guidance/samples/corp-tax-certificate-3-form.jpg` を開き、書類名・No.・赤字の注釈が切れずに入っていることを確認する。切れている場合は該当プリセットの `y` / `h` を調整して再実行する。

- [ ] **Step 5: コミット**

```bash
git add scripts/extract-guidance-samples.sh public/guidance/samples
git commit -m "feat(portal): ご案内資料から書類サンプル画像を切り出す"
```

---

### Task 7: 一覧ページ用のご案内コンポーネント

**Files:**
- Create: `components/portal/guidance/flow-summary.tsx`
- Create: `components/portal/guidance/guide-entry-cards.tsx`
- Create: `components/portal/guidance/submission-rules.tsx`
- Create: `components/portal/guidance/contact-card.tsx`

すべて Server Component（`"use client"` を付けない）。

- [ ] **Step 1: 横並びステップを書く**

`components/portal/guidance/flow-summary.tsx`:

```tsx
import Link from 'next/link'
import { ArrowRight, ChevronRight } from 'lucide-react'
import type { FlowStep } from '@/lib/portal/guidance'

interface FlowSummaryProps {
  steps: FlowStep[]
  guideHref: string
}

// 一覧ページの上部に置く「貴社にご対応いただくこと」の横並び表示。
export function FlowSummary({ steps, guideHref }: FlowSummaryProps) {
  return (
    <section className="rounded-xl border border-border bg-card p-6 shadow-sm">
      <div className="mb-4 flex flex-wrap items-center justify-between gap-2">
        <h2 className="text-sm font-medium text-foreground">
          申請の流れ（貴社にご対応いただくこと）
        </h2>
        <Link
          href={guideHref}
          className="inline-flex items-center gap-1 text-sm text-primary hover:underline"
        >
          くわしい流れを見る
          <ArrowRight className="h-3.5 w-3.5" />
        </Link>
      </div>
      <ol className="flex flex-wrap items-stretch gap-2">
        {steps.map((step, index) => (
          <li key={step.id} className="flex items-stretch gap-2">
            <div className="flex min-w-[120px] flex-col rounded-lg bg-muted/60 px-3 py-2">
              <span className="text-xs text-muted-foreground">STEP {index + 1}</span>
              <span className="mt-0.5 text-sm font-medium text-foreground">
                {step.shortTitle ?? step.title}
              </span>
            </div>
            {index < steps.length - 1 && (
              <ChevronRight
                aria-hidden
                className="h-4 w-4 shrink-0 self-center text-muted-foreground"
              />
            )}
          </li>
        ))}
      </ol>
    </section>
  )
}
```

- [ ] **Step 2: 入口カードを書く**

`components/portal/guidance/guide-entry-cards.tsx`:

```tsx
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
```

- [ ] **Step 3: 提出ルールのカードを書く**

`components/portal/guidance/submission-rules.tsx`:

```tsx
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
```

- [ ] **Step 4: 連絡先カードを書く**

`components/portal/guidance/contact-card.tsx`:

```tsx
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
```

- [ ] **Step 5: 型チェックを通す**

```bash
npm run typecheck
```

期待: エラーなし。

- [ ] **Step 6: コミット**

```bash
git add components/portal/guidance
git commit -m "feat(portal): 申請ポータル一覧のご案内コンポーネントを追加"
```

---

### Task 8: 一覧ページへの組み込み

**Files:**
- Modify: `app/applications/page.tsx`

- [ ] **Step 1: ページを書き換える**

`app/applications/page.tsx` の全文を次で置き換える:

```tsx
import Link from 'next/link'
import { ClipboardList } from 'lucide-react'
import { Badge } from '@/components/ui/badge'
import { EmptyState } from '@/components/ui/empty-state'
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table'
import { ContactCard } from '@/components/portal/guidance/contact-card'
import { FlowSummary } from '@/components/portal/guidance/flow-summary'
import { GuideEntryCards } from '@/components/portal/guidance/guide-entry-cards'
import { SubmissionRules } from '@/components/portal/guidance/submission-rules'
import { listCases } from '@/lib/portal/applications'
import {
  guidanceDefaultsFromCases,
  selectGuidance,
  type GuidanceCondition,
} from '@/lib/portal/guidance'
import {
  APPLICATION_CATEGORY_LABELS,
  CASE_STATUS_LABELS,
  ENTITY_TYPE_LABELS,
  FIELD_LABELS,
} from '@/lib/portal/types'

export const dynamic = 'force-dynamic'

function buildGuideHref(condition: GuidanceCondition): string {
  const params = new URLSearchParams({
    entity: condition.entityType,
    category: condition.category,
  })
  if (condition.field) {
    params.set('field', condition.field)
  }
  return `/applications/guide?${params.toString()}`
}

export default async function ApplicationsPage() {
  const cases = await listCases()
  const condition = guidanceDefaultsFromCases(cases)
  const guidance = selectGuidance(condition)
  const guideHref = buildGuideHref(condition)

  return (
    <div className="p-6">
      <div className="grid gap-6 lg:grid-cols-[minmax(0,2fr)_minmax(0,1fr)]">
        <div className="space-y-6">
          <div>
            <h1 className="text-3xl font-bold text-foreground">申請ポータル</h1>
            <p className="mt-2 text-muted-foreground">
              在留資格申請の手続きをご案内します。申請の流れと必要書類をご確認のうえ、案件ごとにチェックリストを進めてください。
            </p>
          </div>

          <FlowSummary steps={guidance.flow.company} guideHref={guideHref} />

          <GuideEntryCards guideHref={guideHref} />

          <section className="space-y-3">
            <h2 className="text-sm font-medium text-foreground">案件一覧</h2>
            {cases.length === 0 ? (
              <div className="rounded-xl border border-border bg-card shadow-sm">
                <EmptyState
                  icon={<ClipboardList className="h-10 w-10" />}
                  title="案件がまだありません"
                  description="案件は担当者が用意します。準備ができると、ここに必要書類のチェックリストが表示されます。"
                />
              </div>
            ) : (
              <div className="overflow-x-auto rounded-xl border border-border bg-card shadow-sm">
                <Table className="min-w-[880px]">
                  <TableHeader>
                    <TableRow>
                      <TableHead>タイトル / 事業所</TableHead>
                      <TableHead className="w-[140px]">分野</TableHead>
                      <TableHead className="w-[120px]">種別</TableHead>
                      <TableHead className="w-[100px]">初回/更新</TableHead>
                      <TableHead className="w-[130px]">ステータス</TableHead>
                      <TableHead className="w-[120px]">管理番号</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {cases.map((c) => (
                      <TableRow key={c.id} className="cursor-pointer">
                        <TableCell>
                          <Link
                            href={`/applications/${c.id}`}
                            className="block font-medium text-foreground hover:underline"
                          >
                            {c.title || c.officeName || '無題の案件'}
                          </Link>
                          {c.officeName && (
                            <span className="text-xs text-muted-foreground">
                              {c.officeName}
                            </span>
                          )}
                        </TableCell>
                        <TableCell className="text-sm">{FIELD_LABELS[c.field]}</TableCell>
                        <TableCell className="text-sm">
                          {ENTITY_TYPE_LABELS[c.entityType]}
                        </TableCell>
                        <TableCell className="text-sm">
                          {APPLICATION_CATEGORY_LABELS[c.applicationCategory]}
                        </TableCell>
                        <TableCell>
                          <Badge variant="secondary">{CASE_STATUS_LABELS[c.status]}</Badge>
                        </TableCell>
                        <TableCell className="text-sm text-muted-foreground">
                          {c.managementNumber || '-'}
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </div>
            )}
          </section>
        </div>

        <aside className="space-y-4 lg:sticky lg:top-6 lg:self-start">
          <SubmissionRules />
          <ContactCard />
        </aside>
      </div>
    </div>
  )
}
```

- [ ] **Step 2: 型チェックを通す**

```bash
npm run typecheck
```

期待: エラーなし。

- [ ] **Step 3: 画面を確認する**

```bash
npm run dev
```

`http://localhost:3000/applications` を開き、次を確認する。

- 上部に「申請の流れ（貴社にご対応いただくこと）」の横並びステップが出る
- 「最初にご確認ください」の3枚が出て、それぞれ `/applications/guide#...` を指している（このタスク時点ではリンク先が 404 でよい）
- 右カラムに「書類の提出について」「困ったときは」が出て、幅を狭めると下に回り込む
- 案件テーブルが従来どおり表示される

- [ ] **Step 4: コミット**

```bash
git add app/applications/page.tsx
git commit -m "feat(portal): 申請ポータル一覧に申請の流れとご案内を表示"
```

---

### Task 9: ガイドページのセクションコンポーネント

**Files:**
- Create: `components/portal/guidance/flow-lanes.tsx`
- Create: `components/portal/guidance/council-section.tsx`
- Create: `components/portal/guidance/sample-dialog.tsx`
- Create: `components/portal/guidance/document-table.tsx`

`sample-dialog.tsx` だけ Client Component。

- [ ] **Step 1: 3レーン図を書く**

`components/portal/guidance/flow-lanes.tsx`:

```tsx
import { AlertTriangle, Info } from 'lucide-react'
import { cn } from '@/lib/utils'
import { FLOW_LANE_LABELS, type FlowLane, type FlowStep } from '@/lib/portal/guidance'

interface FlowLanesProps {
  flow: Record<FlowLane, FlowStep[]>
}

const LANE_ORDER: FlowLane[] = ['company', 'funtoco', 'candidate']

const LANE_STYLES: Record<FlowLane, string> = {
  company: 'border-emerald-200 bg-emerald-50/60',
  funtoco: 'border-indigo-200 bg-indigo-50/60',
  candidate: 'border-orange-200 bg-orange-50/60',
}

function StepNote({ note }: { note: NonNullable<FlowStep['note']> }) {
  const Icon = note.tone === 'warning' ? AlertTriangle : Info
  return (
    <div
      className={cn(
        'mt-2 flex gap-1.5 rounded-md p-2 text-xs leading-5',
        note.tone === 'warning'
          ? 'bg-red-50 text-red-800'
          : 'bg-background text-muted-foreground'
      )}
    >
      <Icon className="mt-0.5 h-3.5 w-3.5 shrink-0" aria-hidden />
      <span>{note.body}</span>
    </div>
  )
}

export function FlowLanes({ flow }: FlowLanesProps) {
  return (
    <div className="grid gap-4 lg:grid-cols-3">
      {LANE_ORDER.map((lane) => (
        <div
          key={lane}
          className={cn('rounded-xl border p-4', LANE_STYLES[lane])}
        >
          <h3 className="text-sm font-medium text-foreground">
            {FLOW_LANE_LABELS[lane]}
          </h3>
          <ol className="mt-3 space-y-2">
            {flow[lane].map((step, index) => (
              <li
                key={step.id}
                className="rounded-lg border border-border bg-card p-3 shadow-sm"
              >
                <div className="flex items-baseline gap-2">
                  <span className="text-xs text-muted-foreground">{index + 1}</span>
                  <span className="text-sm font-medium text-foreground">
                    {step.title}
                  </span>
                </div>
                {step.description && (
                  <p className="mt-1 text-xs leading-5 text-muted-foreground">
                    {step.description}
                  </p>
                )}
                {step.note && <StepNote note={step.note} />}
              </li>
            ))}
          </ol>
        </div>
      ))}
    </div>
  )
}
```

- [ ] **Step 2: 協議会セクションを書く**

`components/portal/guidance/council-section.tsx`:

```tsx
import { ExternalLink } from 'lucide-react'
import { Badge } from '@/components/ui/badge'
import { COUNCIL_INTRO, type CouncilGuide } from '@/lib/portal/guidance'
import { FIELD_LABELS, type Field } from '@/lib/portal/types'

interface CouncilSectionProps {
  councils: CouncilGuide[]
  field: Field | null
}

export function CouncilSection({ councils, field }: CouncilSectionProps) {
  return (
    <div className="space-y-4">
      <p className="text-sm leading-6 text-muted-foreground">{COUNCIL_INTRO}</p>
      {councils.map((council) => {
        const isTarget = field !== null && council.fields.includes(field)
        return (
          <div
            key={council.id}
            className="rounded-xl border border-border bg-card p-5 shadow-sm"
          >
            <div className="flex flex-wrap items-center gap-2">
              <h3 className="text-sm font-medium text-foreground">{council.label}</h3>
              {isTarget && field && (
                <Badge variant="secondary">この案件の分野: {FIELD_LABELS[field]}</Badge>
              )}
            </div>

            {council.description && (
              <p className="mt-2 text-sm leading-6 text-muted-foreground">
                {council.description}
              </p>
            )}

            {council.steps.length > 0 && (
              <div className="mt-4">
                <h4 className="text-xs font-medium text-muted-foreground">申し込み方法</h4>
                <ol className="mt-2 list-decimal space-y-1.5 pl-5">
                  {council.steps.map((step) => (
                    <li key={step} className="text-sm leading-6 text-foreground">
                      {step}
                    </li>
                  ))}
                </ol>
              </div>
            )}

            {council.requiredDocuments.map((group, index) => (
              <div key={group.heading ?? index} className="mt-4">
                <h4 className="text-xs font-medium text-muted-foreground">
                  {group.heading ? `必要書類（${group.heading}）` : '必要書類'}
                </h4>
                <ol className="mt-2 list-decimal space-y-1.5 pl-5">
                  {group.items.map((item) => (
                    <li key={item} className="text-sm leading-6 text-foreground">
                      {item}
                    </li>
                  ))}
                </ol>
              </div>
            ))}

            {council.links.length > 0 && (
              <div className="mt-4 flex flex-wrap gap-3">
                {council.links.map((link) => (
                  <a
                    key={link.url}
                    href={link.url}
                    target="_blank"
                    rel="noreferrer"
                    className="inline-flex items-center gap-1 text-sm text-primary hover:underline"
                  >
                    {link.label}
                    <ExternalLink className="h-3.5 w-3.5" aria-hidden />
                  </a>
                ))}
              </div>
            )}
          </div>
        )
      })}
    </div>
  )
}
```

- [ ] **Step 3: サンプルダイアログを書く**

`components/portal/guidance/sample-dialog.tsx`:

```tsx
'use client'

import Image from 'next/image'
import { AlertTriangle, FileImage } from 'lucide-react'
import { Button } from '@/components/ui/button'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from '@/components/ui/dialog'
import type { DocumentSample } from '@/lib/portal/guidance'

interface SampleDialogProps {
  sample: DocumentSample
}

// next.config.mjs で images.unoptimized: true のため、next/image は実寸の img として描画される。
export function SampleDialog({ sample }: SampleDialogProps) {
  return (
    <Dialog>
      <DialogTrigger asChild>
        <Button variant="outline" size="sm" className="gap-1">
          <FileImage className="h-3.5 w-3.5" aria-hidden />
          {sample.title}
        </Button>
      </DialogTrigger>
      <DialogContent className="max-h-[90vh] max-w-3xl overflow-y-auto">
        <DialogHeader>
          <DialogTitle>{sample.title}</DialogTitle>
          {sample.caption && <DialogDescription>{sample.caption}</DialogDescription>}
        </DialogHeader>

        <Image
          src={sample.src}
          alt={`${sample.title}のサンプル`}
          width={sample.width}
          height={sample.height}
          className="h-auto w-full rounded-lg border border-border"
        />

        {sample.points && sample.points.length > 0 && (
          <div>
            <h4 className="text-sm font-medium text-foreground">交付請求時のポイント</h4>
            <ol className="mt-2 list-decimal space-y-1.5 pl-5">
              {sample.points.map((point) => (
                <li key={point} className="text-sm leading-6 text-foreground">
                  {point}
                </li>
              ))}
            </ol>
          </div>
        )}

        {sample.warning && (
          <div className="flex gap-2 rounded-lg bg-red-50 p-3 text-sm leading-6 text-red-800">
            <AlertTriangle className="mt-1 h-4 w-4 shrink-0" aria-hidden />
            <span>{sample.warning}</span>
          </div>
        )}
      </DialogContent>
    </Dialog>
  )
}
```

- [ ] **Step 4: 取得書類テーブルを書く**

`components/portal/guidance/document-table.tsx`:

```tsx
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table'
import { SampleDialog } from './sample-dialog'
import {
  DOCUMENTS_INTRO_INITIAL,
  DOCUMENTS_INTRO_RENEWAL,
  type DocumentSample,
  type RequiredDocument,
} from '@/lib/portal/guidance'
import type { ApplicationCategory } from '@/lib/portal/types'

interface DocumentTableProps {
  documents: RequiredDocument[]
  samples: DocumentSample[]
  category: ApplicationCategory
}

export function DocumentTable({ documents, samples, category }: DocumentTableProps) {
  const sampleById = new Map(samples.map((sample) => [sample.id, sample]))

  return (
    <div className="space-y-3">
      <p className="text-sm leading-6 text-muted-foreground">
        {category === 'initial' ? DOCUMENTS_INTRO_INITIAL : DOCUMENTS_INTRO_RENEWAL}
      </p>
      <div className="overflow-x-auto rounded-xl border border-border bg-card shadow-sm">
        <Table className="min-w-[880px]">
          <TableHeader>
            <TableRow>
              <TableHead className="w-[48px]">No</TableHead>
              <TableHead className="min-w-[260px]">必要書類</TableHead>
              <TableHead className="w-[120px]">区分</TableHead>
              <TableHead className="w-[160px]">請求先</TableHead>
              <TableHead className="min-w-[280px]">備考</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {documents.map((doc) => {
              const docSamples = (doc.sampleIds ?? [])
                .map((id) => sampleById.get(id))
                .filter((sample): sample is DocumentSample => Boolean(sample))

              return (
                <TableRow key={doc.no}>
                  <TableCell className="align-top text-sm text-muted-foreground">
                    {doc.no}
                  </TableCell>
                  <TableCell className="align-top">
                    <p className="whitespace-pre-line text-sm font-medium text-foreground">
                      {doc.name}
                    </p>
                    {docSamples.length > 0 && (
                      <div className="mt-2 flex flex-wrap gap-2">
                        {docSamples.map((sample) => (
                          <SampleDialog key={sample.id} sample={sample} />
                        ))}
                      </div>
                    )}
                  </TableCell>
                  <TableCell className="align-top whitespace-pre-line text-sm">
                    {doc.copyType}
                  </TableCell>
                  <TableCell className="align-top text-sm">{doc.issuer ?? '—'}</TableCell>
                  <TableCell className="align-top">
                    {doc.notes.length === 0 ? (
                      <span className="text-sm text-muted-foreground">—</span>
                    ) : (
                      <ul className="space-y-1">
                        {doc.notes.map((note) => (
                          <li key={note} className="text-xs leading-5 text-muted-foreground">
                            {note}
                          </li>
                        ))}
                      </ul>
                    )}
                  </TableCell>
                </TableRow>
              )
            })}
          </TableBody>
        </Table>
      </div>
    </div>
  )
}
```

- [ ] **Step 5: 型チェックを通す**

```bash
npm run typecheck
```

期待: エラーなし。

- [ ] **Step 6: コミット**

```bash
git add components/portal/guidance
git commit -m "feat(portal): ご案内ページのセクションコンポーネントを追加"
```

---

### Task 10: ガイドページ本体と切り替えトグル

**Files:**
- Create: `components/portal/guidance/guidance-switcher.tsx`
- Create: `app/applications/guide/page.tsx`

- [ ] **Step 1: 切り替えトグルを書く**

`components/portal/guidance/guidance-switcher.tsx`:

```tsx
'use client'

import { useRouter, useSearchParams } from 'next/navigation'
import { cn } from '@/lib/utils'
import type { GuidanceCondition } from '@/lib/portal/guidance'
import type { ApplicationCategory, EntityType } from '@/lib/portal/types'

interface GuidanceSwitcherProps {
  condition: GuidanceCondition
}

const ENTITY_OPTIONS: { value: EntityType; label: string }[] = [
  { value: 'corporate', label: '法人' },
  { value: 'sole_proprietor', label: '個人事業主' },
]

const CATEGORY_OPTIONS: { value: ApplicationCategory; label: string }[] = [
  { value: 'initial', label: '初めて受け入れる' },
  { value: 'renewal', label: '既に受け入れ済み' },
]

export function GuidanceSwitcher({ condition }: GuidanceSwitcherProps) {
  const router = useRouter()
  const searchParams = useSearchParams()

  const update = (key: 'entity' | 'category', value: string) => {
    const params = new URLSearchParams(searchParams.toString())
    params.set(key, value)
    // 分野は案件由来の値をそのまま引き継ぐ（トグルでは変えない）
    if (condition.field && !params.has('field')) {
      params.set('field', condition.field)
    }
    router.replace(`/applications/guide?${params.toString()}`, { scroll: false })
  }

  return (
    <div className="flex flex-wrap gap-6">
      <ToggleGroup
        label="事業形態"
        options={ENTITY_OPTIONS}
        selected={condition.entityType}
        onSelect={(value) => update('entity', value)}
      />
      <ToggleGroup
        label="受け入れ状況"
        options={CATEGORY_OPTIONS}
        selected={condition.category}
        onSelect={(value) => update('category', value)}
      />
    </div>
  )
}

function ToggleGroup({
  label,
  options,
  selected,
  onSelect,
}: {
  label: string
  options: readonly { value: string; label: string }[]
  selected: string
  onSelect: (value: string) => void
}) {
  return (
    <div>
      <span className="text-xs text-muted-foreground">{label}</span>
      <div
        role="group"
        aria-label={label}
        className="mt-1 flex gap-1 rounded-lg bg-muted p-1"
      >
        {options.map((option) => (
          <button
            key={option.value}
            type="button"
            aria-pressed={selected === option.value}
            onClick={() => onSelect(option.value)}
            className={cn(
              'rounded-md px-3 py-1.5 text-sm transition-colors',
              selected === option.value
                ? 'bg-background font-medium text-foreground shadow-sm'
                : 'text-muted-foreground hover:text-foreground'
            )}
          >
            {option.label}
          </button>
        ))}
      </div>
    </div>
  )
}
```

- [ ] **Step 2: ガイドページを書く**

`app/applications/guide/page.tsx`:

```tsx
import Link from 'next/link'
import { ArrowLeft } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { CouncilSection } from '@/components/portal/guidance/council-section'
import { DocumentTable } from '@/components/portal/guidance/document-table'
import { FlowLanes } from '@/components/portal/guidance/flow-lanes'
import { GuidanceSwitcher } from '@/components/portal/guidance/guidance-switcher'
import { listCases } from '@/lib/portal/applications'
import {
  guidanceDefaultsFromCases,
  selectGuidance,
  type GuidanceCondition,
} from '@/lib/portal/guidance'
import type { ApplicationCategory, EntityType, Field } from '@/lib/portal/types'

export const dynamic = 'force-dynamic'

const ENTITY_TYPES: EntityType[] = ['corporate', 'sole_proprietor']
const CATEGORIES: ApplicationCategory[] = ['initial', 'renewal']
const FIELDS: Field[] = [
  'care',
  'food_service',
  'accommodation',
  'food_manufacturing',
  'other',
]

function pick<T extends string>(
  value: string | string[] | undefined,
  allowed: T[]
): T | null {
  if (typeof value !== 'string') return null
  return allowed.includes(value as T) ? (value as T) : null
}

/** クエリ > 最新案件 > 既定値 の順で表示条件を決める。不正なクエリは無視する。 */
function resolveCondition(
  searchParams: Record<string, string | string[] | undefined>,
  fallback: GuidanceCondition
): GuidanceCondition {
  return {
    entityType: pick(searchParams.entity, ENTITY_TYPES) ?? fallback.entityType,
    category: pick(searchParams.category, CATEGORIES) ?? fallback.category,
    field: pick(searchParams.field, FIELDS) ?? fallback.field,
  }
}

export default async function ApplicationGuidePage({
  searchParams,
}: {
  searchParams: Record<string, string | string[] | undefined>
}) {
  const cases = await listCases()
  const condition = resolveCondition(searchParams, guidanceDefaultsFromCases(cases))
  const guidance = selectGuidance(condition)

  return (
    <div className="space-y-8 p-6">
      <div>
        <Button asChild variant="ghost" size="sm" className="mb-2 -ml-2 gap-1">
          <Link href="/applications">
            <ArrowLeft className="h-4 w-4" />
            申請ポータルに戻る
          </Link>
        </Button>
        <h1 className="text-2xl font-bold text-foreground">
          在留資格申請手続きのご案内
        </h1>
        <p className="mt-2 text-muted-foreground">
          事業形態と受け入れ状況に合わせて、手続きの流れと必要な書類をご案内します。
        </p>
        <div className="mt-4">
          <GuidanceSwitcher condition={condition} />
        </div>
      </div>

      <section id="flow" className="scroll-mt-6 space-y-3">
        <h2 className="text-lg font-semibold text-foreground">1. 申請手続きの流れ</h2>
        <FlowLanes flow={guidance.flow} />
      </section>

      <section id="council" className="scroll-mt-6 space-y-3">
        <h2 className="text-lg font-semibold text-foreground">2. 協議会への加入登録</h2>
        <CouncilSection councils={guidance.councils} field={condition.field} />
      </section>

      <section id="documents" className="scroll-mt-6 space-y-3">
        <h2 className="text-lg font-semibold text-foreground">
          {condition.category === 'initial'
            ? `3. 取得書類一覧（全${guidance.documents.length}種類）`
            : `3. 準備書類一覧（全${guidance.documents.length}種類）`}
        </h2>
        <DocumentTable
          documents={guidance.documents}
          samples={guidance.samples}
          category={condition.category}
        />
      </section>
    </div>
  )
}
```

- [ ] **Step 3: 型チェックを通す**

```bash
npm run typecheck
```

期待: エラーなし。

- [ ] **Step 4: 画面を確認する**

```bash
npm run dev
```

`http://localhost:3000/applications/guide` を開き、次を確認する。

- 「法人 / 個人事業主」を切り替えると、押印ステップの注記と取得書類一覧が入れ替わる
- 「初めて受け入れる / 既に受け入れ済み」を切り替えると、書類が8件と3件で入れ替わり、見出しが「取得書類一覧」「準備書類一覧」で変わる
- `?field=care` を付けると営業許可証の行が消え、協議会の先頭が介護になる
- 書類のサンプルボタンを押すと画像が拡大表示され、納税証明書（その３）では「交付請求時のポイント」と赤い警告が出る
- `/applications` の入口カードから `#flow` `#council` `#documents` に飛べる

- [ ] **Step 5: コミット**

```bash
git add app/applications/guide components/portal/guidance/guidance-switcher.tsx
git commit -m "feat(portal): 在留資格申請手続きのご案内ページを追加"
```

---

### Task 11: 案件詳細からご案内への導線

**Files:**
- Modify: `app/applications/[caseId]/page.tsx`

- [ ] **Step 1: 案件の属性を渡すリンクを足す**

`app/applications/[caseId]/page.tsx` の import に追記:

```tsx
import { BookOpen } from 'lucide-react'
```

`CaseProgressHeader` を使っている行:

```tsx
      <CaseProgressHeader status={detail.status} />
```

を次で置き換える:

```tsx
      <CaseProgressHeader status={detail.status} />

      <Button asChild variant="outline" size="sm" className="gap-1">
        <Link
          href={`/applications/guide?entity=${detail.entityType}&category=${detail.applicationCategory}&field=${detail.field}`}
        >
          <BookOpen className="h-4 w-4" />
          この案件のご案内を見る
        </Link>
      </Button>
```

`Button` と `Link` は既にこのファイルで import 済みのため追加不要。

- [ ] **Step 2: 型チェックを通す**

```bash
npm run typecheck
```

期待: エラーなし。

- [ ] **Step 3: 画面を確認する**

`http://localhost:3000/applications` から案件を1件開き、「この案件のご案内を見る」を押すと、その案件の事業形態・初回/更新・分野が選択された状態でガイドページが開くことを確認する。

- [ ] **Step 4: コミット**

```bash
git add "app/applications/[caseId]/page.tsx"
git commit -m "feat(portal): 案件詳細からご案内ページへの導線を追加"
```

---

### Task 12: 仕上げの検証

- [ ] **Step 1: テストを全部通す**

```bash
npm test
```

期待: 既存テストを含めて全 pass。

- [ ] **Step 2: 型チェックと lint**

```bash
npm run typecheck && npm run lint
```

期待: どちらもエラーなし。

- [ ] **Step 3: ビルドが通ることを確認する**

```bash
npm run build
```

期待: `/applications` と `/applications/guide` が両方ビルドされ、エラーなし。

- [ ] **Step 4: 未決事項を残す**

協議会の外部リンクURL（`lib/portal/guidance/council.ts` の `links`）と、法人向け書類 No.3 / No.4 / No.5 の「詳細はこちら」は未取得のまま。
URL の提供を受けたら `council.ts` の `links` と `documents.ts` の該当 `notes` に追加する。
この状態を PR 本文に明記する。

---

## Self-Review

**Spec coverage**

| 設計ドキュメントの節 | 対応タスク |
|---|---|
| データ層（types / flow / council / documents / samples / index） | Task 1–5 |
| コンテンツ（流れ・協議会・取得書類・準備書類・サンプル一覧） | Task 1–4 |
| `/applications` の拡張（流れ・入口カード・右カラム・テーブル現状維持） | Task 7–8 |
| `/applications/guide` | Task 9–10 |
| `/applications/[caseId]` の導線 | Task 11 |
| サンプル画像パイプライン | Task 6 |
| テスト（`selectGuidance` の分岐、参照整合） | Task 1–5 |
| 未決事項（協議会URL） | Task 2 のコメント、Task 12 Step 4 |

**型の一貫性**

- `selectGuidance` の引数は全タスクで `{ entityType, category, field? }` に統一
- `GuidanceCondition` は `{ entityType, category, field }` で、`guidanceDefaultsFromCases` / `resolveCondition` / `GuidanceSwitcher` / `buildGuideHref` がすべて同じ形を使う
- `DOCUMENT_SAMPLES` は `Record<string, DocumentSample>`、`selectGuidance` の戻り値 `samples` は `DocumentSample[]`
- `FlowStep.shortTitle` は Task 1 で定義し、Task 7 の `FlowSummary` でのみ使う
