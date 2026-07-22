---
name: fix-and-ship
description: 対応キューの1アイテムを、worktree隔離のうえ /goal で完了条件まで直し、/code-review で検証し、mode に応じてPR作成＋レビュー依頼＋Slack返信（live）または方針レポート（shadow）まで行う。
---

# fix-and-ship（1アイテムの出荷）

## 入力
- **item**: triage-from-slack の 1 要素 `{ type, confidence, clarity, summary, repro_or_spec, slackTs, permalink }`
- **config**: `~/.claude/funbase-triage/config.json`（`mode`, `reviewer`, `thresholds`, `limits`, `shadowNotify`）

## 0. worktree 隔離
- `git worktree add ~/.claude/funbase-triage/wt/<slug> origin/main`（`<slug>` は item から生成）で作業用 worktree を作る。
- 以降の作業は worktree 内で行い、**ユーザーの作業ツリーに触れない**。
- 最後に必ず `git worktree remove --force ~/.claude/funbase-triage/wt/<slug>` で破棄する。

## 1. ルーティング
- 変更が **escalation 対象**（`supabase/migrations/**`, `middleware.ts`, `app/auth/**`, `lib/security/**`, `lib/crypto/**`, 依存変更, `.github/**`, 削除系）に及ぶ見込み → 実装せず **Draft/Issue 化 or Slack で確認**（live）／レポートのみ（shadow）。理由を記録して 5 へ。
- `type=feature` かつ `clarity < thresholds.clarity`（既定 0.7）→ 実装せず **Slack スレで仕様確認**（live）／レポート（shadow）。5 へ。
- それ以外 → 2 へ。

## 2. /goal で修正
- goal 文面:
  - **bug**:「item.summary のバグを解消し、それを再現する回帰テスト（vitest）が通る。Definition of Done を全て満たす」
  - **feature**:「item.repro_or_spec の最小仕様を満たす。Definition of Done を全て満たす」
- `/goal` を `maxAttempts=limits.maxAttempts`（既定 3）で実行。実装は **bug-fixer サブエージェント**に委譲。
- `status=failed` なら 5（needs-human）へ。

## 3. /code-review で検証（別コンテキスト）
- 差分に対して `/code-review` を実行する。
- ブロッカー指摘があれば `/goal` に差し戻す（最大 `limits.maxReviewRetries`、既定 2）。それでも残るなら 5 へ。

## 4. 出荷
### mode = live
1. `git switch -c auto/fix-<slug>`（feature は `auto/feat-<slug>`）
2. commit（Conventional Commits）
3. `git push -u origin <branch>`
4. `gh pr create`（通常 Ready。Draft 条件に該当すれば `--draft`）。body は AGENTS.md の PR テンプレに沿う。
5. `gh pr edit <pr> --add-reviewer <config.reviewer>`
6. 元 Slack スレッド（`item.slackTs`）へ返信:「🔧 自動対応 PR: <url>」
7. `state.processed[item.slackTs] = "shipped"` を記録

### mode = shadow（初期の既定）
- PR を作らず、`{ 分類, 対応方針, 生成差分の要約(git diff --stat＋要点), 本番なら作成した PR 像 }` を **shadow 先**（`config.shadowNotify`、既定はユーザーへの Slack DM ＋ ローカルログ `~/.claude/funbase-triage/shadow.log`）へ出力。
- `state.processed[item.slackTs] = "shadow-logged"` を記録

## 5. needs-human / 失敗時
- 停止し「🚧 手動対応が必要: <理由>」を通知（live=Slack スレ, shadow=shadow ログ）。
- `state.processed[item.slackTs] = "needs-human"` を記録（**再試行しない** = thrash 防止）。

## 6. 後始末
- worktree を破棄。main を汚さない。CI が赤い PR を作らない（push 前にローカルで全ゲート green を確認済みであること）。
