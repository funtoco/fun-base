# FunBase 自動トリアージ＆修正ループ Runbook

設計書: `specs/2026-07-22-funbase-slack-autofix-loop-design.md`

## 構成（外側タイマーは一つ。中で /goal を回す）
```
/loop（試用）or /schedule（本番）      ← 外側の“くり返し”タイマー（一つだけ）
   └─ /funbase-triage-cycle           ← 1サイクル統括
        ├─ triage-from-slack          ← #pj_fun-base を分類・重複除外
        └─ fix-and-ship（各アイテム）  ← worktree隔離 → /goal → /code-review → 出荷
             └─ /goal                 ← 完了条件まで直し切る内側ループ（bug-fixer に委譲）
```
- 設定: `~/.claude/funbase-triage/config.json`（mode / reviewer / 閾値 / 上限）
- 状態: `~/.claude/funbase-triage/state.json`（重複除外・処理履歴）

> 新しく作った skill はセッションに認識されるまで再読み込み（セッション開き直し）が要る場合があります。

## ① まず手動で1サイクル（推奨・shadow）
セッションで:
```
/funbase-triage-cycle
```
→ `#pj_fun-base` の新規投稿を分類し、**shadow モード**で「こう対応する」を出力（PR は作らない）。
分類精度・方針の質を確認し、必要なら config の閾値を調整する。

## ② セッションで毎時ループ（試用）
```
/loop 1h /funbase-triage-cycle
```
- このセッションが開いている間、毎時実行。閉じると停止・7 日で失効。
- **専用のターミナル/セッション**で動かすと、普段の作業と干渉しない。
- 動作確認を速くしたいときは間隔を短く（例 `/loop 15m /funbase-triage-cycle`）。

## ③ shadow → live へ切替
`~/.claude/funbase-triage/config.json` の `"mode": "shadow"` を `"live"` に変更。
段階導入したい場合は、閾値やフィルタで「bug かつ high-confidence だけ live」から始める。

## ④ 停止 / 緊急停止
- ループ停止: セッションを閉じる、または `/loop` を止める。
- **緊急停止**: config の `mode` を `shadow` に戻す（PR 作成・Slack 返信を止める）。

## ⑤ 永続化（安定後）
`/schedule` で `funbase-triage-cycle` を毎時に登録（セッションをまたいで永続）。
真の 24/7 が必要なら GitHub Actions へ移植（設計書 §3 の段階 3。スキル群は共通で移植容易）。
