-- FunEdu 支援担当ひも付け（ワンショット / 手動実行用）— issue funtoco/fun-docs#776
--
-- ※ これは migration ではありません。supabase/migrations には置かず、本番DBに対して
--    psql / Supabase SQL Editor から「1回だけ」手動実行する想定のスクリプトです。
-- ※ kintone 就労app(13) の supportUser(支援担当者) を COID ごとに集約して生成（生成日: 2026-05-27）。
--
-- 内容:
--   PR #81 で作成した214社(slug=法人ID)について、kintone 就労app(13) で workingStatus が
--   「内定取消」「内定辞退」以外の就労者に紐づく支援担当(supportUser=funtocoメール)を全員、
--   role='supporter' として user_tenants に追加し、supporter が1名以上ついた tenant から
--   PR #81 で仮置きした owner(tomoaki.nishimura@funtoco.jp) を外す。
--
--   - supporter 重複(user_id,tenant_id,role)はスキップ（冪等）。
--   - tenant 未作成(slug 不一致) / 支援担当が auth.users に未登録 はスキップし NOTICE に集計。
--     未登録の支援担当は NOTICE に列挙されるので、必要ならアカウント作成後に再実行する。
--   - 念のためトランザクションで実行し、NOTICE の件数を確認してから commit してください。
--
-- 実行方法:
--   begin;
--   \i scripts/link-funedu-supporters.sql
--   -- NOTICE: linked=.., dup_skipped=.., no_tenant=.., no_user(skipped)=.., owner_removed=.. を確認
--   commit;

do $oneshot$
declare
  rec               record;
  v_owner_id        uuid;
  v_tenant_id       uuid;
  v_user_id         uuid;
  v_linked          int := 0;
  v_dup             int := 0;
  v_no_tenant       int := 0;
  v_no_user         int := 0;
  v_owner_removed   int := 0;
  v_supporter_tenants uuid[] := '{}';
  v_missing         text[] := '{}';
begin
  select id into v_owner_id from auth.users where lower(email) = lower('tomoaki.nishimura@funtoco.jp');

  for rec in
    select * from (values
      -- 株式会社グリーンファースト (1385)
      ('1385','reno@funtoco.jp'),
      -- 株式会社ワールド・ヘリテイジ (1465)
      ('1465','recruiting.yamamoto@funtoco.jp'),
      -- 株式会社ヨリソッテ (1466)
      ('1466','dishma@funtoco.jp'),
      ('1466','reno@funtoco.jp'),
      -- 株式会社TUGフードアシスト (1467)
      ('1467','tra@funtoco.jp'),
      -- 株式会社ふじ森 (1468)
      ('1468','dishma@funtoco.jp'),
      ('1468','ly@funtoco.jp'),
      ('1468','sandy@funtoco.jp'),
      -- 株式会社かめいあんじゅ (1476)
      ('1476','dishma@funtoco.jp'),
      ('1476','funtoco.parttime5@gmail.com'),
      ('1476','reno@funtoco.jp'),
      ('1476','sushant@funtoco.jp'),
      ('1476','wakaba.nakamura@funtoco.jp'),
      -- 有限会社オーストリア菓子サイラー・ジャパン (1477)
      ('1477','wakaba.nakamura@funtoco.jp'),
      -- パティスリー ガレット (1478)
      ('1478','phyu@funtoco.jp'),
      ('1478','wakaba.nakamura@funtoco.jp'),
      -- 有限会社吉野屋 (1479)
      ('1479','tra@funtoco.jp'),
      -- 株式会社ミュウ (1480)
      ('1480','wakaba.nakamura@funtoco.jp'),
      -- 有限会社ラッフィナート (1481)
      ('1481','tra@funtoco.jp'),
      -- 株式会社NULPUM (1482)
      ('1482','dishma@funtoco.jp'),
      -- 有限会社パラダイスアンドランチ (1483)
      ('1483','reno@funtoco.jp'),
      ('1483','wakaba.nakamura@funtoco.jp'),
      -- 有限会社モリ (1484)
      ('1484','tra@funtoco.jp'),
      -- 株式会社ル・ピノー (1485)
      ('1485','reno@funtoco.jp'),
      -- 合同会社Panda-ya (1486)
      ('1486','tra@funtoco.jp'),
      ('1486','wakaba.nakamura@funtoco.jp'),
      -- 株式会社サニーサイド (1487)
      ('1487','dishma@funtoco.jp'),
      ('1487','ly@funtoco.jp'),
      ('1487','phyu@funtoco.jp'),
      ('1487','tra@funtoco.jp'),
      -- 株式会社にしむらコーヒーサービス (1488)
      ('1488','myu@funtoco.jp'),
      ('1488','ryoji.nagao@funtoco.jp'),
      ('1488','wakaba.nakamura@funtoco.jp'),
      ('1488','yusuke.onobayashi@funtoco.jp'),
      -- 株式会社ドゥリアン (1490)
      ('1490','dishma@funtoco.jp'),
      ('1490','funtoco.parttime5@gmail.com'),
      ('1490','reno@funtoco.jp'),
      ('1490','ryoji.nagao@funtoco.jp'),
      ('1490','sandy@funtoco.jp'),
      ('1490','wakaba.nakamura@funtoco.jp'),
      ('1490','yusuke.onobayashi@funtoco.jp'),
      -- 千房株式会社 (1504)
      ('1504','bijay@funtoco.jp'),
      ('1504','sushant@funtoco.jp'),
      -- 株式会社串匠 (1513)
      ('1513','bijay@funtoco.jp'),
      -- 株式会社インタ－ナショナル・ダイニング・コ－ポレ－ション (1515)
      ('1515','bijay@funtoco.jp'),
      -- 株式会社肉ゲキジョー (1527)
      ('1527','sushant@funtoco.jp'),
      -- 株式会社YKH (1530)
      ('1530','bijay@funtoco.jp'),
      ('1530','gyawa@funtoco.jp'),
      -- 株式会社食道園 (1535)
      ('1535','bijay@funtoco.jp'),
      -- 藏ウェルフェアサービス株式会社 (1537)
      ('1537','thet@funtoco.jp'),
      -- 株式会社グルーヴ (1541)
      ('1541','bijay@funtoco.jp'),
      -- 大真実業株式会社 (1549)
      ('1549','thet@funtoco.jp'),
      -- 株式会社ダンシンダイナー (1556)
      ('1556','bijay@funtoco.jp'),
      ('1556','ly@funtoco.jp'),
      ('1556','yusuke.onobayashi@funtoco.jp'),
      -- 有限会社キリムラ (1558)
      ('1558','bijay@funtoco.jp'),
      ('1558','dishma@funtoco.jp'),
      -- 株式会社ゴリップ (1566)
      ('1566','bijay@funtoco.jp'),
      -- 株式会社HASSIN (1610)
      ('1610','bijay@funtoco.jp'),
      -- 株式会社ロン (1613)
      ('1613','bijay@funtoco.jp'),
      -- 株式会社レストラン・シャンソニエ (1615)
      ('1615','wakaba.nakamura@funtoco.jp'),
      -- 株式会社ファイブイデアル (1616)
      ('1616','phyu@funtoco.jp'),
      ('1616','yusuke.onobayashi@funtoco.jp'),
      -- 株式会社HY料理研究所 (1624)
      ('1624','wakaba.nakamura@funtoco.jp'),
      -- 合同会社C.S company (1630)
      ('1630','ryoji.nagao@funtoco.jp'),
      ('1630','yusuke.onobayashi@funtoco.jp'),
      -- 株式会社i Food Service (1634)
      ('1634','tra@funtoco.jp'),
      -- 株式会社音羽 (1636)
      ('1636','dishma@funtoco.jp'),
      -- 株式会社ナカコーポレーション (1637)
      ('1637','bijay@funtoco.jp'),
      ('1637','reno@funtoco.jp'),
      -- 株式会社吉しや (1638)
      ('1638','ina@funtoco.jp'),
      -- エスオーフードビジネス株式会社 (1639)
      ('1639','bijay@funtoco.jp'),
      ('1639','hmone@funtoco.jp'),
      ('1639','sushant@funtoco.jp'),
      ('1639','tra@funtoco.jp'),
      -- 株式会社いろり屋 (1641)
      ('1641','ly@funtoco.jp'),
      ('1641','wakaba.nakamura@funtoco.jp'),
      -- 株式会社かが万 (1642)
      ('1642','thet@funtoco.jp'),
      ('1642','wakaba.nakamura@funtoco.jp'),
      ('1642','yusuke.onobayashi@funtoco.jp'),
      -- 株式会社ディーエーアイ (1643)
      ('1643','dishma@funtoco.jp'),
      ('1643','recruiting.yamamoto@funtoco.jp'),
      ('1643','reno@funtoco.jp'),
      ('1643','ryoji.nagao@funtoco.jp'),
      ('1643','sushant@funtoco.jp'),
      -- 株式会社RETOWN (1645)
      ('1645','recruiting.yamamoto@funtoco.jp'),
      -- 医療法人樹光会 (1660)
      ('1660','thet@funtoco.jp'),
      -- 株式会社あさまかい (1691)
      ('1691','phyoe@funtoco.jp'),
      -- 社会福祉法人盡誠会 (1722)
      ('1722','may@funtoco.jp'),
      -- 医療法人千里厚生会 (1744)
      ('1744','phyu@funtoco.jp'),
      -- 株式会社らくじ会 (1921)
      ('1921','reno@funtoco.jp'),
      ('1921','thet@funtoco.jp'),
      -- 医療法人尚寿会 (1944)
      ('1944','reno@funtoco.jp'),
      ('1944','sandy@funtoco.jp'),
      ('1944','thet@funtoco.jp'),
      -- 医療法人社団翠鳳会 (1954)
      ('1954','ina@funtoco.jp'),
      -- 社会福祉法人水澄み会 (1956)
      ('1956','funtoco.parttime5@gmail.com'),
      ('1956','hmone@funtoco.jp'),
      ('1956','thet@funtoco.jp'),
      -- 株式会社愛生 (1958)
      ('1958','may@funtoco.jp'),
      -- 社会福祉法人ユーカリ優都会 (1960)
      ('1960','may@funtoco.jp'),
      -- 社会医療法人社団医善会 (1980)
      ('1980','may@funtoco.jp'),
      -- 医療法人昭圭会 (1983)
      ('1983','thet@funtoco.jp'),
      -- 社会福祉法人楽慈会 (1992)
      ('1992','ly@funtoco.jp'),
      ('1992','reno@funtoco.jp'),
      ('1992','thet@funtoco.jp'),
      -- 社会福祉法人鈴の音会 (1994)
      ('1994','myu@funtoco.jp'),
      -- 医療法人清水会 (1996)
      ('1996','reno@funtoco.jp'),
      ('1996','sandy@funtoco.jp'),
      ('1996','thet@funtoco.jp'),
      -- 株式会社ニチイ学館 (2024)
      ('2024','bijay@funtoco.jp'),
      ('2024','chamara@funtoco.jp'),
      ('2024','hmone@funtoco.jp'),
      ('2024','ly@funtoco.jp'),
      ('2024','may@funtoco.jp'),
      ('2024','reno@funtoco.jp'),
      ('2024','sandy@funtoco.jp'),
      ('2024','sushant@funtoco.jp'),
      ('2024','taiko.tottori@funtoco.jp'),
      ('2024','tra@funtoco.jp'),
      ('2024','wakaba.nakamura@funtoco.jp'),
      -- 株式会社メディプラン (2030)
      ('2030','reno@funtoco.jp'),
      ('2030','sandy@funtoco.jp'),
      ('2030','thet@funtoco.jp'),
      -- 株式会社愛誠会 (2055)
      ('2055','phyu@funtoco.jp'),
      ('2055','reno@funtoco.jp'),
      ('2055','thuthu@funtoco.jp'),
      -- 医療法人財団湖聖会 (2083)
      ('2083','may@funtoco.jp'),
      -- 医療法人社団水澄み会 (2085)
      ('2085','hmone@funtoco.jp'),
      ('2085','reno@funtoco.jp'),
      -- 社会福祉法人三篠会 (2101)
      ('2101','reno@funtoco.jp'),
      -- 合同会社ReaDy (2105)
      ('2105','ina@funtoco.jp'),
      ('2105','sandy@funtoco.jp'),
      -- 医療法人芥川会 (2106)
      ('2106','funtoco.parttime5@gmail.com'),
      ('2106','ina@funtoco.jp'),
      -- 医療法人平病院 (2120)
      ('2120','phyu@funtoco.jp'),
      -- 株式会社ゆかりの里苑 (2138)
      ('2138','funtoco.parttime5@gmail.com'),
      -- 社会福祉法人明光会 (2147)
      ('2147','reno@funtoco.jp'),
      -- 社会福祉法人きらくえん (2151)
      ('2151','ly@funtoco.jp'),
      ('2151','sushant@funtoco.jp'),
      ('2151','thet@funtoco.jp'),
      -- 社会福祉法人和敬会倶楽部 (2165)
      ('2165','ina@funtoco.jp'),
      ('2165','reno@funtoco.jp'),
      ('2165','thet@funtoco.jp'),
      -- 社会福祉法人みなの福祉会 (2182)
      ('2182','phyu@funtoco.jp'),
      -- 社会福祉法人江寿会 (2193)
      ('2193','hmone@funtoco.jp'),
      -- 医療法人甲聖会 (2194)
      ('2194','phyu@funtoco.jp'),
      -- 社会福祉法人犬鳴山 (2195)
      ('2195','phyoe@funtoco.jp'),
      ('2195','thet@funtoco.jp'),
      -- 有限会社エムツーコーポレーション (2216)
      ('2216','thet@funtoco.jp'),
      -- 社会福祉法人黎明会 (2219)
      ('2219','hmone@funtoco.jp'),
      -- 社会福祉法人西山福祉会 (2222)
      ('2222','hmone@funtoco.jp'),
      -- 社会福祉法人檸檬 (2264)
      ('2264','reno@funtoco.jp'),
      -- 社会福祉法人慈恩会 (2300)
      ('2300','myu@funtoco.jp'),
      -- 社会福祉法人知多学園 (2374)
      ('2374','hmone@funtoco.jp'),
      ('2374','phyu@funtoco.jp'),
      -- 社会福祉法人利生会 (2381)
      ('2381','thet@funtoco.jp'),
      -- 社会福祉法人優光福祉会 (2382)
      ('2382','funtoco.parttime5@gmail.com'),
      ('2382','hmone@funtoco.jp'),
      ('2382','ina@funtoco.jp'),
      ('2382','ly@funtoco.jp'),
      ('2382','sandy@funtoco.jp'),
      -- 医療法人北陽会 (2383)
      ('2383','hmone@funtoco.jp'),
      -- 社会福祉法人ほしの会 (2384)
      ('2384','tra@funtoco.jp'),
      -- 社会福祉法人緑生福祉会 (2389)
      ('2389','reno@funtoco.jp'),
      -- 株式会社nagomi (2439)
      ('2439','thet@funtoco.jp'),
      -- 社会福祉法人石心福祉会 (2453)
      ('2453','ina@funtoco.jp'),
      -- 社会福祉法人三秀會 (2489)
      ('2489','funtoco.parttime5@gmail.com'),
      ('2489','ina@funtoco.jp'),
      -- 社会福祉法人正武福祉会 (2501)
      ('2501','thet@funtoco.jp'),
      -- 社会福祉法人仁正会 (2503)
      ('2503','phyoe@funtoco.jp'),
      -- 社会福祉法人春生会 (2525)
      ('2525','chamara@funtoco.jp'),
      -- 株式会社W (2526)
      ('2526','hmone@funtoco.jp'),
      -- 株式会社QOL (2527)
      ('2527','ly@funtoco.jp'),
      -- 社会福祉法人高針福祉会 (2528)
      ('2528','hmone@funtoco.jp'),
      ('2528','ly@funtoco.jp'),
      ('2528','thet@funtoco.jp'),
      -- 社会福祉法人グリーントープ (2529)
      ('2529','hmone@funtoco.jp'),
      ('2529','phyoe@funtoco.jp'),
      ('2529','phyu@funtoco.jp'),
      -- 社会福祉法人大潤会 (2532)
      ('2532','hmone@funtoco.jp'),
      ('2532','sushant@funtoco.jp'),
      ('2532','thet@funtoco.jp'),
      -- 社会福祉法人真秀会 (2533)
      ('2533','hmone@funtoco.jp'),
      ('2533','may@funtoco.jp'),
      -- 医療法人貴和会 (2534)
      ('2534','ly@funtoco.jp'),
      -- 社会福祉法人恩賜財団済生会支部東京都済生会 (2535)
      ('2535','may@funtoco.jp'),
      -- 社会福祉法人一梅会 (2536)
      ('2536','hmone@funtoco.jp'),
      -- 社会福祉法人翠生会 (2539)
      ('2539','hmone@funtoco.jp'),
      -- 社会福祉法人恵生会 (2541)
      ('2541','thet@funtoco.jp'),
      ('2541','wakaba.nakamura@funtoco.jp'),
      -- 社会福祉法人報恩感謝会 (2542)
      ('2542','ly@funtoco.jp'),
      -- 社会福祉法人敬友会 (2544)
      ('2544','hmone@funtoco.jp'),
      -- 株式会社プラティア (2545)
      ('2545','tra@funtoco.jp'),
      -- 医療法人信和会 (2547)
      ('2547','funtoco.parttime5@gmail.com'),
      ('2547','ina@funtoco.jp'),
      -- 社会福祉法人神戸サルビア福祉会 (2548)
      ('2548','hmone@funtoco.jp'),
      ('2548','tra@funtoco.jp'),
      -- 社会福祉法人はーとらんど (2549)
      ('2549','ly@funtoco.jp'),
      ('2549','tra@funtoco.jp'),
      -- 医療法人社団友愛会 (2550)
      ('2550','hmone@funtoco.jp'),
      ('2550','phyoe@funtoco.jp'),
      ('2550','thet@funtoco.jp'),
      ('2550','tra@funtoco.jp'),
      -- 社会福祉法人地域福祉の会 (2551)
      ('2551','bijay@funtoco.jp'),
      ('2551','may@funtoco.jp'),
      ('2551','phyoe@funtoco.jp'),
      ('2551','wakaba.nakamura@funtoco.jp'),
      -- 社会福祉法人ウエル清光会 (2554)
      ('2554','ly@funtoco.jp'),
      -- 社会福祉法人同和園 (2556)
      ('2556','hmone@funtoco.jp'),
      -- ヤマト株式会社 (2557)
      ('2557','hmone@funtoco.jp'),
      ('2557','sandy@funtoco.jp'),
      -- 社会福祉法人やすらぎ福祉会 (2558)
      ('2558','hmone@funtoco.jp'),
      ('2558','ly@funtoco.jp'),
      ('2558','tra@funtoco.jp'),
      -- 社会福祉法人基弘会 (2559)
      ('2559','funtoco.parttime5@gmail.com'),
      ('2559','reno@funtoco.jp'),
      -- 医療法人社団栄宏会 (2560)
      ('2560','ina@funtoco.jp'),
      -- 社会福祉法人慶生会 (2563)
      ('2563','may@funtoco.jp'),
      ('2563','thet@funtoco.jp'),
      -- 株式会社ナチュラル・ヒーリング・インターナショナル (2564)
      ('2564','hmone@funtoco.jp'),
      ('2564','reno@funtoco.jp'),
      -- 社会福祉法人友朋会 (2565)
      ('2565','bijay@funtoco.jp'),
      ('2565','hmone@funtoco.jp'),
      ('2565','ly@funtoco.jp'),
      ('2565','reno@funtoco.jp'),
      -- 社会福祉法人ヤマト福祉会 (2566)
      ('2566','hmone@funtoco.jp'),
      ('2566','may@funtoco.jp'),
      ('2566','sandy@funtoco.jp'),
      -- 社会福祉法人平成福祉会 (2570)
      ('2570','ina@funtoco.jp'),
      -- 社会福祉法人朋寿会 (2571)
      ('2571','funtoco.parttime5@gmail.com'),
      ('2571','thet@funtoco.jp'),
      ('2571','wakaba.nakamura@funtoco.jp'),
      -- 芦屋セントマリア病院 (2572)
      ('2572','bijay@funtoco.jp'),
      ('2572','thet@funtoco.jp'),
      ('2572','wakaba.nakamura@funtoco.jp'),
      -- 社会福祉法人松輪会 (2573)
      ('2573','chamara@funtoco.jp'),
      ('2573','dishma@funtoco.jp'),
      ('2573','hmone@funtoco.jp'),
      ('2573','ina@funtoco.jp'),
      ('2573','ly@funtoco.jp'),
      ('2573','phyu@funtoco.jp'),
      ('2573','reno@funtoco.jp'),
      -- 社会福祉法人清水福祉会 (2574)
      ('2574','bijay@funtoco.jp'),
      ('2574','gyawa@funtoco.jp'),
      ('2574','hmone@funtoco.jp'),
      ('2574','ina@funtoco.jp'),
      ('2574','ly@funtoco.jp'),
      ('2574','reno@funtoco.jp'),
      ('2574','sandy@funtoco.jp'),
      ('2574','thet@funtoco.jp'),
      ('2574','tra@funtoco.jp'),
      -- 社会福祉法人兼誠福祉会 (2575)
      ('2575','bijay@funtoco.jp'),
      ('2575','dishma@funtoco.jp'),
      ('2575','hmone@funtoco.jp'),
      ('2575','ly@funtoco.jp'),
      ('2575','thet@funtoco.jp'),
      -- 医療法人愛壽会 (2577)
      ('2577','bijay@funtoco.jp'),
      ('2577','may@funtoco.jp'),
      -- 社会福祉法人ライフサポート協会 (2579)
      ('2579','ly@funtoco.jp'),
      ('2579','tra@funtoco.jp'),
      -- 医療法人宝山会 (2580)
      ('2580','ina@funtoco.jp'),
      ('2580','recruiting.yamamoto@funtoco.jp'),
      ('2580','reno@funtoco.jp'),
      ('2580','sandy@funtoco.jp'),
      ('2580','thet@funtoco.jp'),
      ('2580','tra@funtoco.jp'),
      -- 株式会社TRUST Relation (2582)
      ('2582','funtoco.parttime5@gmail.com'),
      -- 一般財団法人信貴山病院 (2583)
      ('2583','ly@funtoco.jp'),
      ('2583','may@funtoco.jp'),
      ('2583','phyu@funtoco.jp'),
      ('2583','reno@funtoco.jp'),
      ('2583','tra@funtoco.jp'),
      ('2583','wakaba.nakamura@funtoco.jp'),
      -- 医療法人養心会 (2584)
      ('2584','ina@funtoco.jp'),
      ('2584','ly@funtoco.jp'),
      ('2584','may@funtoco.jp'),
      ('2584','myu@funtoco.jp'),
      ('2584','reno@funtoco.jp'),
      ('2584','tra@funtoco.jp'),
      -- 株式会社cup bearer (2649)
      ('2649','dishma@funtoco.jp'),
      -- 株式会社ハーリア (2651)
      ('2651','phyoe@funtoco.jp'),
      ('2651','thet@funtoco.jp'),
      -- 医療法人西中医学会 (2782)
      ('2782','ina@funtoco.jp'),
      ('2782','ly@funtoco.jp'),
      -- 社会福祉法人宝成会 (2814)
      ('2814','funtoco.parttime5@gmail.com'),
      ('2814','ina@funtoco.jp'),
      ('2814','reno@funtoco.jp'),
      -- 社会福祉法人神戸福生会 (2821)
      ('2821','hmone@funtoco.jp'),
      -- 株式会社美咲ケアサービス (2831)
      ('2831','tra@funtoco.jp'),
      -- 社会福祉法人みずほ (2858)
      ('2858','hlaing@funtoco.jp'),
      ('2858','phyu@funtoco.jp'),
      -- 社会福祉法人牧ノ原やまばと学園 (2898)
      ('2898','may@funtoco.jp'),
      -- 医療法人渋藤医院 (2903)
      ('2903','hmone@funtoco.jp'),
      -- 医療法人清和会 (2915)
      ('2915','sandy@funtoco.jp'),
      -- 株式会社DimDimSum Japan (2947)
      ('2947','ly@funtoco.jp'),
      -- 株式会社杉村八島 (2950)
      ('2950','phyoe@funtoco.jp'),
      ('2950','sushant@funtoco.jp'),
      -- 医療法人雄信会 (2952)
      ('2952','ina@funtoco.jp'),
      -- 社会福祉法人山中福祉会 (3007)
      ('3007','phyu@funtoco.jp'),
      -- 株式会社ピグマリオン (3019)
      ('3019','phyu@funtoco.jp'),
      -- 株式会社松林 (3069)
      ('3069','bijay@funtoco.jp'),
      -- 社会福祉法人健寿会 (3073)
      ('3073','may@funtoco.jp'),
      -- 株式会社GRACE TERRA (3119)
      ('3119','ryoji.nagao@funtoco.jp'),
      ('3119','yusuke.onobayashi@funtoco.jp'),
      -- 医療法人藤井会 (3124)
      ('3124','hmone@funtoco.jp'),
      -- 株式会社龍香 (3126)
      ('3126','bijay@funtoco.jp'),
      ('3126','sushant@funtoco.jp'),
      -- 千房ホールディングス株式会社 (3133)
      ('3133','myu@funtoco.jp'),
      ('3133','sushant@funtoco.jp'),
      -- 医療法人大慶会 (3148)
      ('3148','thet@funtoco.jp'),
      -- 社会福祉法人愛生会 (3150)
      ('3150','may@funtoco.jp'),
      -- 社会福祉法人明桜会 (3211)
      ('3211','sandy@funtoco.jp'),
      -- 医療法人和仁会 (3412)
      ('3412','myu@funtoco.jp'),
      -- 有限会社アユム (3426)
      ('3426','reno@funtoco.jp'),
      -- 株式会社KMフードシステム (3431)
      ('3431','bijay@funtoco.jp'),
      -- 社会福祉法人双和福祉会 (3463)
      ('3463','hmone@funtoco.jp'),
      -- グローバル人材育成株式会社 (3520)
      ('3520','sandy@funtoco.jp'),
      -- 社会福祉法人長瀞福祉会 (3567)
      ('3567','phyu@funtoco.jp'),
      -- 社会福祉法人槇の里 (3583)
      ('3583','may@funtoco.jp'),
      -- 医療法人至誠会 (3608)
      ('3608','myu@funtoco.jp'),
      -- 医療法人財団朔望会 (3790)
      ('3790','reno@funtoco.jp'),
      -- 株式会社アール・ケア (3793)
      ('3793','sandy@funtoco.jp'),
      -- 社会福祉法人共生会 (4580)
      ('4580','phyu@funtoco.jp'),
      -- 株式会社であい (5341)
      ('5341','phyu@funtoco.jp'),
      -- 株式会社六匠 (5370)
      ('5370','thet@funtoco.jp'),
      -- 株式会社角濱総本舗 (5483)
      ('5483','bijay@funtoco.jp'),
      -- 株式会社安楽亭 (5544)
      ('5544','yusuke.onobayashi@funtoco.jp'),
      -- 株式会社あじみ屋 (5580)
      ('5580','sushant@funtoco.jp'),
      -- バルニバービ・スピリッツ＆カンパニー株式会社 (5647)
      ('5647','bijay@funtoco.jp'),
      ('5647','myu@funtoco.jp'),
      -- 飯泉智史 (5661)
      ('5661','phyu@funtoco.jp'),
      -- 社会福祉法人輝陽樹会 (17243)
      ('17243','reno@funtoco.jp'),
      -- 株式会社香川 (17400)
      ('17400','myu@funtoco.jp'),
      -- 合資会社リカバリー (17427)
      ('17427','reno@funtoco.jp'),
      -- 株式会社NKYコーポレーション (17436)
      ('17436','myu@funtoco.jp'),
      -- 有限会社シシコム (17452)
      ('17452','reno@funtoco.jp'),
      -- 医療法人縁和会 (17457)
      ('17457','bijay@funtoco.jp'),
      ('17457','thet@funtoco.jp'),
      -- 株式会社Ringwith (17589)
      ('17589','phyu@funtoco.jp'),
      -- 社会福祉法人宮田福祉会 (17619)
      ('17619','myu@funtoco.jp'),
      -- NTL株式会社 (17954)
      ('17954','ina@funtoco.jp'),
      -- 医療法人社団敬穏会 (18728)
      ('18728','thet@funtoco.jp'),
      -- 南勢病院 (18847)
      ('18847','hmone@funtoco.jp'),
      -- 社会福祉法人プレマ会 (19507)
      ('19507','reno@funtoco.jp'),
      -- 医療法人二之沢会 (20511)
      ('20511','phyu@funtoco.jp'),
      -- 株式会社サンテ (20782)
      ('20782','hmone@funtoco.jp')
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

    -- この tenant は supporter が解決できたので owner 削除対象に含める。
    v_supporter_tenants := array_append(v_supporter_tenants, v_tenant_id);

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

  -- supporter が1名以上ついた tenant から、PR#81 仮置きの owner を外す。
  -- (v_supporter_tenants は対象214社の tenant のみ。supporter が0の社は owner を残す。)
  if v_owner_id is null then
    raise notice 'owner % が auth.users に見つからないため owner 削除はスキップしました。', 'tomoaki.nishimura@funtoco.jp';
  else
    delete from public.user_tenants
    where user_id = v_owner_id and role = 'owner' and tenant_id = any(v_supporter_tenants);
    get diagnostics v_owner_removed = row_count;
  end if;

  raise notice 'FunEdu supporters: linked=%, dup_skipped=%, no_tenant=%, no_user(skipped)=%, owner_removed=%',
    v_linked, v_dup, v_no_tenant, v_no_user, v_owner_removed;
  if array_length(v_missing, 1) is not null then
    raise notice 'Missing support staff (no auth.users, % 名): %', array_length(v_missing, 1), array_to_string(v_missing, ', ');
  end if;
end $oneshot$;
