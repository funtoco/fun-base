-- FunBase regular interview cleanup for the initial 100 companies.
--
-- Purpose:
--   Remove already-synced regular interview rows that are outside the release scope.
--   Regular interviews before 2026-04-01 are not considered ready for company-facing
--   FunBase release.
--
-- Safety:
--   1. Run as-is first. It ends with rollback, so no data is changed.
--   2. Confirm candidate_count and sample rows.
--   3. Change the final rollback to commit only after the count is approved.

begin;

with target_tenants(slug) as (
  values
    ('2553'), ('2537'), ('1563'), ('2671'), ('2143'), ('2562'), ('17156'),
    ('5521'), ('3324'), ('3744'), ('3485'), ('3303'), ('3745'), ('2484'),
    ('1700'), ('2569'), ('1771'), ('1967'), ('2770'), ('1627'), ('1611'),
    ('2200'), ('2581'), ('3153'), ('3100'), ('2090'), ('1775'), ('5487'),
    ('3336'), ('4561'), ('3032'), ('1801'), ('1755'), ('1962'), ('1901'),
    ('3240'), ('1534'), ('17618'), ('2720'), ('2207'), ('17648'), ('2585'),
    ('2955'), ('1817'), ('2080'), ('17614'), ('1912'), ('2056'), ('2017'),
    ('17190'), ('2378'), ('17195'), ('3752'), ('1966'), ('17399'), ('3419'),
    ('2932'), ('2705'), ('5616'), ('2578'), ('2018'), ('17434'), ('5645'),
    ('5518'), ('2727'), ('3260'), ('2543'), ('3401'), ('3132'), ('2555'),
    ('5474'), ('2530'), ('2060'), ('3043'), ('2783'), ('2421'), ('2924'),
    ('2202'), ('1763'), ('3652'), ('3617'), ('2972'), ('2531'), ('2137'),
    ('3115'), ('1984'), ('1879'), ('2495'), ('2130'), ('17347'), ('5582'),
    ('3194'), ('2846'), ('2268'), ('2208'), ('5423'), ('1920'), ('1554'),
    ('2065'), ('2037')
),
target_records as (
  select
    ir.id,
    t.slug as tenant_slug,
    ir.source_record_id,
    ir.person_id,
    ir.interview_date,
    ir.company_name
  from interview_records ir
  join tenants t on t.id = ir.tenant_id
  join target_tenants tt on tt.slug = t.slug
  where ir.source_system = 'kintone'
    and ir.source_app_id = '98'
    and ir.record_type = 'regular_interview'
    and ir.interview_date::date < date '2026-04-01'
)
select
  count(*) as candidate_count,
  min(interview_date) as oldest_interview_date,
  max(interview_date) as newest_interview_date
from target_records;

with target_tenants(slug) as (
  values
    ('2553'), ('2537'), ('1563'), ('2671'), ('2143'), ('2562'), ('17156'),
    ('5521'), ('3324'), ('3744'), ('3485'), ('3303'), ('3745'), ('2484'),
    ('1700'), ('2569'), ('1771'), ('1967'), ('2770'), ('1627'), ('1611'),
    ('2200'), ('2581'), ('3153'), ('3100'), ('2090'), ('1775'), ('5487'),
    ('3336'), ('4561'), ('3032'), ('1801'), ('1755'), ('1962'), ('1901'),
    ('3240'), ('1534'), ('17618'), ('2720'), ('2207'), ('17648'), ('2585'),
    ('2955'), ('1817'), ('2080'), ('17614'), ('1912'), ('2056'), ('2017'),
    ('17190'), ('2378'), ('17195'), ('3752'), ('1966'), ('17399'), ('3419'),
    ('2932'), ('2705'), ('5616'), ('2578'), ('2018'), ('17434'), ('5645'),
    ('5518'), ('2727'), ('3260'), ('2543'), ('3401'), ('3132'), ('2555'),
    ('5474'), ('2530'), ('2060'), ('3043'), ('2783'), ('2421'), ('2924'),
    ('2202'), ('1763'), ('3652'), ('3617'), ('2972'), ('2531'), ('2137'),
    ('3115'), ('1984'), ('1879'), ('2495'), ('2130'), ('17347'), ('5582'),
    ('3194'), ('2846'), ('2268'), ('2208'), ('5423'), ('1920'), ('1554'),
    ('2065'), ('2037')
)
select
  t.slug as tenant_slug,
  ir.source_record_id,
  ir.person_id,
  ir.interview_date,
  ir.company_name
from interview_records ir
join tenants t on t.id = ir.tenant_id
join target_tenants tt on tt.slug = t.slug
where ir.source_system = 'kintone'
  and ir.source_app_id = '98'
  and ir.record_type = 'regular_interview'
  and ir.interview_date::date < date '2026-04-01'
order by ir.interview_date desc, ir.source_record_id
limit 20;

with target_tenants(slug) as (
  values
    ('2553'), ('2537'), ('1563'), ('2671'), ('2143'), ('2562'), ('17156'),
    ('5521'), ('3324'), ('3744'), ('3485'), ('3303'), ('3745'), ('2484'),
    ('1700'), ('2569'), ('1771'), ('1967'), ('2770'), ('1627'), ('1611'),
    ('2200'), ('2581'), ('3153'), ('3100'), ('2090'), ('1775'), ('5487'),
    ('3336'), ('4561'), ('3032'), ('1801'), ('1755'), ('1962'), ('1901'),
    ('3240'), ('1534'), ('17618'), ('2720'), ('2207'), ('17648'), ('2585'),
    ('2955'), ('1817'), ('2080'), ('17614'), ('1912'), ('2056'), ('2017'),
    ('17190'), ('2378'), ('17195'), ('3752'), ('1966'), ('17399'), ('3419'),
    ('2932'), ('2705'), ('5616'), ('2578'), ('2018'), ('17434'), ('5645'),
    ('5518'), ('2727'), ('3260'), ('2543'), ('3401'), ('3132'), ('2555'),
    ('5474'), ('2530'), ('2060'), ('3043'), ('2783'), ('2421'), ('2924'),
    ('2202'), ('1763'), ('3652'), ('3617'), ('2972'), ('2531'), ('2137'),
    ('3115'), ('1984'), ('1879'), ('2495'), ('2130'), ('17347'), ('5582'),
    ('3194'), ('2846'), ('2268'), ('2208'), ('5423'), ('1920'), ('1554'),
    ('2065'), ('2037')
),
deleted as (
  delete from interview_records ir
  using tenants t, target_tenants tt
  where ir.tenant_id = t.id
    and t.slug = tt.slug
    and ir.source_system = 'kintone'
    and ir.source_app_id = '98'
    and ir.record_type = 'regular_interview'
    and ir.interview_date::date < date '2026-04-01'
  returning ir.id
)
select count(*) as deleted_count
from deleted;

-- Keep rollback until candidate_count is reviewed.
-- commit;
rollback;
