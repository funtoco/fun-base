-- FunEdu 支援担当を member ロールで紐付け直す（ワンショット / 手動実行用）— issue funtoco/fun-docs#776
--
-- ※ これは migration ではありません。本番DBに対して psql / Supabase SQL Editor から
--    「1回だけ」手動実行する想定のスクリプトです。冪等なので再実行可。
--
-- 背景:
--   当初 PR#82(214社) / PR#84(116社) は支援担当を role='supporter' で紐付けたが、
--   supporter は FunBase の全UI(メンバー管理 getTenantMembers 等)で除外され不可視だった。
--   実運用では支援担当は member ロールで各テナントに入っている(例: bijay/reno)。
--   よって supporter 行を削除し、member ロールで入れ直す。
--
-- 対象: PR#81新規214社 + 既存116社 = 全308社（本番の現テナント slug=COID）。
--   kintone 就労app(13) supportUser を集約した既存2ファイルの (COID,email) を統合（生成日: 2026-05-27）。
--
-- 処理（(COID,email) ごと）:
--   1) 私たちが入れた supporter 行 (user,tenant,role='supporter') を削除。
--   2) その user が当該 tenant に表示ロール(owner/admin/member/guest)を持たなければ member を追加。
--      既に owner/admin/member/guest を持つ場合は何もしない（bijay/reno のような既存memberは重複追加しない）。
--   - tenant 未一致(slug) / 支援担当が auth.users 未登録 はスキップし NOTICE 集計。
--   - owner は触らない（PR#81 仮置きの owner 外しは PR#82 で実施済み。本SQLは support staff のみ）。
--   - 注意: ここで削除する supporter は本リストの (COID,email) に限定。無関係なテスト supporter 行は触らない。
--
-- 集計（生成時点）:
--   対象社: 308 / (COID,email) ペア(統合後): 581 / distinct 支援担当: 24
--
-- 実行:
--   begin;
--   \i scripts/link-funedu-support-staff-as-member.sql
--   -- NOTICE: supporter_deleted=.., member_added=.., already_visible=.., no_tenant=.., no_user(skipped)=.. を確認
--   commit;

do $oneshot$
declare
  rec                 record;
  v_tenant_id         uuid;
  v_user_id           uuid;
  v_del               int;
  v_supporter_deleted int := 0;
  v_member_added      int := 0;
  v_already_visible   int := 0;
  v_no_tenant         int := 0;
  v_no_user           int := 0;
  v_missing           text[] := '{}';
begin
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
      -- 株式会社MRホールディングス (1534)
      ('1534','bijay@funtoco.jp'),
      ('1534','myu@funtoco.jp'),
      -- 株式会社食道園 (1535)
      ('1535','bijay@funtoco.jp'),
      -- 藏ウェルフェアサービス株式会社 (1537)
      ('1537','thet@funtoco.jp'),
      -- 株式会社グルーヴ (1541)
      ('1541','bijay@funtoco.jp'),
      -- 大真実業株式会社 (1549)
      ('1549','thet@funtoco.jp'),
      -- 有限会社トラストプロパティサービス (1553)
      ('1553','bijay@funtoco.jp'),
      ('1553','dishma@funtoco.jp'),
      -- 株式会社TWレストランツ (1554)
      ('1554','bijay@funtoco.jp'),
      -- 株式会社ダンシンダイナー (1556)
      ('1556','bijay@funtoco.jp'),
      ('1556','ly@funtoco.jp'),
      ('1556','yusuke.onobayashi@funtoco.jp'),
      -- 有限会社キリムラ (1558)
      ('1558','bijay@funtoco.jp'),
      ('1558','dishma@funtoco.jp'),
      -- 株式会社ファイブスター (1563)
      ('1563','phyoe@funtoco.jp'),
      ('1563','sushant@funtoco.jp'),
      -- 株式会社ゴリップ (1566)
      ('1566','bijay@funtoco.jp'),
      -- 株式会社HASSIN (1610)
      ('1610','bijay@funtoco.jp'),
      -- 太閤折詰株式会社 (1611)
      ('1611','gyawa@funtoco.jp'),
      ('1611','myu@funtoco.jp'),
      ('1611','sushant@funtoco.jp'),
      -- 株式会社ロン (1613)
      ('1613','bijay@funtoco.jp'),
      -- 株式会社レストラン・シャンソニエ (1615)
      ('1615','wakaba.nakamura@funtoco.jp'),
      -- 株式会社ファイブイデアル (1616)
      ('1616','phyu@funtoco.jp'),
      ('1616','yusuke.onobayashi@funtoco.jp'),
      -- 株式会社HY料理研究所 (1624)
      ('1624','wakaba.nakamura@funtoco.jp'),
      -- 株式会社ケー・エキスプレス (1627)
      ('1627','ina@funtoco.jp'),
      ('1627','ly@funtoco.jp'),
      ('1627','reno@funtoco.jp'),
      ('1627','sushant@funtoco.jp'),
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
      -- 社会福祉法人ジェイエー長野会 (1700)
      ('1700','phyoe@funtoco.jp'),
      -- 社会福祉法人盡誠会 (1722)
      ('1722','may@funtoco.jp'),
      -- 医療法人千里厚生会 (1744)
      ('1744','phyu@funtoco.jp'),
      -- 医療法人杏林会 (1755)
      ('1755','hmone@funtoco.jp'),
      ('1755','phyu@funtoco.jp'),
      ('1755','reno@funtoco.jp'),
      ('1755','thet@funtoco.jp'),
      -- 社会福祉法人五和会 (1763)
      ('1763','may@funtoco.jp'),
      -- 医療法人社団青藍会 (1771)
      ('1771','phyoe@funtoco.jp'),
      -- 医療法人社団恵宣会 (1775)
      ('1775','phyoe@funtoco.jp'),
      -- 社会福祉法人清風会 (1801)
      ('1801','phyu@funtoco.jp'),
      -- 社会福祉法人織舩会 (1817)
      ('1817','phyu@funtoco.jp'),
      -- 社会福祉法人九曜会 (1879)
      ('1879','may@funtoco.jp'),
      -- 医療法人中馬医療財団 (1901)
      ('1901','ina@funtoco.jp'),
      ('1901','sushant@funtoco.jp'),
      ('1901','thet@funtoco.jp'),
      -- 社会福祉法人永春会 (1912)
      ('1912','chamara@funtoco.jp'),
      ('1912','reno@funtoco.jp'),
      -- 社会福祉法人清幸会 (1920)
      ('1920','phyu@funtoco.jp'),
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
      -- 社会福祉法人光正会 (1962)
      ('1962','chamara@funtoco.jp'),
      ('1962','may@funtoco.jp'),
      -- 社会福祉法人けやきの郷 (1966)
      ('1966','phyu@funtoco.jp'),
      ('1966','sushant@funtoco.jp'),
      -- 社会福祉法人青藍会 (1967)
      ('1967','phyoe@funtoco.jp'),
      -- 社会医療法人社団医善会 (1980)
      ('1980','may@funtoco.jp'),
      -- 医療法人昭圭会 (1983)
      ('1983','thet@funtoco.jp'),
      -- 社会医療法人榮昌会 (1984)
      ('1984','thet@funtoco.jp'),
      -- 医療法人篤友会 (1989)
      ('1989','phyu@funtoco.jp'),
      ('1989','thuthu@funtoco.jp'),
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
      -- 医療法人社団康生会 (2017)
      ('2017','may@funtoco.jp'),
      ('2017','reno@funtoco.jp'),
      -- 社会福祉法人康和会 (2018)
      ('2018','may@funtoco.jp'),
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
      -- 社会福祉法人弥光会 (2037)
      ('2037','myu@funtoco.jp'),
      -- 株式会社愛誠会 (2055)
      ('2055','phyu@funtoco.jp'),
      ('2055','reno@funtoco.jp'),
      ('2055','thuthu@funtoco.jp'),
      -- 社会福祉法人都心会 (2056)
      ('2056','may@funtoco.jp'),
      ('2056','thet@funtoco.jp'),
      -- 医療法人西口整形外科 (2060)
      ('2060','hmone@funtoco.jp'),
      ('2060','ina@funtoco.jp'),
      ('2060','phyu@funtoco.jp'),
      ('2060','reno@funtoco.jp'),
      -- 社会福祉法人日本傷痍者更生会 (2065)
      ('2065','ly@funtoco.jp'),
      ('2065','myu@funtoco.jp'),
      -- 社会医療法人社団三草会 (2080)
      ('2080','thet@funtoco.jp'),
      -- 医療法人財団湖聖会 (2083)
      ('2083','may@funtoco.jp'),
      -- 医療法人社団水澄み会 (2085)
      ('2085','hmone@funtoco.jp'),
      ('2085','reno@funtoco.jp'),
      -- 社会福祉法人立石会 (2090)
      ('2090','thet@funtoco.jp'),
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
      -- 社会福祉法人豊生会 (2130)
      ('2130','myu@funtoco.jp'),
      -- 社会福祉法人なずな (2137)
      ('2137','phyoe@funtoco.jp'),
      -- 株式会社ゆかりの里苑 (2138)
      ('2138','funtoco.parttime5@gmail.com'),
      -- 社会福祉法人室生会 (2143)
      ('2143','ina@funtoco.jp'),
      ('2143','myu@funtoco.jp'),
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
      -- 社会福祉法人徳和会 (2200)
      ('2200','ly@funtoco.jp'),
      ('2200','sandy@funtoco.jp'),
      ('2200','thet@funtoco.jp'),
      -- 医療法人社団藤友五幸会 (2202)
      ('2202','reno@funtoco.jp'),
      -- 医療法人社団清春会 (2207)
      ('2207','hmone@funtoco.jp'),
      ('2207','sandy@funtoco.jp'),
      ('2207','tra@funtoco.jp'),
      ('2207','wakaba.nakamura@funtoco.jp'),
      -- 社会福祉法人賛育会 (2208)
      ('2208','may@funtoco.jp'),
      -- 有限会社エムツーコーポレーション (2216)
      ('2216','thet@funtoco.jp'),
      -- 社会福祉法人黎明会 (2219)
      ('2219','hmone@funtoco.jp'),
      -- 社会福祉法人西山福祉会 (2222)
      ('2222','hmone@funtoco.jp'),
      -- 社会福祉法人檸檬 (2264)
      ('2264','reno@funtoco.jp'),
      -- 医療法人財団暁 (2268)
      ('2268','may@funtoco.jp'),
      ('2268','phyoe@funtoco.jp'),
      -- 社会福祉法人慈恩会 (2300)
      ('2300','myu@funtoco.jp'),
      -- 社会福祉法人知多学園 (2374)
      ('2374','hmone@funtoco.jp'),
      ('2374','phyu@funtoco.jp'),
      -- 医療法人曙会 (2378)
      ('2378','may@funtoco.jp'),
      ('2378','myu@funtoco.jp'),
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
      -- 社会福祉法人白寿会 (2421)
      ('2421','phyoe@funtoco.jp'),
      ('2421','reno@funtoco.jp'),
      -- 株式会社nagomi (2439)
      ('2439','thet@funtoco.jp'),
      -- 社会福祉法人石心福祉会 (2453)
      ('2453','ina@funtoco.jp'),
      -- 株式会社日本介護医療センター (2484)
      ('2484','sushant@funtoco.jp'),
      -- 社会福祉法人三秀會 (2489)
      ('2489','funtoco.parttime5@gmail.com'),
      ('2489','ina@funtoco.jp'),
      -- 社会福祉法人尚栄会 (2495)
      ('2495','phyu@funtoco.jp'),
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
      -- 社会福祉法人愛港福祉会 (2530)
      ('2530','chamara@funtoco.jp'),
      ('2530','hmone@funtoco.jp'),
      ('2530','ina@funtoco.jp'),
      ('2530','reno@funtoco.jp'),
      -- 社会福祉法人道徳福祉会 (2531)
      ('2531','hmone@funtoco.jp'),
      ('2531','reno@funtoco.jp'),
      ('2531','thet@funtoco.jp'),
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
      -- 医療法人社団翠会 (2537)
      ('2537','hlaing@funtoco.jp'),
      ('2537','hmone@funtoco.jp'),
      ('2537','myu@funtoco.jp'),
      ('2537','phyoe@funtoco.jp'),
      ('2537','phyu@funtoco.jp'),
      ('2537','reno@funtoco.jp'),
      ('2537','sandy@funtoco.jp'),
      ('2537','thuthu@funtoco.jp'),
      -- 社会福祉法人ききょう会 (2538)
      ('2538','ina@funtoco.jp'),
      -- 社会福祉法人翠生会 (2539)
      ('2539','hmone@funtoco.jp'),
      -- 社会福祉法人恵生会 (2541)
      ('2541','thet@funtoco.jp'),
      ('2541','wakaba.nakamura@funtoco.jp'),
      -- 社会福祉法人報恩感謝会 (2542)
      ('2542','ly@funtoco.jp'),
      -- 医療法人相生会 (2543)
      ('2543','ina@funtoco.jp'),
      ('2543','reno@funtoco.jp'),
      ('2543','sushant@funtoco.jp'),
      ('2543','wakaba.nakamura@funtoco.jp'),
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
      -- 医療法人社団慈誠会 (2552)
      ('2552','bijay@funtoco.jp'),
      ('2552','dishma@funtoco.jp'),
      ('2552','hmone@funtoco.jp'),
      ('2552','may@funtoco.jp'),
      ('2552','phyoe@funtoco.jp'),
      ('2552','reno@funtoco.jp'),
      ('2552','ryoji.nagao@funtoco.jp'),
      ('2552','thuthu@funtoco.jp'),
      ('2552','yusuke.onobayashi@funtoco.jp'),
      -- 社会福祉法人一会 (2553)
      ('2553','bijay@funtoco.jp'),
      ('2553','dishma@funtoco.jp'),
      ('2553','funtoco.parttime5@gmail.com'),
      ('2553','hmone@funtoco.jp'),
      ('2553','ina@funtoco.jp'),
      ('2553','phyoe@funtoco.jp'),
      ('2553','reno@funtoco.jp'),
      ('2553','tra@funtoco.jp'),
      -- 社会福祉法人ウエル清光会 (2554)
      ('2554','ly@funtoco.jp'),
      -- 社会福祉法人共和福祉会 (2555)
      ('2555','ly@funtoco.jp'),
      ('2555','thet@funtoco.jp'),
      ('2555','tra@funtoco.jp'),
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
      -- 社会福祉法人弘仁会 (2562)
      ('2562','hmone@funtoco.jp'),
      ('2562','ina@funtoco.jp'),
      ('2562','thet@funtoco.jp'),
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
      -- 社会福祉法人いずみ会 (2569)
      ('2569','bijay@funtoco.jp'),
      ('2569','dishma@funtoco.jp'),
      ('2569','funtoco.parttime5@gmail.com'),
      ('2569','hmone@funtoco.jp'),
      ('2569','ina@funtoco.jp'),
      ('2569','phyoe@funtoco.jp'),
      ('2569','reno@funtoco.jp'),
      ('2569','sushant@funtoco.jp'),
      ('2569','tra@funtoco.jp'),
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
      -- 株式会社美咲 (2578)
      ('2578','bijay@funtoco.jp'),
      ('2578','funtoco.parttime5@gmail.com'),
      ('2578','hmone@funtoco.jp'),
      ('2578','ina@funtoco.jp'),
      ('2578','ly@funtoco.jp'),
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
      -- 社会福祉法人清光会 (2581)
      ('2581','hmone@funtoco.jp'),
      ('2581','ina@funtoco.jp'),
      ('2581','phyu@funtoco.jp'),
      ('2581','sandy@funtoco.jp'),
      ('2581','tra@funtoco.jp'),
      ('2581','wakaba.nakamura@funtoco.jp'),
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
      -- 社会福祉法人神港園 (2585)
      ('2585','hmone@funtoco.jp'),
      ('2585','ly@funtoco.jp'),
      ('2585','may@funtoco.jp'),
      ('2585','recruiting.yamamoto@funtoco.jp'),
      ('2585','thet@funtoco.jp'),
      ('2585','tra@funtoco.jp'),
      -- 株式会社cup bearer (2649)
      ('2649','dishma@funtoco.jp'),
      -- 株式会社ハーリア (2651)
      ('2651','phyoe@funtoco.jp'),
      ('2651','thet@funtoco.jp'),
      -- 株式会社トラストビジョン (2667)
      ('2667','bijay@funtoco.jp'),
      -- 株式会社バルニバービコンシスタンス (2671)
      ('2671','bijay@funtoco.jp'),
      -- 医療法人北斗大洋会 (2705)
      ('2705','myu@funtoco.jp'),
      -- 医療法人公仁会 (2720)
      ('2720','thet@funtoco.jp'),
      -- 社会福祉法人優喜会 (2727)
      ('2727','thet@funtoco.jp'),
      -- 医療法人健佑会 (2770)
      ('2770','myu@funtoco.jp'),
      -- 医療法人西中医学会 (2782)
      ('2782','ina@funtoco.jp'),
      ('2782','ly@funtoco.jp'),
      -- 社会福祉法人熱海いでゆの園 (2783)
      ('2783','chamara@funtoco.jp'),
      ('2783','may@funtoco.jp'),
      -- 柏原マルタマフーズ株式会社 (2787)
      ('2787','bijay@funtoco.jp'),
      ('2787','chamara@funtoco.jp'),
      ('2787','dishma@funtoco.jp'),
      ('2787','gyawa@funtoco.jp'),
      ('2787','ly@funtoco.jp'),
      ('2787','myu@funtoco.jp'),
      ('2787','phyoe@funtoco.jp'),
      ('2787','sushant@funtoco.jp'),
      -- 社会福祉法人宝成会 (2814)
      ('2814','funtoco.parttime5@gmail.com'),
      ('2814','ina@funtoco.jp'),
      ('2814','reno@funtoco.jp'),
      -- 社会福祉法人神戸福生会 (2821)
      ('2821','hmone@funtoco.jp'),
      -- 株式会社美咲ケアサービス (2831)
      ('2831','tra@funtoco.jp'),
      -- 社会福祉法人わらしな福祉会 (2846)
      ('2846','may@funtoco.jp'),
      -- 社会福祉法人みずほ (2858)
      ('2858','hlaing@funtoco.jp'),
      ('2858','phyu@funtoco.jp'),
      -- 社会福祉法人牧ノ原やまばと学園 (2898)
      ('2898','may@funtoco.jp'),
      -- 医療法人渋藤医院 (2903)
      ('2903','hmone@funtoco.jp'),
      -- 和泉マルタマフーズ株式会社 (2914)
      ('2914','gyawa@funtoco.jp'),
      ('2914','myu@funtoco.jp'),
      ('2914','phyoe@funtoco.jp'),
      ('2914','sushant@funtoco.jp'),
      -- 医療法人清和会 (2915)
      ('2915','sandy@funtoco.jp'),
      -- 医療法人馨仁会 (2924)
      ('2924','phyu@funtoco.jp'),
      ('2924','sandy@funtoco.jp'),
      ('2924','sushant@funtoco.jp'),
      -- 医療法人橋本病院 (2932)
      ('2932','myu@funtoco.jp'),
      -- 株式会社DimDimSum Japan (2947)
      ('2947','ly@funtoco.jp'),
      -- 株式会社杉村八島 (2950)
      ('2950','phyoe@funtoco.jp'),
      ('2950','sushant@funtoco.jp'),
      -- 医療法人雄信会 (2952)
      ('2952','ina@funtoco.jp'),
      -- 社会福祉法人燦愛会 (2955)
      ('2955','ina@funtoco.jp'),
      -- 社会福祉法人杉の子 (2972)
      ('2972','reno@funtoco.jp'),
      -- 東住吉中央マルタマフーズ株式会社 (2991)
      ('2991','gyawa@funtoco.jp'),
      ('2991','may@funtoco.jp'),
      ('2991','myu@funtoco.jp'),
      ('2991','phyoe@funtoco.jp'),
      -- 東住吉マルタマフーズ株式会社 (2992)
      ('2992','gyawa@funtoco.jp'),
      ('2992','phyoe@funtoco.jp'),
      -- 社会福祉法人山中福祉会 (3007)
      ('3007','phyu@funtoco.jp'),
      -- 株式会社ピグマリオン (3019)
      ('3019','phyu@funtoco.jp'),
      -- 医療法人清風会 (3032)
      ('3032','ly@funtoco.jp'),
      ('3032','may@funtoco.jp'),
      ('3032','phyoe@funtoco.jp'),
      ('3032','phyu@funtoco.jp'),
      -- 医療法人清仁会 (3043)
      ('3043','phyu@funtoco.jp'),
      -- 株式会社松林 (3069)
      ('3069','bijay@funtoco.jp'),
      -- 社会福祉法人健寿会 (3073)
      ('3073','may@funtoco.jp'),
      -- 株式会社グッドライフケア東京 (3090)
      ('3090','bijay@funtoco.jp'),
      ('3090','may@funtoco.jp'),
      ('3090','reno@funtoco.jp'),
      -- 株式会社べるびゅー大栄 (3100)
      ('3100','thet@funtoco.jp'),
      -- 社会福祉法人大地の会 (3115)
      ('3115','phyu@funtoco.jp'),
      -- 株式会社GRACE TERRA (3119)
      ('3119','ryoji.nagao@funtoco.jp'),
      ('3119','yusuke.onobayashi@funtoco.jp'),
      -- 医療法人藤井会 (3124)
      ('3124','hmone@funtoco.jp'),
      -- 株式会社龍香 (3126)
      ('3126','bijay@funtoco.jp'),
      ('3126','sushant@funtoco.jp'),
      -- 社会福祉法人敬生会 (3132)
      ('3132','ly@funtoco.jp'),
      ('3132','may@funtoco.jp'),
      ('3132','myu@funtoco.jp'),
      -- 千房ホールディングス株式会社 (3133)
      ('3133','myu@funtoco.jp'),
      ('3133','sushant@funtoco.jp'),
      -- 医療法人大慶会 (3148)
      ('3148','thet@funtoco.jp'),
      -- 社会福祉法人愛生会 (3150)
      ('3150','may@funtoco.jp'),
      -- 株式会社ウィーズ (3153)
      ('3153','thet@funtoco.jp'),
      -- 株式会社ラフィン・ハーツ (3194)
      ('3194','thet@funtoco.jp'),
      -- 社会福祉法人村山苑 (3200)
      ('3200','phyu@funtoco.jp'),
      -- 社会福祉法人明桜会 (3211)
      ('3211','sandy@funtoco.jp'),
      -- 滋賀マルタマフーズ株式会社 (3222)
      ('3222','gyawa@funtoco.jp'),
      ('3222','phyoe@funtoco.jp'),
      -- 京都マルタマフーズ株式会社 (3223)
      ('3223','myu@funtoco.jp'),
      -- 社会福祉法人清和園 (3240)
      ('3240','may@funtoco.jp'),
      -- 社会福祉法人虹の会 (3260)
      ('3260','phyoe@funtoco.jp'),
      -- 社会福祉法人静和会 (3303)
      ('3303','phyoe@funtoco.jp'),
      -- 社会福祉法人赤碕福祉会 (3324)
      ('3324','thet@funtoco.jp'),
      -- 社会福祉法人明徳会 (3336)
      ('3336','myu@funtoco.jp'),
      -- 社会福祉法人東輝会 (3401)
      ('3401','ina@funtoco.jp'),
      -- 医療法人和仁会 (3412)
      ('3412','myu@funtoco.jp'),
      -- 特定医療法人旭会 (3419)
      ('3419','myu@funtoco.jp'),
      -- 有限会社アユム (3426)
      ('3426','reno@funtoco.jp'),
      -- 株式会社KMフードシステム (3431)
      ('3431','bijay@funtoco.jp'),
      -- 社会福祉法人双和福祉会 (3463)
      ('3463','hmone@funtoco.jp'),
      -- 社会福祉法人友愛会 (3485)
      ('3485','phyoe@funtoco.jp'),
      ('3485','reno@funtoco.jp'),
      -- グローバル人材育成株式会社 (3520)
      ('3520','sandy@funtoco.jp'),
      -- 社会福祉法人長瀞福祉会 (3567)
      ('3567','phyu@funtoco.jp'),
      -- 社会福祉法人槇の里 (3583)
      ('3583','may@funtoco.jp'),
      -- 医療法人至誠会 (3608)
      ('3608','myu@funtoco.jp'),
      -- 医療法人社団アスカ (3617)
      ('3617','phyoe@funtoco.jp'),
      -- 社会福祉法人富山市桜谷福祉会 (3652)
      ('3652','phyoe@funtoco.jp'),
      -- 医療法人弘善会 (3744)
      ('3744','thet@funtoco.jp'),
      -- 株式会社幸寿苑 (3745)
      ('3745','ina@funtoco.jp'),
      ('3745','thet@funtoco.jp'),
      -- 有限会社間柴メディカルサービス (3752)
      ('3752','phyu@funtoco.jp'),
      -- 四日市マルタマフーズ株式会社 (3771)
      ('3771','gyawa@funtoco.jp'),
      ('3771','phyoe@funtoco.jp'),
      ('3771','sushant@funtoco.jp'),
      -- 医療法人財団朔望会 (3790)
      ('3790','reno@funtoco.jp'),
      -- 株式会社アール・ケア (3793)
      ('3793','sandy@funtoco.jp'),
      -- 社会福祉法人愛育会 (4561)
      ('4561','thet@funtoco.jp'),
      -- 社会福祉法人共生会 (4580)
      ('4580','phyu@funtoco.jp'),
      -- 株式会社であい (5341)
      ('5341','phyu@funtoco.jp'),
      -- 株式会社六匠 (5370)
      ('5370','thet@funtoco.jp'),
      -- 株式会社sweet honeybee (5423)
      ('5423','may@funtoco.jp'),
      -- 株式会社エイムキュア (5474)
      ('5474','thet@funtoco.jp'),
      -- 株式会社角濱総本舗 (5483)
      ('5483','bijay@funtoco.jp'),
      -- 社会福祉法人小田・後月三友会 (5487)
      ('5487','phyoe@funtoco.jp'),
      -- 医療法人新正会 (5518)
      ('5518','phyu@funtoco.jp'),
      -- 医療法人愛善会 (5521)
      ('5521','ina@funtoco.jp'),
      -- 株式会社安楽亭 (5544)
      ('5544','yusuke.onobayashi@funtoco.jp'),
      -- 株式会社あじみ屋 (5580)
      ('5580','sushant@funtoco.jp'),
      -- 医療法人豊生会 (5582)
      ('5582','myu@funtoco.jp'),
      -- 社会福祉法人すさみ福祉会 (5616)
      ('5616','myu@funtoco.jp'),
      -- 株式会社サンプラス (5629)
      ('5629','reno@funtoco.jp'),
      -- 医療法人社団久遠会 (5645)
      ('5645','reno@funtoco.jp'),
      -- バルニバービ・スピリッツ＆カンパニー株式会社 (5647)
      ('5647','bijay@funtoco.jp'),
      ('5647','myu@funtoco.jp'),
      -- 飯泉智史 (5661)
      ('5661','phyu@funtoco.jp'),
      -- 倉敷医療生活協同組合 (17156)
      ('17156','ina@funtoco.jp'),
      -- 株式会社紀和味善 (17190)
      ('17190','sushant@funtoco.jp'),
      -- 社会福祉法人福寿会 (17195)
      ('17195','bijay@funtoco.jp'),
      -- 社会福祉法人輝陽樹会 (17243)
      ('17243','reno@funtoco.jp'),
      -- 社会福祉法人翼会 (17347)
      ('17347','reno@funtoco.jp'),
      -- 医療法人敬寿会 (17399)
      ('17399','ina@funtoco.jp'),
      -- 株式会社香川 (17400)
      ('17400','myu@funtoco.jp'),
      -- 合資会社リカバリー (17427)
      ('17427','reno@funtoco.jp'),
      -- 社会福祉法人幸会 (17434)
      ('17434','reno@funtoco.jp'),
      -- 株式会社NKYコーポレーション (17436)
      ('17436','myu@funtoco.jp'),
      -- 有限会社シシコム (17452)
      ('17452','reno@funtoco.jp'),
      -- 医療法人縁和会 (17457)
      ('17457','bijay@funtoco.jp'),
      ('17457','thet@funtoco.jp'),
      -- 株式会社マルタマフーズ (17460)
      ('17460','gyawa@funtoco.jp'),
      -- 株式会社Ringwith (17589)
      ('17589','phyu@funtoco.jp'),
      -- 社会福祉法人三草会 (17614)
      ('17614','thet@funtoco.jp'),
      -- 株式会社シー・オー・エム (17618)
      ('17618','phyoe@funtoco.jp'),
      ('17618','sushant@funtoco.jp'),
      -- 社会福祉法人宮田福祉会 (17619)
      ('17619','myu@funtoco.jp'),
      -- 医療法人社団いなみ会 (17648)
      ('17648','thet@funtoco.jp'),
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
    select id into v_tenant_id from public.tenants where slug = rec.company_id;
    if v_tenant_id is null then
      v_no_tenant := v_no_tenant + 1;
      continue;
    end if;

    select id into v_user_id from auth.users where lower(email) = lower(rec.email);
    if v_user_id is null then
      v_no_user := v_no_user + 1;
      if not (rec.email = any(v_missing)) then
        v_missing := array_append(v_missing, rec.email);
      end if;
      continue;
    end if;

    -- 1) 私たちが入れた supporter 行を削除（冪等）
    delete from public.user_tenants
      where user_id = v_user_id and tenant_id = v_tenant_id and role = 'supporter';
    get diagnostics v_del = row_count;
    v_supporter_deleted := v_supporter_deleted + v_del;

    -- 2) 表示ロールが無ければ member を追加（既に owner/admin/member/guest があれば何もしない）
    if exists (
      select 1 from public.user_tenants
      where user_id = v_user_id and tenant_id = v_tenant_id
        and role in ('owner','admin','member','guest')
    ) then
      v_already_visible := v_already_visible + 1;
    else
      insert into public.user_tenants (user_id, tenant_id, email, role, status, joined_at)
      values (v_user_id, v_tenant_id, rec.email, 'member', 'active', now());
      v_member_added := v_member_added + 1;
    end if;
  end loop;

  raise notice 'FunEdu support-staff as member: supporter_deleted=%, member_added=%, already_visible=%, no_tenant=%, no_user(skipped)=%',
    v_supporter_deleted, v_member_added, v_already_visible, v_no_tenant, v_no_user;
  if array_length(v_missing, 1) is not null then
    raise notice 'Missing support staff (no auth.users, % 名): %', array_length(v_missing, 1), array_to_string(v_missing, ', ');
  end if;
end $oneshot$;
