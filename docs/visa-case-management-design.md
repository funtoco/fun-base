# ビザ案件管理システム 設計書

最終更新: 2026-08-03 / ステータス: 設計中（主要判断は確定、詳細は §10 の未決事項）

## 1. ゴール

kintone に **「ビザ案件管理」アプリ**を新設し、ビザ申請案件の**マスタ（発生源）**にする。
OP が案件を作り、関連レコードとフォルダを**事前に紐付け**ておくことで、
FunBase ポータルに来た提出物を **照合なしで**各アプリへ自動反映できるようにする。

### 一言でいうと
> 「どのレコードに書くか」を**事前紐付けで確定**させておく → 転記が「照合」から「更新」に変わる
> → 重複ゼロ・完全自動が安全に成立する。

---

## 2. 全体フロー

```
① OP：kintone[ビザ案件管理]で案件作成
     ・種別(新規/変更)・分野(介護/外食…)を選ぶ
     ・🔗 法人(app34) / 事業所 / 雇用条件書(app55) を事前紐付け
     ・📁 Google Drive フォルダ URL を手動で貼る
        │
        │  kintone Webhook（レコード追加/更新）→ FunBase 受信 → Supabase にミラー(upsert)
        ▼
② 企業：FunBase ポータルで提出
     ・雇用条件書 Excel（申請書類作成フォーム）をアップ
     ・その他書類（履歴事項/住民票 等）をアップ
        │
        ├─ Excel → 抽出(transcribeWorkbook) → 紐付け済みの
        │        [法人 app34] [雇用条件書 app55] レコードへ直接 update（完全自動・照合不要）
        │
        └─ その他書類 → Google Drive API で案件指定フォルダへ files.create
        ▼
③ ステータス：kintone プロセス管理で進行 → Webhook で FunBase に反映（双方向）
   コメント：kintone レコードコメント ⇄ FunBase ケースコメント（双方向）
```

### 役割分担
| 領域 | 主体 |
|------|------|
| 案件マスタ（メタ・紐付け・ステータス・コメント） | **kintone ビザ案件管理** |
| 企業向け提出フロント（アップロード） | **FunBase ポータル** |
| Excel からの構造化抽出 | **FunBase**（既存 `transcribeWorkbook`） |
| 各マスタへの反映先 | **法人(app34) / 雇用条件書(app55) のみ** |
| その他書類の実体 | **Google Drive** |

---

## 3. kintone「ビザ案件管理」アプリ フィールド定義

> ✅ **作成済み（2026-08-03）**: `就労_ビザ案件管理` = **app 296**（本番デプロイ済）。
> URL: https://funtoco.cybozu.com/k/296/ ／ プロセス管理6段階・ルックアップ3本設定済。
> 下表の「フィールドコード」は実アプリに反映済みの実コード。

| フィールド名 | フィールドコード | 種類 | 必須 | 用途・備考 |
|------------|----------------|------|:---:|-----------|
| 案件番号 | `case_no` | レコード番号/自動採番 | ○ | kintone 側の一意番号 |
| FunBase caseId | `funbase_case_id` | 文字列(1行) | ○ | FunBase 連携キー。**重複禁止**設定 |
| 案件名 | `case_title` | 文字列(1行) | ○ | 例「近江舞子しょうぶ苑・HTET WAI YAN・初回」 |
| 種別 | `apply_type` | ドロップダウン | ○ | 新規 / 変更 |
| 分野 | `field` | ドロップダウン | ○ | 介護 / 外食 / …（§10 で選択肢確定） |
| 対象人材（申請人） | `applicant` | 文字列 or ルックアップ | ○ | 人材マスタがあればルックアップ |
| 🔗 法人 | `company_ref` | ルックアップ(→app34) | ○ | 反映先の法人。**法人番号/レコードID**を保持 |
| 🔗 事業所 | `office_ref` | ルックアップ or 文字列 | △ | 事業所マスタがあればルックアップ |
| 🔗 雇用条件書 | `koyou_ref` | 関連レコード or レコードID(→app55) | ○ | 反映先の雇用条件書レコード（§10：事前作成運用） |
| 📁 Drive フォルダURL | `drive_folder_url` | リンク | ○ | OP が手動で貼る。ここへその他書類を投入 |
| 提出Excel | `submitted_excel` | 添付ファイル or リンク | | 参照用（実体は FunBase/Storage or Drive） |
| ステータス | (プロセス管理) | プロセス管理 | ○ | §4 |
| 法人反映ステータス | `sync_company_status` | ドロップダウン | | 未反映/反映済/エラー |
| 雇用条件書反映ステータス | `sync_koyou_status` | ドロップダウン | | 未反映/反映済/エラー |
| 反映日時 | `synced_at` | 日時 | | 最終反映日時 |
| 反映ログ | `sync_log` | 文字列(複数行) | | エラー詳細・差分 |
| コメント | (標準コメント機能) | コメント | | FunBase と双方向連携（§5.4） |

**実装メモ（実コード / 2026-08-03 反映済）**
- **案件キー = kintoneレコード番号（自動採番）**。`funbase_case_id`（手動テキスト）は廃止。FunBaseへはこのレコード番号を連携キーとして流す（kintoneが発生源のため）
- 分野 = `bunya`（介護/外食/宿泊/飲食料品製造/その他）
- 🔗ルックアップはいずれも**レコード番号キー**（対象アプリに重複禁止フィールドが無いため）：
  - 対象人材 `applicant_ref` → **app30 マスタ_人材管理**、キー=`HRID`(人材ID)、自動コピー先 `applicant_name_disp`（fullName）／必須
  - 法人 `company_ref` → app34、キー=`COID`(法人ID)、自動コピー先 `company_name_disp`（法人名）／必須
  - 雇用条件書 `koyou_ref` → app55、キー=`レコード番号`、自動コピー先 `koyou_applicant_disp`（申請人氏名）／任意
  - 事業所 `office_ref` → app36、キー=`OFID`(事業所ID)、自動コピー先 `office_name_disp`（事業所名）／任意
- 反映ステータス2本（`sync_company_status` / `sync_koyou_status`）は既定「未反映」
- フォームレイアウト＝4セクション（基本情報／紐付け／書類・Drive／反映管理）に整理済
- **前提: 1案件=1申請人**（対象人材は単一ルックアップ）。複数人材を1案件に束ねる場合は対象人材をサブテーブル化し、`koyou_ref`＋`sync_koyou_status`もテーブル内へ移す

---

## 4. プロセス管理（ステータス）設計

FunBase 既存の申請フローに揃える：

| # | ステータス | 意味 | FunBase 表示 |
|---|-----------|------|-------------|
| 1 | 下書き | OP が案件を準備中 | 下書き |
| 2 | 書類収集中 | ポータル公開・企業が提出中 | 書類収集中 |
| 3 | 確認中 | 提出物を OP が確認 | 確認中 |
| 4 | 申請準備完了 | 反映完了・申請可能 | 申請準備完了 |
| 5 | 連携済み | kintone 各アプリへ反映済み | 連携済み |
| 6 | 完了 | 申請完了 | 完了 |

- ステータス変更は原則 kintone 側で行い、Webhook で FunBase に反映。
- 一部の自動遷移（提出完了で「確認中」など）は FunBase → kintone API で更新。

---

## 5. 連携設計

### 5.1 kintone → FunBase（案件ミラー）
- **トリガ**: kintone Webhook（レコード追加・編集）→ **即反映**
- **受信**: FunBase に受信 API（例 `POST /api/kintone/webhook/visa-case`）を新設
  - 署名/トークン検証（kintone Webhook のヘッダ or 共有シークレット）
- **処理**: `funbase_case_id`（無ければ kintone レコードID）をキーに Supabase の案件テーブルへ **upsert**
  - ミラーする項目：案件メタ・種別/分野・紐付け（法人/事業所/雇用条件書）・Driveフォルダ・ステータス
- **狙い**: 既存 FunBase ポータル（applications / requirements / office_documents）の仕組みを作り直さず、上流を kintone に差し替える

### 5.2 FunBase → kintone（提出 → 反映）
- **Excel（雇用条件書）**
  - 企業アップロード契機。`unstable_after`（next/server, 14.2）で**レスポンス後にバックグラウンド実行**＝「裏で勝手に」
  - 既存 `loadApplicationWorkbook` → `transcribeWorkbook` で抽出
  - **反映先は事前紐付けで確定済みのレコードID**（app34 の法人 / app55 の雇用条件書）へ `PUT record`（update）
    - → 照合不要・再アップロードでも同じレコードを上書き＝**重複ゼロ**
  - 結果を案件管理レコードの `sync_*_status` / `synced_at` / `sync_log` に書き戻し
- **その他書類**
  - Google Drive API `files.create`（親 = 案件の Drive フォルダ）へアップロード（§6）

### 5.3 ステータス双方向
- kintone でステータス変更 → Webhook → FunBase 反映（5.1 に含む）
- FunBase 側イベント（提出完了など）→ kintone REST API でステータス更新

### 5.4 コメント双方向連携
- **kintone → FunBase**: レコードのコメント投稿 → Webhook（コメント通知）→ FunBase ケースコメントへ挿入
- **FunBase → kintone**: ケースコメント投稿 → kintone REST `POST /k/v1/record/comment` へ
- **ループ防止**: 
  - 連携で作ったコメントには接頭辞/メタ（例「[FunBase] 山田より」）を付け、投稿者を bot ユーザーに固定
  - 送信元識別フラグを持たせ、同期由来のコメントは再送しない
- **対応付け**: 案件（`funbase_case_id` ⇄ kintone レコードID）単位

---

## 6. Google Drive 連携

- **認証**: サービスアカウント（対象の共有ドライブ／フォルダに編集権限を付与）
- **フォルダ**: **OP が手動で** フォルダ URL を案件に貼る（**自動作成しない**）
  - URL からフォルダ ID を抽出（`/folders/{id}`）
- **アップロード**: FunBase の「その他書類」アップロード → Drive `files.create`（`parents=[folderId]`）
- **命名**: `{案件名}_{書類種別}_{YYYYMMDD}.{ext}` 等（§10 で確定）
- **権限**: サービスアカウントが共有ドライブメンバーであること

---

## 7. 権限・実行コンテキスト

- FunBase → kintone の反映は**システム実行**（kintone API トークン）。
  企業アップロードが契機のため、既存の `isPortalWriter`（OP限定）チェックは通さず、**サーバ側のシステム権限で担保**する。
- kintone API トークン：`ビザ案件管理` / `マスタ_法人(app34)` / `雇用条件書(app55)` それぞれに必要な権限（閲覧・編集・コメント）を付与。
- Webhook 受信は署名/シークレット検証必須。

---

## 8. 冪等性・エラー処理

- **案件キー対応**: `funbase_case_id`（FunBase） ⇄ kintone レコードID
- **反映の冪等性**: 事前紐付け済みレコードID への update のため、**再アップロードで重複しない**
- **失敗時**: 案件管理レコードの `sync_*_status = エラー` ＋ `sync_log` に詳細。OP へ通知（コメント or 通知）
- **部分成功**: app34 成功／app55 失敗 のような状態を個別ステータスで可視化

---

## 9. 実装フェーズ

| Phase | 内容 | 依存 |
|-------|------|------|
| 1 | kintone「ビザ案件管理」アプリ作成（フィールド＋プロセス管理） | — |
| 2 | kintone → FunBase Webhook ミラー（受信API＋Supabase upsert） | 1 |
| 3 | FunBase Excel 抽出 → app34/app55 へ**紐付けキー方式**で自動反映（既存 transcribe 流用） | 1,2 |
| 4 | Google Drive 連携（その他書類のアップロード） | 1 |
| 5 | ステータス双方向同期 | 2 |
| 6 | コメント双方向連携 | 2 |

> 現状: `transcribeWorkbook` / `loadApplicationWorkbook` は実装済み。app34 は法人番号 upsert、app55 はドライラン。
> Phase 3 で「法人番号 upsert」→「事前紐付けレコードID への update」に切り替えることで app55 も安全に実書き込み可能になる。

---

## 10. 未決・確認事項

1. **雇用条件書(app55) レコードの事前作成運用**
   - 事前紐付けするには app55 レコードが先に存在する必要がある。
   - 案：OP が案件作成時に**空の app55 レコードを作って紐付け** → Excel が中身を埋める。これで OK？
2. **事業所マスタアプリ**の有無（あればルックアップ、無ければ文字列 or 法人に内包）
3. **分野の選択肢**（介護・外食・…／特定技能の対象分野をどこまで持つか）
4. **種別「変更」時**の反映差分（新規と同じ全項目上書きでよいか、差分のみか）
5. **Drive ファイル命名規則**・重複時の扱い（上書き/版管理）
6. **コメント連携の投稿者表示**（bot 名・接頭辞の文言）

---

## 付録：関連する既存資産

- FunBase 転記ロジック: `lib/portal/kintone-sync/transcribe.ts`（`transcribeWorkbook`）
- Excel ローダ: `lib/portal/kintone-sync/source.ts`（`loadApplicationWorkbook`）
- 転記 API（現状・ドライラン）: `app/api/applications/[caseId]/kintone-transcribe/route.ts`
- アップロード API: `app/api/applications/[caseId]/requirements/[requirementId]/documents/route.ts`
- kintone 書込クライアント: `lib/portal/kintone-sync/kintone-write-client.ts`
- 対象アプリ: マスタ_法人 = **app34**、就労_ビザ書類作成_雇用条件書 = **app55**

---

## 11. クロスウォーク確定・実装状況（2026-08-03）

### kintone実体ID → FunBase実体（案件INSERTのjoinキー）
| kintone | → FunBase | 方式 |
|---|---|---|
| 申請人 app30 HRID | `people.external_id` | 既存（コネクタ同期 HRID→external_id） |
| 法人 app34 COID | `connectors.company_id` → `tenant` | 既存（tenant毎にkintoneコネクタ、company_id=COID） |
| 事業所 app36 OFID | `tenant_offices.name` | **事業所名で完全一致の名寄せ**（FunBase側は新設しない。app296の`office_name_disp` ⇄ 同一tenant内の`tenant_offices.name`。不一致はミラー保留＝OP要対応） |

### Webhook / 実行コンテキスト（設計確定）
- kintone Webhookは独自ヘッダ/HMAC不可 → 共有シークレットは`?secret=`（`KINTONE_WEBHOOK_SECRET`）でタイミングセーフ検証
- 受信は無セッション → `getServiceClient()`（service-role）でRLSバイパスupsert
- 永続リンク列 `kintone_record_id`/`kintone_sync_status`/`kintone_last_synced_at` は既存（未使用）。UNIQUE部分インデックスを追加（`20260803000000_portal_add_kintone_case_link.sql`）
- ステータス6状態はCASE_STATUS_LABELSと完全一致。app296プロセスのアクション名=提出開始/確認へ/準備完了へ/kintone連携/完了（Phase1で設定済）
- Drive認証は`googleapis`不要、既存依存`jose`でサービスアカウントJWT→Drive REST

### 実装進捗
- ✅ Phase1（app296）/ Phase3（転記＋実書き込みE2E）
- ✅ 共通マイグレーション（kintone_record_id UNIQUE index）
- ✅ 純粋ヘルパ: `webhook.ts`（verifyWebhookSecret/parseVisaCaseWebhook）, `status-map.ts`（双方向＋アクション名解決）, `drive/folder.ts`（extractDriveFolderId/buildDriveFileName）
- ✅ 書込クライアント拡張: `updateRecordStatus`（status.json）/ `getRecordComments` / `postRecordComment`（Phase5/6用）
- ✅ 永続リンク配線: `kintone_record_id`/`kintone_sync_status`/`kintone_last_synced_at` を型・getCase・listCases に反映
- ✅ **アップロード自動トリガー**: `source.ts`をservice-role化＋`run-transcription.ts`（`runCaseTranscription`システム実行コア／`maybeAutoTranscribeOnUpload`）。文書アップロードrouteで、提出Excel＋案件がapp296紐付け済みなら**自動で実書き込み転記**（応答内await・失敗しても提出は成功、エラーはapp296に記録）。転記routeも`?kintoneCaseId`未指定時は`kintone_record_id`フォールバック。※Next14.2.35は`after`未提供のためawait方式
- ✅ **Phase 2 Webhookミラー完成**: `app/api/kintone/webhook/route.ts`（`?secret=`検証→parse→type分岐）＋`case-mirror.ts`（`mapKintoneRecordToCaseRow`純粋写像／クロスウォーク解決`resolveTenantByCoid`=connector_app_filters[field_code=COID,filter_value]→connectors.tenant_id・`resolveTenantOfficeByName`=同tenant内tenant_offices.name完全一致・`resolvePersonByHrid`=people.external_id／`mirrorCaseFromKintone`=kintone_record_idでupsert＋メンバー付与＋新規時materialize best-effort）。DELETE→archived。簡略化: entity_type='corporate'既定・apply_type新規→initial/変更→renewal（§10）
- ✅ **Phase 5 ステータス双方向完成**: `status-sync.ts`（`extractKintoneStatusLabel`（STATUS field=`ステータス`）／受信`applyKintoneStatusToCase`=Supabase更新のみ・kintone非再送でループ防止／送信`advanceKintoneCaseStatus`=現状からアクション列で前進・同一/後退/archivedはno-op）＋`applications.ts`の`updateCaseStatus`（writer認可→service-role更新→紐付けありなら`advanceKintoneCaseStatus`）＋`PATCH /api/applications/[caseId]/status`＋Webhook `UPDATE_STATUS`結線
- ✅ **Phase 6 コメント双方向完成**: マイグレ`20260803010000_case_comments_kintone_sync.sql`（source/kintone_comment_id/kintone_author/synced_to_kintone_at＋重複排除unique）＋`comment-sync.ts`（buildKintoneCommentText/isFunbaseOriginText/pushCommentToKintone/importKintoneComment/resolveCaseByKintoneRecord/resolveKintoneRecordId、**三重ループ防止=接頭辞[FunBase]＋(case_id,kintone_comment_id)一意＋sourceフラグ**）＋`comments.ts`（addCommentでpush・listCommentsでsource/kintone_author反映）＋Webhook `ADD_RECORD_COMMENT`結線
- ✅ **Phase 4 Google Drive完成**: `drive/drive-client.ts`（`jose`でSA-JWT RS256→OAuth→multipartアップロード、googleapis不要、`GOOGLE_SERVICE_ACCOUNT_JSON`未設定ならnull）＋`drive/mirror.ts`（`mirrorRequirementDocumentToDrive`=その他書類をapp296の`drive_folder_url`フォルダへbest-effort）＋`case-hub.ts`に`driveFolderUrl`追加＋文書アップロードrouteに結線
- ✅ **事業所書類ステータスのkintone同期（2026-08-05）**: app296に固定フィールド`doc_status_*`7本を追加し、書類1件ごとのステータスをkintone正で管理。`office-doc-status.ts`（純粋: マッピング表／ラベル双方向／payload生成／record抽出／差分抽出）＋`office-doc-sync.ts`（orchestration: `pushOfficeDocStatuses`／`applyKintoneOfficeDocStatuses`／`pushRequirementStatusToKintone`）＋Webhook `ADD_RECORD`/`UPDATE_RECORD`に受信＋空欄初期化を結線＋アップロードrouteに「確認中」pushを結線。空欄=未使用/未初期化、受信は差分のみ更新でループ防止。設計は[specs/2026-08-05-office-doc-status-kintone-sync-design.md](superpowers/specs/2026-08-05-office-doc-status-kintone-sync-design.md)
- **テスト計 229件pass**・型クリーン（新規: phase-helpers 15 / client-methods 5 / case-mirror 5 / status-sync 6 / comment-sync 6 / drive 5）

## 🎉 全Phase(1〜6)実装完了。GO-LIVEに必要な外部作業のみ残り：
1. **本番デプロイ**（Vercel funbase.funtoco.jp、ブランチ`claude/visa-portal-phase5-full-mapping`をマージ）
2. **マイグレ2本適用**（サブモジュールfun-base-infra: `20260803000000`＋`20260803010000`）
3. **Google Driveサービスアカウント**（`GOOGLE_SERVICE_ACCOUNT_JSON`をVercelに）＝Phase4稼働に必要
4. Webhook登録済・`KINTONE_WEBHOOK_SECRET`設定済（`funbase.funtoco.jp/api/kintone/webhook?secret=`、5イベントON）
5. 未テスト（ライブ疎通で検証）: DB orchestration系（mirror/status受信/comment取込/runCaseTranscription／既存Supabase関数と同様ユニット非対象、pure部＋クライアント駆動部は網羅）
- 未テスト（ライブWebhook疎通で検証）: `mirrorCaseFromKintone`/`runCaseTranscription`のDB orchestration（既存Supabase関数と同様ユニット非対象・pure部は網羅）
