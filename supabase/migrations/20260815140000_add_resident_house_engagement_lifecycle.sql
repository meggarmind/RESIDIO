create or replace function public.validate_personnel_engagement_target()
returns trigger
language plpgsql
security invoker
set search_path = public, pg_temp
as $$
begin
  if new.accountability_scope = 'resident_house' then
    if not exists (
      select 1 from public.resident_houses rh
      where rh.id = new.resident_house_id and rh.is_active = true
    ) then
      raise exception 'Resident-House engagement requires an active Resident House';
    end if;
  elsif new.resident_house_id is not null then
    raise exception 'Estate engagement cannot reference a Resident House';
  end if;
  return new;
end;
$$;

create trigger personnel_engagements_validate_target
  before insert or update of accountability_scope, resident_house_id on public.personnel_engagements
  for each row execute function public.validate_personnel_engagement_target();

create or replace function public.create_personnel_resident_house_engagement(
  p_personnel_id uuid,
  p_resident_house_id uuid,
  p_responsibility text,
  p_start_date date,
  p_end_date date default null
)
returns uuid
language plpgsql
security invoker
set search_path = public, pg_temp
as $$
declare v_engagement_id uuid;
begin
  if p_start_date is null then raise exception 'Resident-House engagement start date is required'; end if;
  if p_end_date is not null and p_end_date < p_start_date then raise exception 'Engagement end date cannot be before its start date'; end if;
  insert into public.personnel_engagements (personnel_id, accountability_scope, resident_house_id, responsibility, start_date, end_date)
  values (p_personnel_id, 'resident_house', p_resident_house_id, nullif(p_responsibility, ''), p_start_date, p_end_date)
  returning id into v_engagement_id;
  return v_engagement_id;
end;
$$;

revoke all on function public.create_personnel_resident_house_engagement(uuid, uuid, text, date, date) from public, anon, authenticated;
grant execute on function public.create_personnel_resident_house_engagement(uuid, uuid, text, date, date) to service_role;
