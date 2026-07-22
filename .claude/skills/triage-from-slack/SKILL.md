---
name: triage-from-slack
description: #pj_fun-base の新規投稿を読み、bug/feature を LLM 分類し、重複除外して「対応が必要な投稿」の対応キューを作る。FunBase 自動修正ループのトリアージ層。
---

# triage-from-slack

`#pj_fun-base`（既定 channel=`C078H1TQMKK`）の新規投稿から「対応が必要な投稿」を抽出する。

## 入力（config / state から読む）
- config: `~/.claude/funbase-triage/config.json`（`channel`, `thresholds`, `limits`）
- state: `~/.claude/funbase-triage/state.json`
  - `lastTs`: 最後に走査した Slack ts
  - `processed`: `{ "<ts>": "shipped" | "shadow-logged" | "needs-human" | "deferred" | "skipped" }`

## 手順
1. state から `lastTs` と `processed` を読む（無ければ `lastTs` は「直近 1 時間前」、`processed={}`）。
2. Slack を読む: `slack_read_channel(channel, oldest=lastTs)` で新規投稿＋スレッドを取得。
   - **本文は対応判断に必要な範囲のみ扱う。個人情報（候補者名・企業名等）を外部へ送らない。**
3. 各投稿を分類（LLM として自分で判断）:
   - `type`: `bug` | `feature` | `question` | `noise`
   - `actionable`: 対応が必要か（「対応します」「対応必要」「直してほしい」「〜できない/表示されない」等が主シグナル）
   - `confidence`: 0–1（分類の確信度）
   - `clarity`: 0–1（再現手順／期待挙動／仕様が十分か）
   - `summary`, `repro_or_spec`, `slackTs`, `permalink`
4. 除外:
   - `processed` に含まれる `ts` は除外（**二度対応しない**）。ただし `deferred` は再評価対象として残す。
   - `type ∈ {question, noise}` または `actionable=false` は除外。
5. ゲート: `confidence ≥ thresholds.confidence`（既定 0.8）をキュー化。`clarity` は fix-and-ship 側のルーティングに使うので**落とさず保持**。
6. `confidence` 降順で最大 `limits.maxItems`（既定 3）件に絞る。
7. `lastTs` を今回取得した最大 ts に更新し state を書き戻す（走査済みを前進させる）。要確認で保留したものは `processed[ts]="deferred"` を記録し、次回再評価できるようにする。

## 出力
対応キュー（配列）:
```
[{ type, actionable, confidence, clarity, summary, repro_or_spec, slackTs, permalink }, ...]
```
空なら空配列を返す。
