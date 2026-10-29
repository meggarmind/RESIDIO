-- Members of the estate WhatsApp group, synced from WAHA (#1325, parent #1323).
--
-- WHAT CHANGES
--   CREATE TABLE public.whatsapp_group_members: one row per (group, member). member_id is the raw
--   WAHA id (`...@c.us` or a hidden `...@lid`); phone is the E.164 number when it is known (a
--   `@lid` is resolved through WAHA); resident_id is the resident whose phone_primary or
--   phone_secondary matches, or NULL. left_at is set when the member leaves; last_seen_at is the
--   last time a join event or the nightly sync saw the member. Unmatched rows are purged 30 days
--   after last_seen_at by the whatsapp-retention cron. Service role only, like the other WhatsApp
--   tables. Nothing is dropped or deleted.
--
-- WHY
--   The rollout mode `group` and the unmatched-members report read this list.
--
-- IDEMPOTENT: CREATE ... IF NOT EXISTS, DROP POLICY IF EXISTS before CREATE POLICY.
--
-- ROLLBACK (loses the synced member list, which the next nightly sync rebuilds; roll the code back first):
--   BEGIN;
--   DROP TABLE IF EXISTS public.whatsapp_group_members;
--   COMMIT;
--
-- VERIFY (run on the database after applying):
--   SELECT has_table_privilege('authenticated', 'public.whatsapp_group_members', 'SELECT');  -- expect false
--   SELECT relrowsecurity FROM pg_class WHERE oid = 'public.whatsapp_group_members'::regclass;  -- expect true

CREATE TABLE IF NOT EXISTS public.whatsapp_group_members (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  group_id TEXT NOT NULL,
  member_id TEXT NOT NULL,
  phone TEXT,
  role TEXT NOT NULL DEFAULT 'participant',
  resident_id UUID REFERENCES public.residents(id) ON DELETE SET NULL,
  joined_at TIMESTAMPTZ NOT NULL DEFAULT timezone('utc', now()),
  left_at TIMESTAMPTZ,
  last_seen_at TIMESTAMPTZ NOT NULL DEFAULT timezone('utc', now()),
  created_at TIMESTAMPTZ NOT NULL DEFAULT timezone('utc', now()),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT timezone('utc', now()),
  CONSTRAINT whatsapp_group_members_group_member_key UNIQUE (group_id, member_id)
);

CREATE INDEX IF NOT EXISTS idx_whatsapp_group_members_phone
  ON public.whatsapp_group_members (phone) WHERE phone IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_whatsapp_group_members_resident
  ON public.whatsapp_group_members (resident_id) WHERE resident_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_whatsapp_group_members_unmatched_seen
  ON public.whatsapp_group_members (last_seen_at) WHERE resident_id IS NULL;

ALTER TABLE public.whatsapp_group_members ENABLE ROW LEVEL SECURITY;

REVOKE ALL ON TABLE public.whatsapp_group_members FROM anon, authenticated;
GRANT ALL ON TABLE public.whatsapp_group_members TO service_role;

DROP POLICY IF EXISTS "whatsapp_group_members_service_role_all" ON public.whatsapp_group_members;
CREATE POLICY "whatsapp_group_members_service_role_all"
  ON public.whatsapp_group_members FOR ALL TO service_role USING (true) WITH CHECK (true);
