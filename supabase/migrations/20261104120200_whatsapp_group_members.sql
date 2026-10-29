-- Members of the estate WhatsApp group, synced from WAHA (#1325, parent #1323).
--
-- WHAT CHANGES
--   CREATE TABLE public.whatsapp_group_members: one row per (group, member). member_id is the raw
--   WAHA id (`...@c.us` or a hidden `...@lid`); phone is the E.164 number when it is known (a
--   `@lid` is resolved through WAHA); resident_id is the resident whose phone_primary or
--   phone_secondary matches, or NULL. left_at is set when the member leaves; last_seen_at is the
--   last time a join event or the nightly sync saw the member. Unmatched rows are purged 30 days
--   after last_seen_at by the whatsapp-retention cron. Service role only, like the other WhatsApp
--   tables. resident_merge_references() lists the column with handling 'move', so a resident merge
--   re-points it onto the kept resident. Nothing is dropped or deleted.
--
-- WHY
--   The rollout mode `group` and the unmatched-members report read this list.
--
-- IDEMPOTENT: CREATE ... IF NOT EXISTS, DROP POLICY IF EXISTS before CREATE POLICY.
--
-- ROLLBACK (loses the synced member list, which the next nightly sync rebuilds; roll the code back first):
--   BEGIN;
--   -- re-run resident_merge_references() from 20261103110000_payment_purpose_and_payer.sql
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

CREATE OR REPLACE FUNCTION public.resident_merge_references()
RETURNS TABLE (ordinal integer, table_name text, column_name text, key_column text, handling text)
LANGUAGE sql
IMMUTABLE
SET search_path = ''
AS $$
  VALUES
    (1,  'resident_houses',                  'resident_id',                   'id',          'fold'),
    (2,  'resident_houses',                  'sponsor_resident_id',           'id',          'move'),
    (3,  'residents',                        'emergency_contact_resident_id', 'id',          'move'),
    (4,  'residents',                        'merged_into_resident_id',       'id',          'move'),
    (5,  'profiles',                         'resident_id',                   'id',          'move'),
    (6,  'invoices',                         'resident_id',                   'id',          'move'),
    (7,  'payment_records',                  'resident_id',                   'id',          'move'),
    (8,  'paystack_transactions',            'resident_id',                   'id',          'move'),
    (9,  'wallet_payment_batches',           'resident_id',                   'id',          'move'),
    (10, 'wallet_settlement_requests',       'resident_id',                   'request_key', 'move'),
    (11, 'late_fee_waivers',                 'resident_id',                   'id',          'move'),
    (12, 'house_levy_history',               'resident_id',                   'id',          'move'),
    (13, 'invoice_generation_candidates',    'resident_id',                   'id',          'move'),
    (14, 'bank_statement_rows',              'matched_resident_id',           'id',          'move'),
    (15, 'email_transactions',               'matched_resident_id',           'id',          'move'),
    (16, 'expenses',                         'resident_id',                   'id',          'move'),
    (17, 'resident_payment_aliases',         'resident_id',                   'id',          'fold'),
    (18, 'resident_payment_cadence_summary', 'resident_id',                   'resident_id', 'fold'),
    (19, 'house_ownership_history',          'resident_id',                   'id',          'move'),
    (20, 'security_contacts',                'resident_id',                   'id',          'move'),
    (21, 'access_logs',                      'resident_id',                   'id',          'move'),
    (22, 'documents',                        'resident_id',                   'id',          'move'),
    (23, 'email_logs',                       'resident_id',                   'id',          'move'),
    (24, 'notification_queue',               'recipient_id',                  'id',          'move'),
    (25, 'notification_history',             'recipient_id',                  'id',          'move'),
    (26, 'notification_preferences',         'resident_id',                   'id',          'fold'),
    (27, 'escalation_states',                'resident_id',                   'id',          'fold'),
    (28, 'hierarchical_settings',            'resident_id',                   'id',          'fold'),
    (29, 'announcement_read_receipts',       'resident_id',                   'id',          'fold'),
    (30, 'report_subscriptions',             'resident_id',                   'id',          'fold'),
    (31, 'verification_tokens',              'resident_id',                   'id',          'move'),
    (32, 'approval_requests',                'affected_resident_id',          'id',          'move'),
    (33, 'approval_requests',                'requested_by_resident_id',      'id',          'move'),
    (34, 'impersonation_sessions',           'impersonated_resident_id',      'id',          'move'),
    (35, 'whatsapp_optins',                  'resident_id',                   'id',          'fold'),
    (36, 'whatsapp_sessions',                'resident_id',                   'id',          'move'),
    (37, 'whatsapp_link_tokens',             'resident_id',                   'id',          'move'),
    (38, 'whatsapp_pending_contacts',        'resident_id',                   'id',          'move'),
    (39, 'whatsapp_disclosure_logs',         'resident_id',                   'id',          'move'),
    (40, 'whatsapp_consent_decisions',       'resident_id',                   'id',          'move'),
    (41, 'whatsapp_outbound_sends',          'resident_id',                   'id',          'move'),
    (42, 'whatsapp_statement_requests',      'resident_id',                   'id',          'move'),
    (43, 'whatsapp_survey_responses',        'resident_id',                   'id',          'move'),
    (44, 'whatsapp_survey_opt_outs',         'resident_id',                   'resident_id', 'fold'),
    (45, 'recipient_group_members',          'resident_id',                   'id',          'fold'),
    (46, 'clearance_certificate_copies',     'recipient_resident_id',         'id',          'fold'),
    (47, 'resident_wallets',                 'resident_id',                   'id',          'keep'),
    (48, 'resident_merges',                  'kept_resident_id',              'id',          'keep'),
    (49, 'resident_merges',                  'merged_resident_id',            'id',          'keep'),
    (50, 'collection_payers',                'resident_id',                   'id',          'keep'),
    (51, 'payment_records',                  'paid_by_resident_id',           'id',          'move'),
    (52, 'whatsapp_group_members',           'resident_id',                   'id',          'move')
$$;

REVOKE ALL ON FUNCTION public.resident_merge_references() FROM PUBLIC, anon, authenticated;
