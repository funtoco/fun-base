---
name: goal
description: 達成条件（Definition of Done）だけを渡し、満たすまで「実装→検証→別コンテキストで達成判定」を繰り返す汎用ゴールループ。バグ修正・機能実装・スコア改善などに使う。/goal で起動。
---

# /goal — ゴールベースループ

「やり方」ではなく「達成条件」を渡し、満たすまで反復する。判定は実装した本人ではなく**別サブエージェント**に任せてバイアスを避ける。

## 入力
- **goal**: 達成条件（自然言語）。例:「◯◯のバグが直り、それを再現する回帰テストが通る」
- **verify**: 達成を確かめるコマンド群。未指定なら AGENTS.md の Definition of Done を使う:
  - `npm run typecheck` / `npm run lint` / `npm test` / `npm run build`（すべて成功）
- **maxAttempts**: 最大試行回数（既定 3）
- **hints**: 試すべきアプローチのヒント（任意）

## ループ
各 attempt で:
1. **実装する**。バグ修正なら TDD を厳守:
   - まず**失敗する回帰テスト**（vitest）を書き、`npm test` で赤を確認（red）
   - 最小修正で緑にする（green）→ 必要ならリファクタ
   - 実際のコード修正は **bug-fixer サブエージェント**に委譲してよい（コンテキスト隔離）
2. **verify を全て実行**する。
3. **達成判定は自分でなく別サブエージェントに依頼**する（バイアス回避）:
   - 「goal を満たしたか？ verify の出力を根拠に yes/no と理由」を渡して判定させる。
4. 達成なら成功で終了。未達なら hints と失敗ログを踏まえ、**別アプローチ**で次の attempt へ。

## 打ち切り
- maxAttempts を超えても未達なら `status=failed` として理由・最後の差分を返して終了する。**無限ループ禁止**。

## 出力
```
{ status: achieved | failed, attempts, summary, diffStat, notes }
```

## 禁止事項
- verify を省略して「たぶん直った」で成功にしない。**必ずコマンド結果を根拠**にする。
- main へコミットしない（呼び出し側が用意した worktree 内で作業する）。
- AGENTS.md の escalation 対象に踏み込む必要が出たら、実装せず理由を付けて `status=failed` で返す。
