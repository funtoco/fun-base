# Company Contact Self-Service Guide

FunBase tenant member 画面から企業担当者を self-service で対応するときの最小ガイドです。

## 使える人

- tenant に `active` で所属している `@funtoco.jp` の社内担当者
- `owner` / `admin` は従来どおり全メンバーを管理可能
- `member` の社内担当者は `企業担当者` の `追加 / 再送 / 削除` のみ対応可能

## 追加

1. tenant の `メンバー` 画面を開く
2. `招待を送信` を押す
3. 企業担当者のメールアドレスを入力する
4. 招待を送信する

メモ:

- 企業担当者は `Member` として招待されます
- 送信されると `user_tenants` は `pending` になります

## 再送

1. tenant の `メンバー` 画面で `pending` メンバーを探す
2. 行メニューから `招待メール再送` を押す

メモ:

- tenant 内の対象 `pending` メンバーにだけ再送できます
- public な `/auth/resend-invite` からは再送できません

## 削除 / 招待キャンセル

1. tenant の `メンバー` 画面で対象メンバーを探す
2. 行メニューから削除を選ぶ

表示ルール:

- `pending` は `招待をキャンセル`
- `active` は `削除`

## resend ではなく reset password が必要なケース

以下は `招待メール再送` ではなく `パスワード再設定` 案内にしてください。

- すでに一度ログイン設定を完了している
- `auth.users` 上は登録済みだが tenant 側が未完了で、再送より reset のほうが確実
- 「リンクは開けたがログインできない」と報告がある

案内先:

- `/auth/reset-password`

## 運用メモ

- `営業担当を全員 admin にする` のは default にしない
- まずは narrow permission のまま company contact 運用を回す
