-- FunEdu 既存テナントへの支援担当ひも付け（ワンショット / 手動実行用）— issue funtoco/fun-docs#776 追加分
--
-- ※ これは migration ではありません。supabase/migrations には置かず、本番DBに対して
--    psql / Supabase SQL Editor から「1回だけ」手動実行する想定のスクリプトです。
-- ※ 本番の現テナント(slug=COID, scripts/check-funedu-existing-tenants.sql の(C)で抽出)のうち、
--    PR#81 で新規作成した214社を除いた「既存116社」が対象。
--    kintone 就労app(13) の supportUser(支援担当者) を COID ごとに集約して生成（生成日: 2026-05-27）。
--
-- 内容:
--   既存116社について、kintone 就労app(13) で workingStatus が「内定取消」「内定辞退」以外の
--   就労者に紐づく支援担当(supportUser=funtocoメール)を全員、role='supporter' として user_tenants に追加する。
--
--   - PR #82 (link-funedu-supporters.sql) で対応済みの214社はこのファイルには含めない。
--   - owner は一切触らない（既存テナントの owner は PR#81 の仮置きではないため）。
--   - supporter 重複(user_id,tenant_id,role)はスキップ（冪等）。
--   - tenant 未作成(slug 不一致) / 支援担当が auth.users に未登録 はスキップし NOTICE に集計。
--     未登録の支援担当は NOTICE に列挙されるので、必要ならアカウント作成後に再実行する。
--   - 念のためトランザクションで実行し、NOTICE の件数を確認してから commit してください。
--
-- 集計サマリ（生成時点）:
--   対象既存社: 116 / 支援担当ありの社: 116 / supporter 0 の社: 0
--   (COID,email) ペア: 234 / distinct 支援担当(メール): 23
--
-- 実行方法:
--   begin;
--   \i scripts/link-funedu-existing-supporters.sql
--   -- NOTICE: linked=.., dup_skipped=.., no_tenant=.., no_user(skipped)=.. を確認
--   commit;

do $oneshot$
declare
  rec               record;
  v_tenant_id       uuid;
  v_user_id         uuid;
  v_linked          int := 0;
  v_dup             int := 0;
  v_no_tenant       int := 0;
  v_no_user         int := 0;
  v_missing         text[] := '{}';
begin
  for rec in
    select * from (values
      -- 焼肉ホルモンまるよし精肉店 南森町店 (1534)
      ('1534','bijay@funtoco.jp'),
      ('1534','myu@funtoco.jp'),
      -- 回転寿司ととぎん 近鉄奈良駅前店 (1553)
      ('1553','bijay@funtoco.jp'),
      ('1553','dishma@funtoco.jp'),
      -- 活魚と日本料理 和楽心 新庄店 (1554)
      ('1554','bijay@funtoco.jp'),
      -- ココス七尾店 (1563)
      ('1563','phyoe@funtoco.jp'),
      ('1563','sushant@funtoco.jp'),
      -- 太閤折詰株式会社 (1611)
      ('1611','gyawa@funtoco.jp'),
      ('1611','myu@funtoco.jp'),
      ('1611','sushant@funtoco.jp'),
      -- つるとんたん UDON NOODLE Brasserie KARUIZAWA JAPAN (1627)
      ('1627','ina@funtoco.jp'),
      ('1627','ly@funtoco.jp'),
      ('1627','reno@funtoco.jp'),
      ('1627','sushant@funtoco.jp'),
      -- 特別養護老人ホームあさぎりの郷 (1700)
      ('1700','phyoe@funtoco.jp'),
      -- コープリハビリテーション病院 (17156)
      ('17156','ina@funtoco.jp'),
      -- 特別養護老人ホーム 南山苑 (17190)
      ('17190','sushant@funtoco.jp'),
      -- 特別養護老人ホーム　久喜ことぶき苑 (17195)
      ('17195','bijay@funtoco.jp'),
      -- 障害者支援施設　希望の里 (17347)
      ('17347','reno@funtoco.jp'),
      -- 吉村病院 (17399)
      ('17399','ina@funtoco.jp'),
      -- 特別養護老人ホーム幸園 (17434)
      ('17434','reno@funtoco.jp'),
      -- 社会福祉法人 恩賜財団 済生会松阪総合病院 (17460)
      ('17460','gyawa@funtoco.jp'),
      -- 介護老人保健施設リハビリパーク駿府 (1755)
      ('1755','hmone@funtoco.jp'),
      ('1755','phyu@funtoco.jp'),
      ('1755','reno@funtoco.jp'),
      ('1755','thet@funtoco.jp'),
      -- グループホームもえれのお家　大和館・バルブロ館 (17614)
      ('17614','thet@funtoco.jp'),
      -- KFCビバシティ彦根店 (17618)
      ('17618','phyoe@funtoco.jp'),
      ('17618','sushant@funtoco.jp'),
      -- 特別養護老人ホーム本田山荘 (1763)
      ('1763','may@funtoco.jp'),
      -- 私立稲美中央病院 (17648)
      ('17648','thet@funtoco.jp'),
      -- 介護老人保健施設ハートホーム山口 (1771)
      ('1771','phyoe@funtoco.jp'),
      -- 竹原病院 (1775)
      ('1775','phyoe@funtoco.jp'),
      -- 特別養護老人ホームハニーヒルズ (1801)
      ('1801','phyu@funtoco.jp'),
      -- 特別養護老人ホーム ウエルハイム・ヨコゼ (1817)
      ('1817','phyu@funtoco.jp'),
      -- 千原厚生園 (1879)
      ('1879','may@funtoco.jp'),
      -- 中馬病院 (1901)
      ('1901','ina@funtoco.jp'),
      ('1901','sushant@funtoco.jp'),
      ('1901','thet@funtoco.jp'),
      -- 特別養護老人ホーム秋桜 (1912)
      ('1912','chamara@funtoco.jp'),
      ('1912','reno@funtoco.jp'),
      -- 介護老人福祉施設緑風苑 (1920)
      ('1920','phyu@funtoco.jp'),
      -- 特別養護老人ホーム ザイクスヒル長南 (1962)
      ('1962','chamara@funtoco.jp'),
      ('1962','may@funtoco.jp'),
      -- 障害者支援施設 初雁の家 (1966)
      ('1966','phyu@funtoco.jp'),
      ('1966','sushant@funtoco.jp'),
      -- 特別養護老人ホーム ハートホーム宮野 (1967)
      ('1967','phyoe@funtoco.jp'),
      -- 介護医療院よしだ (1984)
      ('1984','thet@funtoco.jp'),
      -- 坂本病院 (1989)
      ('1989','phyu@funtoco.jp'),
      ('1989','thuthu@funtoco.jp'),
      -- 介護老人保健施設フォレスト西早稲田 (2017)
      ('2017','may@funtoco.jp'),
      ('2017','reno@funtoco.jp'),
      -- 特別養護老人ホーム久我山園 (2018)
      ('2018','may@funtoco.jp'),
      -- 特別養護老人ホームライフ (2037)
      ('2037','myu@funtoco.jp'),
      -- 特別養護老人ホーム 保谷苑 (2056)
      ('2056','may@funtoco.jp'),
      ('2056','thet@funtoco.jp'),
      -- 介護老人保健施設千音寺 (2060)
      ('2060','hmone@funtoco.jp'),
      ('2060','ina@funtoco.jp'),
      ('2060','phyu@funtoco.jp'),
      ('2060','reno@funtoco.jp'),
      -- 特別養護老人ホーム 恵の家 (2065)
      ('2065','ly@funtoco.jp'),
      ('2065','myu@funtoco.jp'),
      -- 介護老人保健施設もえれパークサイド (2080)
      ('2080','thet@funtoco.jp'),
      -- 特別養護老人ホームみどり園 (2090)
      ('2090','thet@funtoco.jp'),
      -- ゆぁほうむ榛原 (2130)
      ('2130','myu@funtoco.jp'),
      -- 地域密着型特別養護老人ホームそのさと (2137)
      ('2137','phyoe@funtoco.jp'),
      -- 特別養護老人ホーム室生園 (2143)
      ('2143','ina@funtoco.jp'),
      ('2143','myu@funtoco.jp'),
      -- 特別養護老人ホーム やすらぎの里 (2200)
      ('2200','ly@funtoco.jp'),
      ('2200','sandy@funtoco.jp'),
      ('2200','thet@funtoco.jp'),
      -- 介護老人保健施設 おおふじ五幸ホーム (2202)
      ('2202','reno@funtoco.jp'),
      -- 介護老人保健施設サニーヒル (2207)
      ('2207','hmone@funtoco.jp'),
      ('2207','sandy@funtoco.jp'),
      ('2207','tra@funtoco.jp'),
      ('2207','wakaba.nakamura@funtoco.jp'),
      -- 特別養護老人ホーム清風園 (2208)
      ('2208','may@funtoco.jp'),
      -- 医療法人財団 暁 あきる台病院 (2268)
      ('2268','may@funtoco.jp'),
      ('2268','phyoe@funtoco.jp'),
      -- 和歌浦中央病院 (2378)
      ('2378','may@funtoco.jp'),
      ('2378','myu@funtoco.jp'),
      -- 特別養護老人ホームほのぼの苑 (2421)
      ('2421','phyoe@funtoco.jp'),
      ('2421','reno@funtoco.jp'),
      -- 訪問介護事業所日本介護医療センター (2484)
      ('2484','sushant@funtoco.jp'),
      -- 特別養護老人ホーム福寿の里 (2495)
      ('2495','phyu@funtoco.jp'),
      -- 特別養護老人ホーム 東茶屋御苑 (2530)
      ('2530','chamara@funtoco.jp'),
      ('2530','hmone@funtoco.jp'),
      ('2530','ina@funtoco.jp'),
      ('2530','reno@funtoco.jp'),
      -- 特別養護老人ホームはるかぜ (2531)
      ('2531','hmone@funtoco.jp'),
      ('2531','reno@funtoco.jp'),
      ('2531','thet@funtoco.jp'),
      -- 成増厚生病院 (2537)
      ('2537','hlaing@funtoco.jp'),
      ('2537','hmone@funtoco.jp'),
      ('2537','myu@funtoco.jp'),
      ('2537','phyoe@funtoco.jp'),
      ('2537','phyu@funtoco.jp'),
      ('2537','reno@funtoco.jp'),
      ('2537','sandy@funtoco.jp'),
      ('2537','thuthu@funtoco.jp'),
      -- 障害者支援施設「陽気園」 (2538)
      ('2538','ina@funtoco.jp'),
      -- 相生病院 (2543)
      ('2543','ina@funtoco.jp'),
      ('2543','reno@funtoco.jp'),
      ('2543','sushant@funtoco.jp'),
      ('2543','wakaba.nakamura@funtoco.jp'),
      -- 練馬駅リハビリテーション病院 (2552)
      ('2552','bijay@funtoco.jp'),
      ('2552','dishma@funtoco.jp'),
      ('2552','hmone@funtoco.jp'),
      ('2552','may@funtoco.jp'),
      ('2552','phyoe@funtoco.jp'),
      ('2552','reno@funtoco.jp'),
      ('2552','ryoji.nagao@funtoco.jp'),
      ('2552','thuthu@funtoco.jp'),
      ('2552','yusuke.onobayashi@funtoco.jp'),
      -- 介護老人保健施設ローズ (2553)
      ('2553','bijay@funtoco.jp'),
      ('2553','dishma@funtoco.jp'),
      ('2553','funtoco.parttime5@gmail.com'),
      ('2553','hmone@funtoco.jp'),
      ('2553','ina@funtoco.jp'),
      ('2553','phyoe@funtoco.jp'),
      ('2553','reno@funtoco.jp'),
      ('2553','tra@funtoco.jp'),
      -- 特別養護老人ホーム 万寿苑 (2555)
      ('2555','ly@funtoco.jp'),
      ('2555','thet@funtoco.jp'),
      ('2555','tra@funtoco.jp'),
      -- 特別養護老人ホームレインボー今里 (2562)
      ('2562','hmone@funtoco.jp'),
      ('2562','ina@funtoco.jp'),
      ('2562','thet@funtoco.jp'),
      -- 特別養護老人ホーム おおみの (2569)
      ('2569','bijay@funtoco.jp'),
      ('2569','dishma@funtoco.jp'),
      ('2569','funtoco.parttime5@gmail.com'),
      ('2569','hmone@funtoco.jp'),
      ('2569','ina@funtoco.jp'),
      ('2569','phyoe@funtoco.jp'),
      ('2569','reno@funtoco.jp'),
      ('2569','sushant@funtoco.jp'),
      ('2569','tra@funtoco.jp'),
      -- グループホームみさき中茶屋 (2578)
      ('2578','bijay@funtoco.jp'),
      ('2578','funtoco.parttime5@gmail.com'),
      ('2578','hmone@funtoco.jp'),
      ('2578','ina@funtoco.jp'),
      ('2578','ly@funtoco.jp'),
      -- 特別養護老人ホーム秀華苑 (2581)
      ('2581','hmone@funtoco.jp'),
      ('2581','ina@funtoco.jp'),
      ('2581','phyu@funtoco.jp'),
      ('2581','sandy@funtoco.jp'),
      ('2581','tra@funtoco.jp'),
      ('2581','wakaba.nakamura@funtoco.jp'),
      -- さん舞子神港園いこいの家 (2585)
      ('2585','hmone@funtoco.jp'),
      ('2585','ly@funtoco.jp'),
      ('2585','may@funtoco.jp'),
      ('2585','recruiting.yamamoto@funtoco.jp'),
      ('2585','thet@funtoco.jp'),
      ('2585','tra@funtoco.jp'),
      -- 回転寿司ととぎん 都島店 (2667)
      ('2667','bijay@funtoco.jp'),
      -- GARB PUBLIC (2671)
      ('2671','bijay@funtoco.jp'),
      -- 介護老人保健施設 ルピナス (2705)
      ('2705','myu@funtoco.jp'),
      -- 姫路中央病院 (2720)
      ('2720','thet@funtoco.jp'),
      -- 特別養護老人ホームフローラル (2727)
      ('2727','thet@funtoco.jp'),
      -- 串本有田病院 (2770)
      ('2770','myu@funtoco.jp'),
      -- 特別養護老人ホーム姫の沢荘 (2783)
      ('2783','chamara@funtoco.jp'),
      ('2783','may@funtoco.jp'),
      -- 社会福祉法人エージングライフ福祉会特別養護老人ホーム クレーネ堺 (2787)
      ('2787','bijay@funtoco.jp'),
      ('2787','chamara@funtoco.jp'),
      ('2787','dishma@funtoco.jp'),
      ('2787','gyawa@funtoco.jp'),
      ('2787','ly@funtoco.jp'),
      ('2787','myu@funtoco.jp'),
      ('2787','phyoe@funtoco.jp'),
      ('2787','sushant@funtoco.jp'),
      -- 特別養護老人ホームりんどう (2846)
      ('2846','may@funtoco.jp'),
      -- 医療法人桂信会羽原病院 (2914)
      ('2914','gyawa@funtoco.jp'),
      ('2914','myu@funtoco.jp'),
      ('2914','phyoe@funtoco.jp'),
      ('2914','sushant@funtoco.jp'),
      -- 藤掛病院 介護医療院 (2924)
      ('2924','phyu@funtoco.jp'),
      ('2924','sandy@funtoco.jp'),
      ('2924','sushant@funtoco.jp'),
      -- 医療法人橋本病院 (2932)
      ('2932','myu@funtoco.jp'),
      -- 特別養護老人ホームハピネスさんあい (2955)
      ('2955','ina@funtoco.jp'),
      -- 特別養護老人ホーム片岡杉の子園 (2972)
      ('2972','reno@funtoco.jp'),
      -- 幸 枚方公園 (2991)
      ('2991','gyawa@funtoco.jp'),
      ('2991','may@funtoco.jp'),
      ('2991','myu@funtoco.jp'),
      ('2991','phyoe@funtoco.jp'),
      -- 医療法人三幸会 北山病院 (2992)
      ('2992','gyawa@funtoco.jp'),
      ('2992','phyoe@funtoco.jp'),
      -- さくらの郷 (3032)
      ('3032','ly@funtoco.jp'),
      ('3032','may@funtoco.jp'),
      ('3032','phyoe@funtoco.jp'),
      ('3032','phyu@funtoco.jp'),
      -- のぞみの丘ホスピタル (3043)
      ('3043','phyu@funtoco.jp'),
      -- デイサービス グッドライフケア梅田 (3090)
      ('3090','bijay@funtoco.jp'),
      ('3090','may@funtoco.jp'),
      ('3090','reno@funtoco.jp'),
      -- 株式会社べるびゅー大栄 (3100)
      ('3100','thet@funtoco.jp'),
      -- 特別養護老人ホーム塩田ホーム (3115)
      ('3115','phyu@funtoco.jp'),
      -- ケアハウス三輪の里 (3132)
      ('3132','ly@funtoco.jp'),
      ('3132','may@funtoco.jp'),
      ('3132','myu@funtoco.jp'),
      -- 宿泊付デイサービス レインボゥロード (3153)
      ('3153','thet@funtoco.jp'),
      -- ラフィン・ハーツ門真 (3194)
      ('3194','thet@funtoco.jp'),
      -- 特別養護老人ホームハトホーム (3200)
      ('3200','phyu@funtoco.jp'),
      -- 社会福祉法人志賀福祉会　近江舞子しょうぶ苑 (3222)
      ('3222','gyawa@funtoco.jp'),
      ('3222','phyoe@funtoco.jp'),
      -- 特別養護老人ホーム長楽園 (3223)
      ('3223','myu@funtoco.jp'),
      -- セイワ習志野介護老人福祉施設 (3240)
      ('3240','may@funtoco.jp'),
      -- 特別養護老人ホームひまわり園 (3260)
      ('3260','phyoe@funtoco.jp'),
      -- ユニット型地域密着型介護老人福祉施設府中静和寮よつば館 (3303)
      ('3303','phyoe@funtoco.jp'),
      -- 介護老人福祉施設百寿苑 (3324)
      ('3324','thet@funtoco.jp'),
      -- 特別養護老人ホームテンダーヒル御所 (3336)
      ('3336','myu@funtoco.jp'),
      -- 特別養護老人ホーム 故郷-敬川 (3401)
      ('3401','ina@funtoco.jp'),
      -- 和歌浦病院 (3419)
      ('3419','myu@funtoco.jp'),
      -- やすらぎの郷 (3485)
      ('3485','phyoe@funtoco.jp'),
      ('3485','reno@funtoco.jp'),
      -- 老人保健施設エルダーヴィラ氷見 (3617)
      ('3617','phyoe@funtoco.jp'),
      -- 特別養護老人ホーム白光苑 (3652)
      ('3652','phyoe@funtoco.jp'),
      -- 介護老人保健施設 アロンティアクラブ (3744)
      ('3744','thet@funtoco.jp'),
      -- 訪問介護ステーションらくらく幸寿苑 (3745)
      ('3745','ina@funtoco.jp'),
      ('3745','thet@funtoco.jp'),
      -- ベテラン館はらいちば デイサービス (3752)
      ('3752','phyu@funtoco.jp'),
      -- いなべ総合病院 (3771)
      ('3771','gyawa@funtoco.jp'),
      ('3771','phyoe@funtoco.jp'),
      ('3771','sushant@funtoco.jp'),
      -- 特別養護老人ホームセピアの園 (4561)
      ('4561','thet@funtoco.jp'),
      -- ハニカム (5423)
      ('5423','may@funtoco.jp'),
      -- 楽楽リハビリデイサービス (5474)
      ('5474','thet@funtoco.jp'),
      -- 特別養護老人ホーム長楽園 (5487)
      ('5487','phyoe@funtoco.jp'),
      -- ふじみ野介護老人保健施設ベテラン館 (5518)
      ('5518','phyu@funtoco.jp'),
      -- 医療法人愛善会 由良病院 (5521)
      ('5521','ina@funtoco.jp'),
      -- 介護老人保健施設でぃあほうむ吉野 (5582)
      ('5582','myu@funtoco.jp'),
      -- 特別養護老人ホームはまゆう園 (5616)
      ('5616','myu@funtoco.jp'),
      -- ふく福さくら館 (5629)
      ('5629','reno@funtoco.jp'),
      -- みずほ病院 (5645)
      ('5645','reno@funtoco.jp')
    ) as t(company_id, email)
  loop
    -- tenant(slug=法人ID) を解決。未作成ならスキップ。
    select id into v_tenant_id from public.tenants where slug = rec.company_id;
    if v_tenant_id is null then
      v_no_tenant := v_no_tenant + 1;
      continue;
    end if;

    -- 支援担当(メール)を auth.users で解決。未登録ならスキップして集計。
    select id into v_user_id from auth.users where lower(email) = lower(rec.email);
    if v_user_id is null then
      v_no_user := v_no_user + 1;
      if not (rec.email = any(v_missing)) then
        v_missing := array_append(v_missing, rec.email);
      end if;
      continue;
    end if;

    -- supporter を冪等に追加。
    if exists (
      select 1 from public.user_tenants
      where user_id = v_user_id and tenant_id = v_tenant_id and role = 'supporter'
    ) then
      v_dup := v_dup + 1;
    else
      insert into public.user_tenants (user_id, tenant_id, email, role, status, joined_at)
      values (v_user_id, v_tenant_id, rec.email, 'supporter', 'active', now());
      v_linked := v_linked + 1;
    end if;
  end loop;

  raise notice 'FunEdu existing supporters: linked=%, dup_skipped=%, no_tenant=%, no_user(skipped)=%',
    v_linked, v_dup, v_no_tenant, v_no_user;
  if array_length(v_missing, 1) is not null then
    raise notice 'Missing support staff (no auth.users, % 名): %', array_length(v_missing, 1), array_to_string(v_missing, ', ');
  end if;
end $oneshot$;
