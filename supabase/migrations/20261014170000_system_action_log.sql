-- System Action Log (#538): the record of what automated, sessionless processes
-- (cron runs, webhooks) did. Visible only to super administrators.
--
-- Why not audit_logs: audit_logs attributes a change to a signed-in user
-- (actor_id). Cron runs and webhooks have no session and no actor, so they have
-- nowhere to land there. This is a separate table with its own permission; audit_logs
-- is untouched.
--
-- Content rule: `summary` holds counts and ids only. The application redacts
-- secret-looking keys and truncates strings, arrays and depth before inserting;
-- `error_message` is a truncated message, never a stack trace.
--
-- Access: RLS is enabled with ONE policy, SELECT for authenticated users holding
-- system.view_system_log (seeded by 20261014171000). There are no INSERT, UPDATE or
-- DELETE policies and no such privileges: writes go through the service role,
-- which bypasses RLS and keeps its default rights.
--
-- The viewer page is slice 3 of #538; nothing reads this table yet.
--
-- Rollback:
--   DROP TABLE public.system_action_log;

BEGIN;

CREATE TABLE public.system_action_log (
    id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    occurred_at   timestamptz NOT NULL DEFAULT now(),
    source        text NOT NULL,
    action        text NOT NULL,
    outcome       text NOT NULL CHECK (outcome IN ('success', 'partial', 'failure')),
    summary       jsonb NOT NULL DEFAULT '{}'::jsonb,
    error_message text,
    duration_ms   integer
);

COMMENT ON TABLE public.system_action_log IS
    'What automated, sessionless processes (cron, webhooks) did. Super-admin read only; service-role write only (#538).';
COMMENT ON COLUMN public.system_action_log.source IS 'Origin, e.g. cron:process-notifications or webhook:paystack.';
COMMENT ON COLUMN public.system_action_log.summary IS 'Counts and ids only; redacted by the application before insert.';
COMMENT ON COLUMN public.system_action_log.error_message IS 'Truncated error message; never a stack trace.';

CREATE INDEX system_action_log_occurred_at_idx
    ON public.system_action_log (occurred_at DESC);
CREATE INDEX system_action_log_source_occurred_at_idx
    ON public.system_action_log (source, occurred_at DESC);

ALTER TABLE public.system_action_log ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Super admins can view the system action log"
    ON public.system_action_log
    FOR SELECT
    TO authenticated
    USING (public.has_permission('system.view_system_log'));

REVOKE ALL ON public.system_action_log FROM PUBLIC, anon, authenticated;
GRANT SELECT ON public.system_action_log TO authenticated;

COMMIT;
