# AGENTS.md - FunBase

## リポジトリの目的

# FunBase

外国人人材の進捗と面談記録を管理するNext.jsアプリケーションです。

## 機能概要

## プロジェクト構造

```
fun-base/
├── src/                    # ソースコード
├── supabase/              # git submodule (funtoco/fun-base-infra)
│   ├── config.toml        # Supabase設定
│   ├── migrations/        # DBマイグレーション
│   ├── seed.sql           # シードデータ
│   └── seed_people_data.sql
├── package.json           # npm依存関係
└── README.md              # プロジェクトドキュメント
```

> **Note:** `supabase/` は git submodule です。`funtoco/fun-base-infra` リポジトリを参照しています。

## 技術スタック

- 詳細はREADME.mdおよびpackage.jsonを参照

## 開発時の注意点

### 開発フロー

1. **セットアップ**
   ```bash
   git submodule update --init   # supabase/ submodule を取得
   npm install                    # 依存関係インストール
   ```

2. **ビルド/実行**
   - README.mdの指示に従ってください

## デバッグ方法

- ログ出力を確認
- 開発者ツールを使用

## 自動修正ループの完了条件（Definition of Done）

自動トリアージ＆修正ループ（`funbase-triage-cycle` / `/goal` / `fix-and-ship`）が「問題が解消した」と判定する条件。**すべて green のときだけ PR 化する**。

1. `npm run typecheck` — 型エラー 0（`next build` は `ignoreBuildErrors:true` のため型を見逃す。**必須ゲート**）
2. `npm run lint` — エラー 0
3. `npm test`（vitest）— 全 pass。**バグ修正時は「まず失敗する回帰テスト」を追加し、それが pass すること**
4. `npm run build` — 成功

## PR 規約（自動ループが従う）

- ブランチ: `auto/fix-<slug>`（bug） / `auto/feat-<slug>`（feature）。必ず `origin/main` から作成
- 1 PR = 1 対応（Slack 1 スレッド）
- PR body テンプレ:
  ```
  ## 概要
  ## 元 Slack
  <permalink>
  ## 分類
  type / confidence
  ## 変更点
  ## テスト
  ## リスク / ロールバック
  ```
- レビュアー: `~/.claude/funbase-triage/config.json` の `reviewer`（既定 `tomoakinishimura`）
- Draft 条件: 低 clarity の feature、または escalation 対象に触れる場合

## 自動化してはいけない領域（escalation）

以下に変更が及ぶ場合、自動 PR にせず **Draft + 人へ通知して停止**する:

- `supabase/migrations/**`（DB マイグレーション）
- 認証: `middleware.ts`, `app/auth/**`, `lib/security/**`
- 暗号: `lib/crypto/**`
- 削除系（ファイル/カラム/データの削除）
- 依存の追加・更新（`package.json` の dependencies 変更）
- `.github/**`, 環境変数 / secrets

## 自動ループの隔離ルール

- 作業は専用 git worktree 内で行い、**ユーザーの作業ツリー・未コミット変更に触れない**
- main への直接コミット / force-push / auto-merge 禁止
- 詳細設計: `docs/superpowers/specs/2026-07-22-funbase-slack-autofix-loop-design.md`

## ライセンス

© 株式会社Funtoco
