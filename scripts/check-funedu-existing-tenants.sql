-- FunEdu 既存テナント抽出（読み取り専用）— issue funtoco/fun-docs#776 追加分
--
-- 目的:
--   本番に「今あるテナント」を抽出し、その slug(=法人ID/COID) を入力に
--   kintone 就労app(13) から支援担当(supportUser) を取得して supporter 紐付け SQL を生成する。
--   （PR#82 の link-funedu-supporters.sql は PR#81 で新規作成した214社だけが対象。
--     以前から本番に存在する funedu テナントは未カバーなので、現在の本番テナントを正として拾い直す。）
--
-- 使い方:
--   - 読み取り専用。何も変更しない。
--   - Supabase SQL Editor は「最後の文の結果」しか表示しないため、(A)(B)(C) を 1つずつ選択実行する。
--     psql ならファイルごと流せば全部出る。
--   - (C) の coids 文字列をそのまま共有してください（kintone 集計の入力にします）。

------------------------------------------------------------------------------
-- (A) サマリ: テナント全体 / 数値slug(=COID候補) / supporter済 / tomoaki が owner の社数
------------------------------------------------------------------------------
select
  count(*)                                                         as tenants_total,
  count(*) filter (where t.slug ~ '^[0-9]+$')                      as numeric_slug_tenants,
  count(*) filter (where exists (
    select 1 from public.user_tenants ut
    where ut.tenant_id = t.id and ut.role = 'supporter'
  ))                                                               as tenants_with_supporter,
  count(*) filter (where exists (
    select 1 from public.user_tenants ut
    join auth.users u on u.id = ut.user_id
    where ut.tenant_id = t.id and ut.role = 'owner'
      and lower(u.email) = 'tomoaki.nishimura@funtoco.jp'
  ))                                                               as tenants_tomoaki_owner
from public.tenants t;

------------------------------------------------------------------------------
-- (B) tomoaki が owner のテナント一覧（owner 外し対象の確認用）
--     supporter_count > 0 かつ「PR#81 の214社」のものだけが今回 owner 外し対象。
--     ここに想定外（=本番で tomoaki が正規 owner の既存社）が混ざっていないか確認する。
------------------------------------------------------------------------------
select
  t.slug,
  t.name,
  (select count(*) from public.user_tenants ut2
     where ut2.tenant_id = t.id and ut2.role = 'supporter') as supporter_count
from public.tenants t
where exists (
  select 1 from public.user_tenants ut
  join auth.users u on u.id = ut.user_id
  where ut.tenant_id = t.id and ut.role = 'owner'
    and lower(u.email) = 'tomoaki.nishimura@funtoco.jp'
)
order by t.slug;

------------------------------------------------------------------------------
-- (C) ★メイン出力★ 数値slug(=COID) を全部カンマ区切りで返す。
--     この coids 文字列をそのまま共有してください（kintone から支援担当を引く入力にします）。
--     ※ supporter 未紐付けのものだけに絞りたい場合は下のコメント版を使う。
------------------------------------------------------------------------------
select string_agg(t.slug, ',' order by (t.slug)::bigint) as coids
from public.tenants t
where t.slug ~ '^[0-9]+$';

-- （参考）supporter がまだ付いていない数値slugテナントだけに絞る版:
-- select string_agg(t.slug, ',' order by (t.slug)::bigint) as coids_without_supporter
-- from public.tenants t
-- where t.slug ~ '^[0-9]+$'
--   and not exists (
--     select 1 from public.user_tenants ut
--     where ut.tenant_id = t.id and ut.role = 'supporter'
--   );
