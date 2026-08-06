---
name: migration-numbering
description: >-
  fun-base-infra（supabase サブモジュール）のマイグレーション採番を、マージ直前に確認して
  必要ならリネームする。以下のときは必ず使うこと：
  infra の PR をマージしようとしている／マイグレーションを新規に作った／
  「マイグレが適用されない」「テーブルや列が無い」「PGRST204」「schema cache に無い」を調べている／
  db-migrate-production ワークフローが failure になった／supabase db push の結果を確認したい。
  マイグレーション・採番・db push・infra の PR という話題なら、明示的に頼まれなくても発動する。
---

# マイグレーション採番チェック

## なぜ必要か

`supabase db push` は **適用済みの最新より古い採番のマイグレーションを、警告もエラーも出さずスキップする**。

スキップされても push は成功扱いで終わる。気づけるのは main マージ後に走る
`db-migrate-production` の parity チェックが落ちたときで、そこまで進むと
「採番し直して再マージ」しか手がない。

実際に 2026-08 だけで #67 / #74 / #75 の3本がこれを踏んでいる。#75 に至っては
`kintone_assignee_codes` 列が入らないまま本番に出て、Webhook が叩かれるたびに
`PGRST204 Could not find the column ... in the schema cache` を出し続けていた。

並行開発中は採番がぶつかりやすい。**マージ直前に必ず確認する。**

## 手順

### 1. 基準になる2つの数字を取る

判定の基準は次の大きい方。

| | 取り方 |
|---|---|
| main の最新採番 | `git ls-tree --name-only origin/main migrations/` の最大 |
| 本番の適用済み最新 | Supabase MCP で fun-studio（`xnntfgsfcvhdvelfpbvz`）に SQL |

```sql
SELECT max(version) FROM supabase_migrations.schema_migrations;
```

main にまだ未適用のマイグレーションが積まれていることがあるので、**両方を見る**。
片方だけだと取りこぼす。

### 2. チェックする

スクリプトはこのスキル配下にあるが、**カレントディレクトリは supabase サブモジュール**で実行する
（`migrations/` を git で見るため）。

```bash
cd <リポジトリルート>/supabase
git fetch origin <対象ブランチ>
bash ../.claude/skills/migration-numbering/scripts/check-numbering.sh \
  origin/main FETCH_HEAD <適用済み最新>
```

worktree の場合はリポジトリルートが worktree のパスになる。`git rev-parse --show-toplevel`
で確かめてから実行する。

終了コードは 0=問題なし / 1=要リネーム。問題があれば `RENAME:` 行で
「今のパス → 推奨パス」を出すので、そのとおりに `git mv` する。

### 3. リネームする

```bash
git mv migrations/<旧>.sql migrations/<新>.sql
git commit -m "fix: マイグレを再採番する"
git push origin <ブランチ>
```

**SQL の中身は変えない。** ファイル名だけ。

コミットメッセージには「なぜ再採番したか」を書く。後から見て
「同じ内容のファイルがなぜ改名されているのか」が分からなくなるため。

### 4. マージして、適用を確認する

マージ後 `db-migrate-production` が走る。**success を確認するまでが作業**。

```bash
gh run list --repo funtoco/fun-base-infra --workflow db-migrate-production.yml --limit 1
```

そのうえで、狙った列やテーブルが実際に増えたかを SQL で確かめる。
ワークフローが success でも、スキップされていれば何も増えていない。

## 絶対にやってはいけないこと

**適用済みのマイグレーションを採番し直さない。**

`schema_migrations` に記録された version とファイル名が食い違い、parity チェックが
永久に落ちる。リネームしてよいのは**まだどの環境にも適用されていないもの**だけ。

適用済みかどうかは必ず SQL で確認する。ファイル名や git 履歴からは分からない。

```sql
SELECT version FROM supabase_migrations.schema_migrations ORDER BY version DESC LIMIT 5;
```

## 複数のPRをまとめて直さない

提案採番は「基準の翌日」から作るので、**基準が動かないうちに複数PRを直すと同じ番号になる**。

1本ずつ、マージ直前にやる。1本マージすれば main の最新が動き、次の提案も自然にずれる。

## 落とし穴

- **リネームは `git diff --diff-filter=A` に映らない**。採番し直し自体がリネーム(R)なので、
  差分を見るときは `AR` を使う。`A` だけだと採番ミスを見逃す
- **`db push --dry-run` はスキップを教えてくれない**。「適用するものが無い」と
  「適用対象を飛ばした」を区別しない
- **`--include-all` を使えば古い採番でも適用できる**が、履歴が順不同のまま残る。
  一度使うと以後ずっと必要になるので、採番し直す方を選ぶ
- **`migration-replay` の CI は通る**。あれは `db reset` でゼロから再生するだけで、
  本番の適用状況とは無関係。緑でも安心材料にならない

## 参考

- 本番プロジェクト: fun-studio / `xnntfgsfcvhdvelfpbvz`
- 適用ワークフロー: `.github/workflows/db-migrate-production.yml`（main の `migrations/**` 変更で発火）
- ブランチ保護: `main` は `migration-replay` 必須・`strict: true`（マージ前に最新化が必要）
