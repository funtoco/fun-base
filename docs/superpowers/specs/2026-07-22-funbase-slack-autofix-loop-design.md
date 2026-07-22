# FunBase Slack 自動トリアージ＆修正ループ 設計書

- 日付: 2026-07-22
- 対象リポジトリ: `funtoco/fun-base`
- ステータス: レビュー待ち（未確定点は §12 参照）

## 1. 目的

`#pj_fun-base` チャンネルに投稿される **バグ報告** と **機能改善要望**（想定比率 5:5）を、毎時自動でトリアージし、対応可能なものは自律的に修正 → 検証 → PR 作成 → レビュー依頼 → Slack 返信までを行う「プロアクティブループ」を構築する。

参考: [Loop Engineering の考え方](https://note.com/inady/n/n1b3df42b4ba2)（達成条件だけを渡す「ゴールベースループ」＋完了条件のスキル化）。

## 2. 設計原則

- **ゴールベース**: 「やり方」ではなく「達成条件（Definition of Done）」を渡す。完了条件はスキルと `AGENTS.md` に明文化する。
- **自信がある時だけ突き進む**: 完全自動だが、分類の confidence / clarity が閾値未満のものは Ready PR にせず、確認 or Draft/保留にフォールバックする。
- **バイアス回避**: 修正した本人（同一コンテキスト）が合否を判定しない。検証は別コンテキスト（サブエージェント / `/code-review`）で行う。
- **隔離**: ループはユーザーの作業ツリーに触れない。専用 git worktree で動作する。
- **冪等**: 同じ投稿を二度対応しない（状態を永続化）。
- **共通化**: スキル群はリポジトリの `.claude/skills/` に置き、将来 GitHub Actions（24/7 無人）へ移植しても手戻りゼロにする。

## 3. 実行モデル

| 項目 | 内容 |
|------|------|
| 起動層 | **まず `/loop`（セッション内・毎時）で試用** → 安定後 `/schedule`（永続）へ昇格。どちらもローカル実行で、実 Slack MCP / `gh` / リポジトリをそのまま使える（追加課金なし）。呼び出し先は `funbase-triage-cycle` スキル。 |
| 実行タイミング | 毎時（`:00` を避け例: `7 * * * *`）。多重起動はロックで防止。 |
| 隔離 | `git fetch` 後、`origin/main` から一時 worktree を作成して作業。終了時に破棄。ユーザーの未コミット変更に触れない。 |
| 状態保存 | リポジトリ**外**（`~/.claude/funbase-triage/state.json`）。ブランチ/PR に状態ファイルが混入しない。 |
| 認証 | ローカル `gh`（`tomoakinishimura`, ssh/keyring）で PR 作成・レビュー依頼。Slack はローカル MCP コネクタで読取／返信。 |

### 起動層の段階（trigger だけ差し替え。スキル群は全段階で共通）

1. **`/loop`（現在）**: セッション内で毎時実行。ターミナルを閉じると停止・7 日で失効。まず試すための段階。`/loop 1h /funbase-triage-cycle` の形。
2. **`/schedule`（安定後）**: ディスク永続。セッションをまたいで残り、アプリ起動中に毎時発火。同じ `funbase-triage-cycle` を呼ぶだけ。
3. **GitHub Actions（任意・将来）**: 真の 24/7 無人。Slack を bot token 化し `ANTHROPIC_API_KEY` を secrets 化（本設計のスコープ外）。

> **`/loop` と `/schedule` と `/goal` の関係**: `/loop`・`/schedule` は同じ「くり返し起動するタイマー」で、外側に**一つだけ**置く（入れ子にしない）。`/goal` はタイマーではなく「達成条件まで直し切る」内側ループで、1 回の実行の**中**で回る。＝ `/loop`（or `/schedule`）→ `funbase-triage-cycle` →（各アイテムで）`/goal`。

## 4. 全体アーキテクチャ

```
[毎時トリガー]  /schedule（ローカル・毎時）
      │  ロック取得 → worktree 準備（origin/main）
      ▼
[① triage-from-slack]  #pj_fun-base 新規投稿取得 → LLM分類 → 重複除外(state)
      │   {type, actionable, confidence, clarity, summary, repro_or_spec, ts, permalink}
      ▼   対応キュー（bug/feature 混在, 最大 K 件）
[ルーティング]  escalation対象/低clarity feature → Draft or 仕様確認へ
      │  それ以外 → 通常修正
      ▼
[② /goal ループ]  bug:失敗テスト(red)→修正(green) / feature:最小実装
      │   完了条件（typecheck/lint/test/build）が全green になるまで（最大 N 回）
      ▼
[③ code-review（別コンテキスト）]  差分を検証 → ブロッカーは②へ差戻し（最大 M 回）
      │
      ▼
[④ 出荷]  live: Ready/Draft PR → レビュアー付与 → 元スレ返信 (+announce)
          shadow: PRを作らず「方針＋差分要約」を shadow 先へ投稿
      │
      ▼  worktree 破棄 → ロック解放 → 実行サマリ通知
```

## 5. コンポーネント（責務と入出力契約）

### 5.1 `/goal` — 汎用ゴールループ（`.claude/skills/goal/SKILL.md`）
本ループの核。バグ以外にも再利用できる汎用スキル。

- 入力: `goal`（自然言語の達成条件）, `verify`（完了判定に使うコマンド群）, `max_attempts`, `strategy_hints?`
- 動作: 実装 → `verify` 実行 → **別サブエージェントで達成判定** → 未達なら別アプローチで再試行（最大 `max_attempts`）
- 出力: `{ status: achieved | failed, attempts, diff, notes }`
- 完了判定は「実装した本人」ではなく判定役が行う（バイアス回避）

### 5.2 `triage-from-slack`（`.claude/skills/triage-from-slack/SKILL.md`）
- 入力: `channel`（`#pj_fun-base`）, `since_ts`（state から）
- 動作:
  1. `slack_read_channel(oldest=since_ts)` で新規投稿・スレッドを取得
  2. 各投稿を LLM 分類（§6）
  3. `actionable=true` かつ未処理のものを対応キューへ（`confidence` 降順、最大 K 件）
  4. `since_ts` を更新（保留＝要確認は再評価できるよう別管理）
- 出力: 正規化済みアイテム配列 `{ type, actionable, confidence, clarity, summary, repro_or_spec, slack_ts, permalink }`
- **本文は対応判断に必要な範囲のみ扱い、個人情報の外部送信はしない**

### 5.3 `fix-and-ship`（`.claude/skills/fix-and-ship/SKILL.md`）
1 アイテムを受け取り、ルーティング → `/goal` → `/code-review` → 出荷までを統括。

- ルーティング:
  - escalation 対象（§7）に触れる or `clarity < 閾値` の feature → **実装せず** Draft/Issue 化 or Slack で仕様確認
  - それ以外 → 通常修正
- `/goal` 呼び出し（bug/feature でゴール文面を出し分け）
- `/code-review` で差分検証、ブロッカーは `/goal` へ差戻し（最大 M 回）
- 出荷（mode 別、§8）
- 依存: `git`(worktree), `gh`, Slack send

### 5.4 `bug-fixer`（`.claude/agents/bug-fixer.md`）
実際のコード修正を担う**サブエージェント**（`/goal` のワーカー）。コンテキストを隔離し、TDD（red→green→refactor）で修正する。

### 5.5 `code-review`（既存 `/code-review` を利用）
差分に対する独立検証。②の修正コンテキストとは別に走らせ、correctness を中心にブロッカーを洗い出す。

## 6. 分類ロジック（bug + feature 5:5）

各投稿を LLM で以下に分類する。

- `type`: `bug` | `feature` | `question` | `noise`
- `actionable`: 対応が必要か（「対応します」「対応必要」「直してほしい」等のニュアンスが主シグナル）
- `confidence`: 分類の確信度 0–1
- `clarity`: 対応に十分な情報があるか 0–1（再現手順 / 期待挙動 / 仕様の明確さ）
- `summary`, `repro_or_spec`（bug=再現手順、feature=最小仕様）

ゲート（初期値・shadow で調整）:
- `question` / `noise` → 対応しない（必要なら定型リアクションのみ）
- `bug` かつ `confidence ≥ 0.8` かつ `clarity ≥ 0.7` → 通常修正 → **Ready PR**
- `feature` かつ `confidence ≥ 0.8` かつ `clarity ≥ 0.7` → 最小実装 → **Ready PR**
- `clarity < 0.7`（特に feature）→ 実装せず **Slack で仕様確認** or **Draft/Issue**

## 7. 完了条件と PR 規約（`AGENTS.md` へ追記）

### Definition of Done（全 green で初めて PR 化）
1. `npm run typecheck` — 型エラー 0（`next build` は `ignoreBuildErrors:true` で型を見逃すため**必須**）
2. `npm run lint` — エラー 0
3. `npm test`（vitest）— 全 pass。**バグ修正時は「まず失敗する回帰テスト」を追加し、それが pass すること**
4. `npm run build` — 成功

### PR 規約
- ブランチ: `auto/fix-<slug>`（bug） / `auto/feat-<slug>`（feature）。必ず `origin/main` から作成
- 1 PR = 1 対応（Slack 1 スレッド）
- PR body テンプレ: 概要 / 元 Slack リンク / 分類(type, confidence) / 変更点 / テスト / リスク / ロールバック手順
- レビュアー: §12（未確定）
- Draft 条件: 低 clarity の feature、または escalation 対象に触れる場合

### 自動化してはいけない領域（escalation：自動 PR 化せず Draft + 人へ通知して停止）
- `supabase/migrations/**`（DB マイグレーション）
- 認証: `middleware.ts`, `app/auth/**`, `lib/security/**`
- 暗号: `lib/crypto/**`
- 削除系（ファイル/カラム/データの削除）
- 依存の追加・更新（`package.json` の dependencies 変更）
- `.github/**`, 環境変数 / secrets

## 8. 出荷（mode 別）

### mode = live
1. `git switch -c auto/...` → commit → push
2. `gh pr create`（Ready or Draft）
3. `gh pr edit --add-reviewer <reviewer>`
4. 元 Slack スレッドへ返信「対応PR: <url>（自動対応）」
5. （任意）`#announce_funbase` に簡易告知
6. state に `processed`（slack_ts, pr_url, result）を記録

### mode = shadow（初期の既定）
- PR を作らず、「分類結果 ＋ 対応方針 ＋ 生成差分の要約」を **shadow 先**（§12）へ投稿
- state に `shadow-logged` を記録
- 目的: 5:5 分類の精度と修正品質を人が観察し、閾値を調整してから live へ

### 失敗時（`max_attempts` 超過 / 完了条件が緑にならない）
- 停止し「手動対応が必要: <理由>」を通知
- state に `needs-human` を記録（**再試行しない** = thrash 防止）

## 9. データフロー（1 サイクル）

1. 起動 → ロック取得（多重起動防止）
2. `git fetch origin` → 一時 worktree（origin/main）
3. `triage-from-slack`: state 読込 → 新規投稿取得 → 分類 → 対応キュー（最大 K 件）
4. 各アイテム: ルーティング → `/goal`（最大 N 回）→ `/code-review`（差戻し最大 M 回）→ 出荷（§8）
5. worktree 破棄 → ロック解放 → 実行サマリ通知

## 10. 安全設計（まとめ）

- shadow モードで開始（本番前に品質を人が観察）
- confidence / clarity ゲートで低品質 PR を防止
- escalation 対象は自動化しない
- 冪等（state による重複除外）／ thrash 防止（失敗は再試行しない）
- 1 実行あたり最大 K 件
- worktree 隔離／ main 直接コミット・force-push・auto-merge 禁止
- CI が赤い PR を作らない（ローカルで全ゲート green 確認後のみ push）

## 11. 成果物（実装対象）

| ファイル | 内容 |
|---------|------|
| `.claude/skills/goal/SKILL.md` | `/goal` 汎用ゴールループ |
| `.claude/skills/triage-from-slack/SKILL.md` | Slack 取得・LLM 分類・重複除外 |
| `.claude/skills/fix-and-ship/SKILL.md` | ルーティング → `/goal` → `/code-review` → 出荷 |
| `.claude/agents/bug-fixer.md` | 修正ワーカー（サブエージェント） |
| `AGENTS.md`（追記） | Definition of Done / PR 規約 / escalation |
| `.claude/skills/funbase-triage-cycle/SKILL.md` | 1 サイクル統括（`/loop`・`/schedule` の呼び出し先） |
| `~/.claude/funbase-triage/config.json` | mode(shadow/live)・reviewer・閾値・上限（リポジトリ外・編集で調整） |
| `~/.claude/funbase-triage/state.json` | 重複除外・処理履歴（リポジトリ外） |
| `docs/superpowers/funbase-loop-runbook.md` | 起動 / 試用 / 昇格 / 停止の手順 |

## 12. 未確定点（レビューで確定したい）

1. **レビュアー**（GitHub user / team）: 既定 `tomoakinishimura`（＝あなた）。変更可
2. **shadow 通知先**: 既定「あなたへの Slack DM ＋ ローカルログ」。専用チャンネルにするなら新設
3. **ゲート閾値**: 初期 `confidence ≥ 0.8` / `clarity ≥ 0.7`（shadow で調整）
4. **各種上限**: `K`（1 実行の最大対応数）=3、`N`（`/goal` 最大試行）=3、`M`（review 差戻し）=2
5. **完了通知の粒度**: 元スレ返信のみ か `#announce_funbase` にも出すか

## 13. ロールアウト計画

- **起動層**: まず `/loop`（セッション試用）→ 安定後 `/schedule`（永続）→ 任意で GitHub Actions（24/7）。§3 参照
- **Phase 0（shadow, 1〜2 週間）**: `/loop` + `mode=shadow`。分類精度・修正品質を観察し閾値調整
- **Phase 1（live 限定）**: `bug` かつ high-confidence のみ Ready PR。feature は Draft/確認
- **Phase 2（full live）**: feature もゲート通過で Ready PR。安定を確認して `/schedule` 化
- **Phase 3（任意・将来）**: GitHub Actions へ移植し 24/7 無人化（スキル共通で移植容易）

## 14. 検証方法

- 各スキルは小さく単体起動できる（`triage-from-slack` だけ、`/goal` だけ）
- まず手動で 1〜2 サイクル回して観察 → 問題なければ `/schedule` 化
- shadow モード自体が本番前の主要な検証手段
