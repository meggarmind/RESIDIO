create or replace function public.create_personnel_with_estate_engagement(
  p_personnel jsonb,
  p_responsibility text,
  p_start_date date,
  p_end_date date default null
)
returns uuid
language plpgsql
security invoker
set search_path = public, pg_temp
as $$
declare v_personnel_id uuid;
begin
  if p_start_date is null then raise exception 'Estate engagement start date is required'; end if;
  if p_end_date is not null and p_end_date < p_start_date then raise exception 'Estate engagement end date cannot be before its start date'; end if;
  insert into public.vendors (name, type, status, is_active, category, contact_person, email, phone, job_title, department, start_date, end_date, notes, bank_details)
  values (
    p_personnel->>'name', coalesce(p_personnel->>'type', 'vendor'), coalesce(p_personnel->>'status', 'active'), coalesce((p_personnel->>'is_active')::boolean, true),
    nullif(p_personnel->>'category', ''), nullif(p_personnel->>'contact_person', ''), nullif(p_personnel->>'email', ''), nullif(p_personnel->>'phone', ''),
    nullif(p_personnel->>'job_title', ''), nullif(p_personnel->>'department', ''), nullif(p_personnel->>'start_date', '')::date, nullif(p_personnel->>'end_date', '')::date,
    nullif(p_personnel->>'notes', ''), coalesce(p_personnel->'bank_details', '{}'::jsonb)
  ) returning id into v_personnel_id;
  insert into public.personnel_engagements (personnel_id, accountability_scope, responsibility, start_date, end_date)
  values (v_personnel_id, 'estate', nullif(p_responsibility, ''), p_start_date, p_end_date);
  return v_personnel_id;
end;
$$;

revoke all on function public.create_personnel_with_estate_engagement(jsonb, text, date, date) from public, anon, authenticated;
grant execute on function public.create_personnel_with_estate_engagement(jsonb, text, date, date) to service_role;
