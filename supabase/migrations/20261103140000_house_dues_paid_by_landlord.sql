-- Issue #1192 (slice 4 of #1188): house setting "Dues paid by landlord".
--
-- Owner decision 7 (26 Oct 2026): on a flagged house the tenant still owes the dues and the landlord
-- pays them. dues_reminder_target chooses who gets the dues reminders: the tenant (default), the
-- landlord, or both. The setting is read only when dues_paid_by_landlord is true.
--
-- ROLLBACK:
-- BEGIN;
-- ALTER TABLE public.houses DROP COLUMN IF EXISTS dues_reminder_target;
-- ALTER TABLE public.houses DROP COLUMN IF EXISTS dues_paid_by_landlord;
-- COMMIT;
--
-- VERIFY (read-only, after applying):
--   SELECT column_name, data_type, column_default, is_nullable FROM information_schema.columns
--    WHERE table_schema = 'public' AND table_name = 'houses'
--      AND column_name IN ('dues_paid_by_landlord', 'dues_reminder_target') ORDER BY 1;
--     -- dues_paid_by_landlord boolean false NO; dues_reminder_target text 'tenant'::text NO
--   SELECT count(*) FROM public.houses WHERE dues_paid_by_landlord;   -- 0

BEGIN;

ALTER TABLE public.houses
    ADD COLUMN IF NOT EXISTS dues_paid_by_landlord BOOLEAN NOT NULL DEFAULT false,
    ADD COLUMN IF NOT EXISTS dues_reminder_target TEXT NOT NULL DEFAULT 'tenant'
        CONSTRAINT houses_dues_reminder_target_check
        CHECK (dues_reminder_target IN ('tenant', 'landlord', 'both'));

COMMENT ON COLUMN public.houses.dues_paid_by_landlord IS
    'Dues paid by landlord (#1192): the tenant owes the dues, the landlord pays them';
COMMENT ON COLUMN public.houses.dues_reminder_target IS
    'Who gets dues reminders when dues_paid_by_landlord is true: tenant, landlord or both';

COMMIT;
