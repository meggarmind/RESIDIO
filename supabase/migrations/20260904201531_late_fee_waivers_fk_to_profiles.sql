-- late_fee_waivers.requested_by / reviewed_by referenced auth.users, so PostgREST
-- could not embed `profiles` and get_late_fee_waivers() failed with PGRST200.
-- Repoint both FKs at public.profiles (whose id is itself auth.users.id).

ALTER TABLE public.late_fee_waivers
  DROP CONSTRAINT IF EXISTS late_fee_waivers_requested_by_fkey,
  DROP CONSTRAINT IF EXISTS late_fee_waivers_reviewed_by_fkey;

ALTER TABLE public.late_fee_waivers
  ADD CONSTRAINT late_fee_waivers_requested_by_fkey
    FOREIGN KEY (requested_by) REFERENCES public.profiles(id) ON DELETE RESTRICT,
  ADD CONSTRAINT late_fee_waivers_reviewed_by_fkey
    FOREIGN KEY (reviewed_by) REFERENCES public.profiles(id) ON DELETE SET NULL;
