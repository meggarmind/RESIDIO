-- ============================================================================
-- COMPREHENSIVE SEED DATA FOR RESIDIO
-- ============================================================================
-- This file includes all fixture files in dependency order to create a complete
-- test dataset for E2E testing and migration validation.
--
-- USAGE:
--   From project root:
--   psql $DATABASE_URL < supabase/seed-comprehensive.sql
--
--   Or via Supabase CLI (if using local):
--   supabase db reset --seed
--
-- DATA SUMMARY:
--   - 55 Residents (all roles: landlord, tenant, household_member, etc.)
--   - 28 Houses (occupied, vacant, developer-owned)
--   - 6 Billing Profiles (monthly, levies, fees)
--   - 120 Invoices (paid, pending, overdue, void)
--   - 60 Payment Records (bank transfer, cash, POS, online)
--   - 30 Wallet Accounts with transactions
--   - 25 Security Contacts with access codes
--   - 150 Access Logs (6 months of gate activity)
--   - 12 Announcements (published, draft, scheduled, archived)
--   - 25 Documents (5 categories, various access levels)
--   - 40 Entity Notes (resident and house notes)
--   - 15 Notification Templates (email, SMS)
--   - 20 Notification Preferences
--   - 30 Notification History entries
--   - 250 Audit Logs (12 months of activity)
--
-- CREATED: 2026-01-08
-- ============================================================================

-- Wrap everything in a transaction for atomicity
BEGIN;

-- Set client encoding
SET client_encoding = 'UTF8';

-- ============================================================================
-- PHASE 1: REFERENCE DATA
-- Foundation data that other entities depend on
-- ============================================================================

\echo ''
\echo '============================================'
\echo 'Loading Reference Data...'
\echo '============================================'
\i fixtures/01-reference-data.sql

-- ============================================================================
-- PHASE 2: CORE ENTITIES
-- Primary entities that form the backbone of the system
-- ============================================================================

\echo ''
\echo '============================================'
\echo 'Loading Residents...'
\echo '============================================'
\i fixtures/02-residents.sql

\echo ''
\echo '============================================'
\echo 'Loading Houses...'
\echo '============================================'
\i fixtures/03-houses.sql

-- ============================================================================
-- PHASE 3: RELATIONSHIPS
-- Links between core entities
-- ============================================================================

\echo ''
\echo '============================================'
\echo 'Loading Resident-House Links...'
\echo '============================================'
\i fixtures/04-resident-house-links.sql

-- ============================================================================
-- PHASE 4: BILLING SETUP
-- Billing profiles and items (needed before invoices)
-- ============================================================================

\echo ''
\echo '============================================'
\echo 'Loading Billing Profiles...'
\echo '============================================'
\i fixtures/05-billing-profiles.sql

-- ============================================================================
-- PHASE 5: FINANCIAL DATA
-- Invoices, payments, and wallet transactions
-- ============================================================================

\echo ''
\echo '============================================'
\echo 'Loading Invoices...'
\echo '============================================'
\i fixtures/06-invoices.sql

\echo ''
\echo '============================================'
\echo 'Loading Payments...'
\echo '============================================'
\i fixtures/07-payments.sql

\echo ''
\echo '============================================'
\echo 'Loading Wallet Transactions...'
\echo '============================================'
\i fixtures/08-wallets.sql

-- ============================================================================
-- PHASE 6: SECURITY DATA
-- Security contacts and access logs
-- ============================================================================

\echo ''
\echo '============================================'
\echo 'Loading Security Contacts...'
\echo '============================================'
\i fixtures/09-security-contacts.sql

\echo ''
\echo '============================================'
\echo 'Loading Access Logs...'
\echo '============================================'
\i fixtures/10-access-logs.sql

-- ============================================================================
-- PHASE 7: COMMUNICATION & DOCUMENTS
-- Announcements and document management
-- ============================================================================

\echo ''
\echo '============================================'
\echo 'Loading Announcements...'
\echo '============================================'
\i fixtures/11-announcements.sql

\echo ''
\echo '============================================'
\echo 'Loading Documents...'
\echo '============================================'
\i fixtures/12-documents.sql

-- ============================================================================
-- PHASE 8: NOTES & METADATA
-- Entity notes for residents and houses
-- ============================================================================

\echo ''
\echo '============================================'
\echo 'Loading Entity Notes...'
\echo '============================================'
\i fixtures/13-notes.sql

-- ============================================================================
-- PHASE 9: NOTIFICATIONS
-- Notification templates, preferences, and history
-- ============================================================================

\echo ''
\echo '============================================'
\echo 'Loading Notifications...'
\echo '============================================'
\i fixtures/14-notifications.sql

-- ============================================================================
-- PHASE 10: AUDIT TRAIL
-- Historical audit logs (12 months of data)
-- ============================================================================

\echo ''
\echo '============================================'
\echo 'Loading Audit Logs...'
\echo '============================================'
\i fixtures/15-audit-logs.sql

-- ============================================================================
-- VERIFICATION SUMMARY
-- Display final counts for all seeded data
-- ============================================================================

\echo ''
\echo '============================================'
\echo 'SEED DATA VERIFICATION'
\echo '============================================'

DO $$
DECLARE
    v_residents INTEGER;
    v_houses INTEGER;
    v_resident_houses INTEGER;
    v_billing_profiles INTEGER;
    v_invoices INTEGER;
    v_payments INTEGER;
    v_wallets INTEGER;
    v_wallet_transactions INTEGER;
    v_security_contacts INTEGER;
    v_access_logs INTEGER;
    v_announcements INTEGER;
    v_documents INTEGER;
    v_entity_notes INTEGER;
    v_notification_templates INTEGER;
    v_notification_preferences INTEGER;
    v_notification_history INTEGER;
    v_audit_logs INTEGER;
BEGIN
    -- Count all entities
    SELECT COUNT(*) INTO v_residents FROM residents;
    SELECT COUNT(*) INTO v_houses FROM houses;
    SELECT COUNT(*) INTO v_resident_houses FROM resident_houses;
    SELECT COUNT(*) INTO v_billing_profiles FROM billing_profiles;
    SELECT COUNT(*) INTO v_invoices FROM invoices;
    SELECT COUNT(*) INTO v_payments FROM payment_records;
    SELECT COUNT(*) INTO v_wallets FROM resident_wallets;
    SELECT COUNT(*) INTO v_wallet_transactions FROM wallet_transactions;
    SELECT COUNT(*) INTO v_security_contacts FROM security_contacts;
    SELECT COUNT(*) INTO v_access_logs FROM access_logs;
    SELECT COUNT(*) INTO v_announcements FROM announcements;
    SELECT COUNT(*) INTO v_documents FROM documents;
    SELECT COUNT(*) INTO v_entity_notes FROM entity_notes;
    SELECT COUNT(*) INTO v_notification_templates FROM notification_templates;
    SELECT COUNT(*) INTO v_notification_preferences FROM notification_preferences;
    SELECT COUNT(*) INTO v_notification_history FROM notification_history;
    SELECT COUNT(*) INTO v_audit_logs FROM audit_logs;

    RAISE NOTICE '';
    RAISE NOTICE '╔════════════════════════════════════════════════════════════╗';
    RAISE NOTICE '║             COMPREHENSIVE SEED DATA LOADED                 ║';
    RAISE NOTICE '╠════════════════════════════════════════════════════════════╣';
    RAISE NOTICE '║ Entity                          │ Count                    ║';
    RAISE NOTICE '╠═════════════════════════════════╪══════════════════════════╣';
    RAISE NOTICE '║ Residents                       │ %                        ║', LPAD(v_residents::TEXT, 6);
    RAISE NOTICE '║ Houses                          │ %                        ║', LPAD(v_houses::TEXT, 6);
    RAISE NOTICE '║ Resident-House Links            │ %                        ║', LPAD(v_resident_houses::TEXT, 6);
    RAISE NOTICE '║ Billing Profiles                │ %                        ║', LPAD(v_billing_profiles::TEXT, 6);
    RAISE NOTICE '║ Invoices                        │ %                        ║', LPAD(v_invoices::TEXT, 6);
    RAISE NOTICE '║ Payment Records                 │ %                        ║', LPAD(v_payments::TEXT, 6);
    RAISE NOTICE '║ Wallet Accounts                 │ %                        ║', LPAD(v_wallets::TEXT, 6);
    RAISE NOTICE '║ Wallet Transactions             │ %                        ║', LPAD(v_wallet_transactions::TEXT, 6);
    RAISE NOTICE '║ Security Contacts               │ %                        ║', LPAD(v_security_contacts::TEXT, 6);
    RAISE NOTICE '║ Access Logs                     │ %                        ║', LPAD(v_access_logs::TEXT, 6);
    RAISE NOTICE '║ Announcements                   │ %                        ║', LPAD(v_announcements::TEXT, 6);
    RAISE NOTICE '║ Documents                       │ %                        ║', LPAD(v_documents::TEXT, 6);
    RAISE NOTICE '║ Entity Notes                    │ %                        ║', LPAD(v_entity_notes::TEXT, 6);
    RAISE NOTICE '║ Notification Templates          │ %                        ║', LPAD(v_notification_templates::TEXT, 6);
    RAISE NOTICE '║ Notification Preferences        │ %                        ║', LPAD(v_notification_preferences::TEXT, 6);
    RAISE NOTICE '║ Notification History            │ %                        ║', LPAD(v_notification_history::TEXT, 6);
    RAISE NOTICE '║ Audit Logs                      │ %                        ║', LPAD(v_audit_logs::TEXT, 6);
    RAISE NOTICE '╚════════════════════════════════════════════════════════════╝';
    RAISE NOTICE '';

    -- Validation checks
    IF v_residents < 50 THEN
        RAISE WARNING 'Expected 50+ residents, got %', v_residents;
    END IF;
    IF v_houses < 25 THEN
        RAISE WARNING 'Expected 25+ houses, got %', v_houses;
    END IF;
    IF v_invoices < 100 THEN
        RAISE WARNING 'Expected 100+ invoices, got %', v_invoices;
    END IF;
    IF v_payments < 50 THEN
        RAISE WARNING 'Expected 50+ payments, got %', v_payments;
    END IF;
    IF v_audit_logs < 200 THEN
        RAISE WARNING 'Expected 200+ audit logs, got %', v_audit_logs;
    END IF;

    RAISE NOTICE 'Seed data loaded successfully!';
END $$;

-- ============================================================================
-- STATUS DISTRIBUTION REPORTS
-- ============================================================================

\echo ''
\echo '============================================'
\echo 'INVOICE STATUS DISTRIBUTION'
\echo '============================================'

SELECT
    status,
    COUNT(*) as count,
    ROUND(COUNT(*) * 100.0 / SUM(COUNT(*)) OVER (), 1) as percentage
FROM invoices
GROUP BY status
ORDER BY count DESC;

\echo ''
\echo '============================================'
\echo 'RESIDENT ROLE DISTRIBUTION'
\echo '============================================'

SELECT
    rh.role,
    COUNT(DISTINCT rh.resident_id) as residents,
    ROUND(COUNT(DISTINCT rh.resident_id) * 100.0 /
          (SELECT COUNT(DISTINCT resident_id) FROM resident_houses), 1) as percentage
FROM resident_houses rh
GROUP BY rh.role
ORDER BY residents DESC;

\echo ''
\echo '============================================'
\echo 'PAYMENT METHOD DISTRIBUTION'
\echo '============================================'

SELECT
    payment_method,
    COUNT(*) as count,
    SUM(amount) as total_amount
FROM payment_records
GROUP BY payment_method
ORDER BY count DESC;

-- Commit the transaction
COMMIT;

\echo ''
\echo '============================================'
\echo 'COMPREHENSIVE SEED COMPLETE!'
\echo '============================================'
