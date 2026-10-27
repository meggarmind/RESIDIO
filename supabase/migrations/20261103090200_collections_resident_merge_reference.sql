-- Slice 6 of #1188 (#1194): collection_payers.resident_id is a foreign key to residents, so the
-- merge inventory (resident_merge_references) must list it or the inventory check fails.
--
-- Handling is 'keep': collection_payers has a unique index on resident_id, so re-pointing the
-- duplicate's payer onto a kept resident that already has one would clash. The payer row stays on
-- the archived duplicate, like the wallet and merge history.
--
-- Rollback: re-run resident_merge_references() from 20261024100100_resident_merge_functions.sql.
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
    (50, 'collection_payers',                'resident_id',                   'id',          'keep')
$$;

REVOKE ALL ON FUNCTION public.resident_merge_references() FROM PUBLIC, anon, authenticated;
