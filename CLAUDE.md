# FunBase - 外国人人材進捗管理システム

## プロジェクト概要
特定技能外国人の進捗管理・面談記録・ビザ管理・生活支援を一元管理するWebアプリケーション。kintoneコネクタからデータを同期し、閲覧中心のダッシュボードを提供。

## 技術スタック
- **フレームワーク**: Next.js 14 (App Router, TypeScript)
- **スタイリング**: Tailwind CSS v4, shadcn/ui (Radix UI)
- **認証・DB**: Supabase (Auth SSR, PostgreSQL, RLS)
- **状態管理**: Zustand
- **チャート**: Recharts
- **パッケージマネージャ**: npm

## ローカル開発
```bash
# Supabaseサブモジュール初期化
git submodule update --init

# Supabase起動
npm run supabase:start

# DBリセット（マイグレーション再適用）
npm run supabase:reset

# 開発サーバー起動
npm run dev

# 型チェック
npm run typecheck
```

## ローカルURL

| サービス | URL |
|---------|-----|
| アプリ | http://localhost:3000 |
| Supabase Studio | http://127.0.0.1:54321 |

## アーキテクチャ

### ユーザー層
- **管理者**: テナント・コネクタ設定、アクセスログ閲覧
- **一般ユーザー**: 人材一覧・ビザ管理・面談記録の閲覧

### ディレクトリ構成
```text
app/
├── auth/                # 認証フロー（ログイン・サインアップ・パスワードリセット）
├── admin/               # 管理画面（コネクタ・テナント・アクセスログ）
├── api/                 # APIルート（コネクタ、認証、テナント等 約30エンドポイント）
├── dashboard/           # KPIカード、最近のアクティビティ
├── people/              # 人材一覧・詳細（タブ: 情報、ビザ、面談、書類）
├── visas/               # ビザ管理（カンバンビュー）
├── meetings/            # 面談記録一覧
├── timeline/            # 全アクティビティのタイムライン
├── documents/           # 書類管理
└── announcements/       # お知らせ
lib/
├── supabase/            # データアクセス層（people, visas, meetings等）
├── connectors/          # kintoneコネクタクライアント
├── security/            # 認証ガード
├── crypto/              # 暗号化ユーティリティ
└── models.ts            # TypeScript型定義
components/
├── layout/              # サイドバー、ヘッダー
├── ui/                  # shadcn/uiコンポーネント群
└── connectors/          # コネクタ管理UI
```

### DB設計（主要テーブル）
- **people**: 人材マスタ（名前、国籍、在留カード情報等）
- **visas**: ビザ管理（7ステージワークフロー）
- **meetings**: 面談記録（階層的ノート構造）
- **support_actions**: 生活支援アクション（16+カテゴリ）
- **tenants**: マルチテナント管理
- **connectors**: 外部データソース連携設定

### ビザステータスワークフロー（7段階）
書類準備中 → 書類作成中 → 書類確認中 → 申請準備中 → ビザ申請準備中 → 申請中 → ビザ取得済み

## 注意事項
- `supabase/` はgitサブモジュール（`funtoco/fun-base-infra`）。`git submodule update --init` が必要
- `next.config.mjs` で `typescript.ignoreBuildErrors: true` が設定されている
- `middleware.ts` の認証チェックがテスト用にコメントアウトされている場合あり
- 画像最適化は無効化済み（`unoptimized: true`）
- タイムゾーン: Asia/Tokyo
