create type public.personnel_engagement_scope as enum ('estate', 'resident_house');

create table public.personnel_engagements (
  id uuid primary key default gen_random_uuid(),
  personnel_id uuid not null references public.vendors(id) on delete restrict,
  accountability_scope public.personnel_engagement_scope not null,
  resident_house_id uuid references public.resident_houses(id) on delete restrict,
  responsibility text,
  start_date date not null default current_date,
  end_date date,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint personnel_engagements_scope_target_check check (
    (accountability_scope = 'estate' and resident_house_id is null)
    or (accountability_scope = 'resident_house' and resident_house_id is not null)
  ),
  constraint personnel_engagements_valid_dates_check check (
    end_date is null or end_date >= start_date
  )
);

create index personnel_engagements_personnel_id_idx
  on public.personnel_engagements (personnel_id);

create index personnel_engagements_active_personnel_id_idx
  on public.personnel_engagements (personnel_id)
  where end_date is null;

create unique index personnel_engagements_unique_active_target_idx
  on public.personnel_engagements (
    personnel_id,
    accountability_scope,
    coalesce(resident_house_id, '00000000-0000-0000-0000-000000000000'::uuid)
  )
  where end_date is null;

alter table public.personnel_engagements enable row level security;

create policy "View Personnel Engagements - Internal"
  on public.personnel_engagements
  for select
  to authenticated
  using (true);

create policy "Manage Personnel Engagements - Authorized Roles"
  on public.personnel_engagements
  for all
  to authenticated
  using (
    exists (
      select 1
      from public.profiles p
      join public.app_roles r on r.id = p.role_id
      where p.id = (select auth.uid())
        and (
          r.name in ('super_admin', 'admin', 'financial_secretary', 'chairman', 'financial_officer')
          or r.category = 'exco'
        )
    )
  )
  with check (
    exists (
      select 1
      from public.profiles p
      join public.app_roles r on r.id = p.role_id
      where p.id = (select auth.uid())
        and (
          r.name in ('super_admin', 'admin', 'financial_secretary', 'chairman', 'financial_officer')
          or r.category = 'exco'
        )
    )
  );

create trigger personnel_engagements_updated_at
  before update on public.personnel_engagements
  for each row execute function public.handle_updated_at();
