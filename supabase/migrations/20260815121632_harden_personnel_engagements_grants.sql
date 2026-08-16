revoke all on table public.personnel_engagements from anon;
revoke delete, references, trigger, truncate on table public.personnel_engagements from authenticated;
grant select, insert, update on table public.personnel_engagements to authenticated;
