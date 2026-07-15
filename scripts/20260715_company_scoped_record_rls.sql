-- Company-scoped read policy for synced interview_records.
--
-- This script mirrors the FunBase application access model:
-- - owner/admin/supporter can read all companies in their active tenant.
-- - member/guest can read assigned active tenant_offices only.
-- - member/guest with no active office assignment keeps full tenant access.
-- - feature_permissions.{feature} = false denies that feature.
--
-- Move this file into the fun-base-infra supabase/migrations directory before
-- applying through the normal Supabase migration flow.
--
-- This intentionally enables RLS only on interview_records. Other CRUD tables
-- such as people, visas, meetings, and support_actions need separate write
-- policies before RLS can be enabled safely there.

create or replace function public.funbase_current_user_can_access_company(
  p_tenant_id text,
  p_company_name text,
  p_feature text
)
returns boolean
language sql
stable
set search_path = public
as $$
  select exists (
    select 1
    from public.user_tenants ut
    where ut.user_id = (select auth.uid())
      and ut.status = 'active'
      and ut.tenant_id::text = p_tenant_id
      and (
        ut.role in ('owner', 'admin', 'supporter')
        or coalesce((ut.feature_permissions::jsonb ->> p_feature)::boolean, true)
      )
      and (
        ut.role in ('owner', 'admin', 'supporter')
        or not exists (
          select 1
          from public.user_tenant_offices uto
          join public.tenant_offices office
            on office.id = uto.tenant_office_id
          where uto.user_tenant_id = ut.id
            and office.is_active = true
        )
        or exists (
          select 1
          from public.user_tenant_offices uto
          join public.tenant_offices office
            on office.id = uto.tenant_office_id
          where uto.user_tenant_id = ut.id
            and office.is_active = true
            and office.name = p_company_name
        )
      )
  );
$$;

create or replace function public.funbase_current_user_can_access_person(
  p_person_id text,
  p_feature text
)
returns boolean
language sql
stable
set search_path = public
as $$
  select exists (
    select 1
    from public.people p
    where p.id::text = p_person_id
      and public.funbase_current_user_can_access_company(
        p.tenant_id::text,
        p.company,
        p_feature
      )
  );
$$;

alter table public.interview_records enable row level security;

drop policy if exists "company scoped interview records select" on public.interview_records;
create policy "company scoped interview records select"
on public.interview_records
for select
to authenticated
using (
  case record_type
    when 'regular_interview' then (
      public.funbase_current_user_can_access_person(person_id::text, 'meetings')
      or public.funbase_current_user_can_access_company(tenant_id::text, company_name, 'meetings')
    )
    when 'daily_support' then (
      public.funbase_current_user_can_access_person(person_id::text, 'support_actions')
      or public.funbase_current_user_can_access_company(tenant_id::text, company_name, 'support_actions')
    )
    else false
  end
);
