# FunBase

外国人人材の進捗管理・面談記録・書類管理を行うNext.jsアプリケーション。
Supabaseをバックエンドに使用し、kintone等の外部システムとも連携する。

## 技術スタック
- **フレームワーク**: Next.js (App Router)
- **言語**: TypeScript
- **UI**: React, shadcn/ui, Radix UI, Tailwind CSS
- **バックエンド**: Supabase (PostgreSQL + Auth + Storage)
- **外部連携**: kintone
- **フォーム**: React Hook Form + Zod

## ディレクトリ構成
```
app/
  api/              # APIルート (people, meetings, invite, connectors, etc.)
  people/           # 人材管理画面 (一覧、詳細、編集)
  meetings/         # 面談管理
  announcements/    # お知らせ
  visas/            # ビザ管理
  documents/        # 書類管理
  invite/           # 招待フロー
  admin/            # 管理者画面
  dashboard/        # ダッシュボード
  timeline/         # タイムライン
components/
  ui/               # shadcn/uiコンポーネント群
  layout/           # レイアウト (sidebar, header, conditional-layout)
  kintone/          # kintone連携コンポーネント
  tenant/           # テナント関連
lib/
  supabase/         # Supabaseクライアント・DB操作 (people, meetings, visas, etc.)
  db/               # DB層 (connectors, kintone-data)
  connectors/       # 外部連携
  security/         # セキュリティ
  storage/          # ファイルストレージ
  models.ts         # 型定義
supabase/           # git submodule (funtoco/fun-base-infra)
  migrations/       # DBマイグレーション
  config.toml       # Supabase設定
```

> **Note:** `supabase/` は git submodule (`funtoco/fun-base-infra`)。

## 開発コマンド
```bash
git submodule update --init       # supabase submodule取得
npm install                        # 依存関係インストール
npm run dev                        # 開発サーバー起動
npm run build                      # プロダクションビルド
npm run lint                       # ESLint
npm run typecheck                  # 型チェック
npm run supabase:start             # ローカルSupabase起動
npm run supabase:reset             # DB リセット
npm run setup:env && npm run dev   # 環境変数セットアップ + 開発サーバー
```

## 注意事項
- git push時は `--no-recurse-submodules` を使用すること（supabase submoduleの別ブランチ参照エラー回避）
- マイナンバー等の個人情報はマスク表示すること
- パスエイリアス: `@/*` → `./*`

## ライセンス
© 株式会社Funtoco
