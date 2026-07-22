---
name: funbase-triage-cycle
description: FunBase の Slack 自動トリアージ＆修正ループの1サイクル。#pj_fun-base を読み、対応が必要な投稿をゴール達成まで直し PR 化する。/loop（試用）や /schedule（本番）から毎時呼ばれる想定。
---

# FunBase Triage Cycle（1 サイクル）

`/loop`（試用）や `/schedule`（本番）から毎時呼ばれる、トリアージ→修正→出荷の 1 回分。
外側のタイマー（`/loop`・`/schedule`）は**一つだけ**。このサイクルの中で各アイテムを `/goal` で直し切る。

設計書: `docs/superpowers/specs/2026-07-22-funbase-slack-autofix-loop-design.md`

## 前提の読み込み
1. 設定を読む: `~/.claude/funbase-triage/config.json`
   - `mode`(shadow|live), `channel`, `reviewer`, `thresholds{confidence,clarity}`, `limits{maxItems,maxAttempts,maxReviewRetries}`, `shadowNotify`
   - 無ければ既定値: mode=shadow, channel=`C078H1TQMKK`(#pj_fun-base), reviewer=`tomoakinishimura`, confidence≥0.8, clarity≥0.7, maxItems=3, maxAttempts=3, maxReviewRetries=2
2. **多重起動防止**: `~/.claude/funbase-triage/lock` が存在し十分新しい（例: 90 分以内）なら「前回実行中」とみなし終了。無ければロックを作成（時刻を記録）。**最後に必ず解放**する。

## 手順
1. `git fetch origin` を実行（作業ツリーには触らない）。
2. **triage-from-slack** スキルを実行し、対応キュー（最大 `maxItems` 件）を得る。
3. キューが空なら、ロックを解放して「新規なし」で終了。
4. 各アイテムについて **fix-and-ship** スキルを 1 件ずつ順に実行（`mode` を渡す）。
   - fix-and-ship が worktree の作成・破棄を担う。
5. 全件終了後、実行サマリ（処理数 / PR or shadow ログ / needs-human 件数）を出力。
6. ロックを解放して終了。

## 不変条件（必ず守る）
- 外側タイマーは一つ。このサイクル内で `/loop`・`/schedule` を新たに起動しない。
- main へ直接コミット / force-push / auto-merge しない。
- ユーザーの作業ツリー・未コミット変更に触れない（作業は worktree 内）。
- 同じ投稿を二度対応しない（state による重複除外。triage-from-slack が担保）。
- 失敗は再試行キューに戻さず `needs-human` を記録（thrash 防止）。
- `mode=shadow` の間は PR を作らない（方針レポートのみ）。
