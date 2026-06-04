# FunBase

外国人人材の進捗と面談記録を管理するNext.jsアプリケーションです。

## 機能概要

### ページ構成

- **ダッシュボード** (`/dashboard`): KPIカード、最近の活動、ビザ進捗概要
- **人材一覧** (`/people`): 外国人人材の一覧と詳細情報
- **ビザ進捗管理** (`/visas`): Kanban形式でのビザ申請進捗管理
- **面談記録** (`/meetings`): 面談の記録と内容管理
- **タイムライン** (`/timeline`): 全活動の時系列表示
- **サポート記録** (`/actions`): サポートアクションの管理

### 主な特徴

- **読み取り専用**: すべてのページは参照専用（CRUD操作なし）
- **日本語対応**: 完全な日本語インターフェース
- **レスポンシブデザイン**: モバイル・デスクトップ対応
- **アクセシビリティ**: WCAG AA準拠
- **検索・フィルタ**: 高度な検索とフィルタリング機能

## 技術スタック

- **フレームワーク**: Next.js 15 (App Router)
- **言語**: TypeScript
- **スタイリング**: Tailwind CSS v4 + shadcn/ui
- **アイコン**: Lucide React
- **フォント**: Geist Sans/Mono

## 起動方法

\`\`\`bash
# 依存関係のインストール
npm install

# 開発サーバーの起動
npm run dev

# ビルド
npm run build

# 本番サーバーの起動
npm start
\`\`\`

開発サーバーは http://localhost:3000 で起動します。

## FunEdu 連携

FunBase のサイドバー下部に FunEdu へのサービス切替リンクを表示します。ログイン済みユーザーがリンクを開くと `/api/funedu/sso/start` 経由で FunEdu に遷移します。

### 環境変数

- `FUNEDU_URL` または `NEXT_PUBLIC_FUNEDU_URL`: FunEdu のベース URL
- `FUNEDU_SSO_SECRET`: 設定すると FunEdu 向けに 60 秒有効な SSO JWT を発行します
- `FUNEDU_SSO_CALLBACK_PATH`: FunEdu 側の SSO 受け口。未設定時は `/auth/funbase/callback`

`FUNEDU_SSO_SECRET` 未設定時は FunEdu へ通常遷移します。同一 Supabase セッション Cookie を共有できる構成では、そのままログイン状態を引き継げます。

# ローカルのデータ投入

https://github.com/funtoco/fun-docs/issues/237
こちらを参考に

## データ構成

### データファイル

- `data/people.ts`: 人材データ（20件）
- `data/visas.ts`: ビザ情報（20件）
- `data/meetings.ts`: 面談記録（40件）
- `data/support-actions.ts`: サポートアクション（50件）

### データモデル

\`\`\`typescript
// 人材情報
type Person = {
  id: string
  name: string
  kana?: string
  nationality?: string
  // ... その他のフィールド
}

// ビザ情報
type Visa = {
  id: string
  personId: string
  status: VisaStatus // 7段階のステータス
  type: string // 技人国、特定技能、留学、家族滞在
  // ... その他のフィールド
}

// 面談記録
type Meeting = {
  id: string
  personId: string
  kind: "仕事" | "プライベート"
  notes: MeetingNote[] // 階層化された面談内容
  // ... その他のフィールド
}
\`\`\`

### ビザステータス

1. 書類準備中
2. 書類作成中
3. 書類確認中
4. 申請準備中
5. ビザ申請準備中
6. 申請中
7. ビザ取得済み

## テーマ設定

### カラーシステム

`lib/theme.ts`でカラートークンを定義：

\`\`\`typescript
export const theme = {
  colors: {
    primary: { /* ブルー系 */ },
    secondary: { /* グレー系 */ },
    accent: { /* レッド系 */ },
    surface: { /* ニュートラル */ }
  }
}
\`\`\`

### テーマ変更手順

1. `lib/theme.ts`のカラー値を変更
2. `app/globals.css`のCSS変数を更新
3. 必要に応じてコンポーネントのスタイルを調整

## コンポーネント構成

### レイアウト

- `components/layout/sidebar.tsx`: サイドバーナビゲーション
- `components/layout/header.tsx`: ヘッダー（検索、設定）

### UIコンポーネント

- `components/ui/data-table.tsx`: 検索・フィルタ付きテーブル
- `components/ui/readonly-kanban.tsx`: 読み取り専用Kanbanボード
- `components/ui/timeline.tsx`: タイムライン表示
- `components/ui/tree-note-view.tsx`: 階層化された面談記録表示
- `components/ui/status-badge.tsx`: ステータス表示バッジ
- `components/ui/deadline-chip.tsx`: 期限警告チップ

## 面談分類システム

`constants/meeting-taxonomy.ts`で面談内容の分類を定義：

- **仕事関連**: 勤務時間、業務内容、困りごと
- **健康・生活状況**: 健康状態、生活リズム、家族連絡
- **メンタル・ストレス系**: 精神的疲れ、ストレス、トラブル
- **キャリア・目標**: 試験計画、昇格、キャリア変更
- **日々の対応報告**: 各種手続きサポート

## 開発ガイドライン

### ファイル命名

- ページ: `kebab-case` (例: `people-detail.tsx`)
- コンポーネント: `PascalCase` (例: `StatusBadge.tsx`)
- ユーティリティ: `camelCase` (例: `formatDate`)

### 国際化対応

- 日本語がデフォルト言語
- 日時は`Asia/Tokyo`タイムゾーン
- `formatDate`、`formatDateTime`ユーティリティを使用

### アクセシビリティ

- セマンティックHTML要素の使用
- 適切なARIA属性の設定
- キーボードナビゲーション対応
- 十分なカラーコントラスト

## ライセンス

このプロジェクトはMITライセンスの下で公開されています。
