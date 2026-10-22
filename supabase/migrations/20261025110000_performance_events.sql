-- Performance events (#957): the admin dashboard's browser-side load-time metrics
-- (src/lib/performance/telemetry.ts), received by POST /api/telemetry/performance.
--
-- Content rule: closed columns only. No user id, no free text. `label` is the
-- sanitiser's allow-listed operation/cache/snapshot/action name, never an identifier.
-- `mutation_failure` is not stored in this slice.
--
-- Retention: raw rows are deleted after 30 days by GET /api/cron/purge-performance-events.
--
-- Access, same shape as system_action_log: RLS enabled with ONE policy, SELECT for
-- authenticated users holding system.view_system_log (super administrators). No INSERT,
-- UPDATE or DELETE policies and no such privileges: writes go through the service role.
--
-- Rollback:
--   DROP TABLE public.performance_events;

BEGIN;

CREATE TABLE public.performance_events (
    id           uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    occurred_at  timestamptz NOT NULL,
    received_at  timestamptz NOT NULL DEFAULT now(),
    event_type   text NOT NULL CHECK (event_type IN (
        'query_duration', 'result_size', 'cache_hit', 'cache_miss', 'stale_snapshot', 'offline_action'
    )),
    label        text NOT NULL CHECK (char_length(label) <= 64),
    duration_ms  bigint,
    result_count bigint,
    item_count   bigint,
    byte_size    bigint,
    age_ms       bigint,
    max_stale_ms bigint,
    success      boolean,
    blocked      boolean
);

COMMENT ON TABLE public.performance_events IS
    'Browser-measured admin performance events. Super-admin read only; service-role write only; purged after 30 days (#957).';
COMMENT ON COLUMN public.performance_events.label IS 'Allow-listed operation, cache, snapshot or action name; never an identifier.';

CREATE INDEX performance_events_occurred_at_idx
    ON public.performance_events (occurred_at DESC);
CREATE INDEX performance_events_type_label_occurred_at_idx
    ON public.performance_events (event_type, label, occurred_at DESC);

ALTER TABLE public.performance_events ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Super admins can view performance events"
    ON public.performance_events
    FOR SELECT
    TO authenticated
    USING (public.has_permission('system.view_system_log'));

REVOKE ALL ON public.performance_events FROM PUBLIC, anon, authenticated;
GRANT SELECT ON public.performance_events TO authenticated;

COMMIT;
