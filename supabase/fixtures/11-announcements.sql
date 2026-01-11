-- ============================================================================
-- Residio Comprehensive Seed Data
-- File: 11-announcements.sql
-- Description: 12 announcements with various statuses and targeting
-- Dependencies: 01-reference-data.sql, 02-residents.sql
-- ============================================================================

-- ============================================================================
-- ANNOUNCEMENTS (12 total)
-- ============================================================================
-- Status Distribution:
--   - Published: 6
--   - Draft: 2
--   - Scheduled: 2
--   - Archived: 2
--
-- Targeting Scenarios:
--   - All residents: 3
--   - Owners only: 2
--   - Specific street: 2
--   - Specific houses: 2
--   - Pinned: 1
--   - Emergency priority: 1
-- ============================================================================

-- Get category IDs (seeded in migration)
-- General, Maintenance, Security, Events, Finance

INSERT INTO announcements (
  id,
  title,
  content,
  category_id,
  status,
  priority,
  is_pinned,
  published_at,
  expires_at,
  created_by,
  created_at,
  updated_at
)
SELECT
  id,
  title,
  content,
  (SELECT id FROM announcement_categories WHERE name = category_name LIMIT 1),
  status::announcement_status,
  priority::announcement_priority,
  is_pinned,
  published_at,
  expires_at,
  created_by,
  created_at,
  updated_at
FROM (VALUES
  -- ========== PUBLISHED ANNOUNCEMENTS (6) ==========

  -- ANN-001: Published - All residents - General notice
  (
    'ae000001-0001-0001-0001-000000000001'::uuid,
    'Welcome to the New Residio Portal',
    'We are pleased to announce the launch of our new resident portal! This platform will help streamline communication, payments, and access management for all residents.

**Key Features:**
- Online payment processing
- Security contact management
- Real-time notifications
- Document access

Please log in with your registered email to access all features.',
    'General',
    'published',
    'normal',
    false,
    NOW() - INTERVAL '30 days',
    NOW() + INTERVAL '60 days',
    NULL::uuid,  -- No auth user in fixtures
    NOW() - INTERVAL '30 days',
    NOW() - INTERVAL '30 days'
  ),

  -- ANN-002: Published - Pinned - Security Alert (HIGH PRIORITY)
  (
    'ae000001-0001-0001-0001-000000000002'::uuid,
    'SECURITY ALERT: Gate Access Protocol Update',
    '**IMPORTANT SECURITY UPDATE**

Effective immediately, all visitors must be pre-registered in the security contact system before arrival.

**New Protocol:**
1. Register visitors at least 2 hours before arrival
2. Provide vehicle registration numbers
3. Use access codes for one-time visitors

Security personnel will deny entry to unregistered visitors.

Contact the security office for assistance: security@residio.test',
    'Security',
    'published',
    'high',
    true,  -- Pinned
    NOW() - INTERVAL '15 days',
    NOW() + INTERVAL '90 days',
    NULL::uuid,
    NOW() - INTERVAL '15 days',
    NOW() - INTERVAL '15 days'
  ),

  -- ANN-003: Published - Finance - Monthly dues reminder
  (
    'ae000001-0001-0001-0001-000000000003'::uuid,
    'January 2026 Service Charge Due',
    'This is a reminder that January 2026 service charges are now due.

**Payment Details:**
- Due Date: January 15, 2026
- Standard Rate: ₦15,000
- Premium Rate: ₦25,000

**Payment Options:**
- Bank Transfer to Estate Account
- Cash at the Estate Office
- POS at the Security Gate
- Online via the Resident Portal

Late payments will attract a 5% surcharge after the due date.',
    'Finance',
    'published',
    'high',
    false,
    NOW() - INTERVAL '7 days',
    NOW() + INTERVAL '30 days',
    NULL::uuid,
    NOW() - INTERVAL '7 days',
    NOW() - INTERVAL '7 days'
  ),

  -- ANN-004: Published - Maintenance - Water supply notice
  (
    'ae000001-0001-0001-0001-000000000004'::uuid,
    'Scheduled Water Supply Interruption',
    'Please be informed that there will be a scheduled water supply interruption for maintenance purposes.

**Details:**
- Date: Saturday, January 11, 2026
- Time: 8:00 AM - 4:00 PM
- Affected Areas: Oak Avenue and Palm Close

We advise residents to store water in advance. Normal supply will resume by 5:00 PM.

For emergencies, contact the maintenance team: maintenance@residio.test',
    'Maintenance',
    'published',
    'normal',
    false,
    NOW() - INTERVAL '3 days',
    NOW() + INTERVAL '5 days',
    NULL::uuid,
    NOW() - INTERVAL '3 days',
    NOW() - INTERVAL '3 days'
  ),

  -- ANN-005: Published - Events - Community event
  (
    'ae000001-0001-0001-0001-000000000005'::uuid,
    'Annual General Meeting - Save the Date',
    'Dear Residents,

You are cordially invited to the Annual General Meeting of Residio Estate.

**Meeting Details:**
- Date: Saturday, February 15, 2026
- Time: 10:00 AM
- Venue: Estate Clubhouse

**Agenda:**
1. Review of 2025 Financial Statements
2. Election of New Committee Members
3. Proposed Budget for 2026
4. Development Projects Update
5. Any Other Business

Attendance is mandatory for all property owners. Proxies must be submitted 48 hours before the meeting.',
    'Events',
    'published',
    'high',
    false,
    NOW() - INTERVAL '10 days',
    NOW() + INTERVAL '45 days',
    NULL::uuid,
    NOW() - INTERVAL '10 days',
    NOW() - INTERVAL '10 days'
  ),

  -- ANN-006: Published - General - Holiday schedule
  (
    'ae000001-0001-0001-0001-000000000006'::uuid,
    'Estate Office Holiday Schedule',
    'Please note the following holiday schedule for the estate office:

**Christmas/New Year Period:**
- December 24-26: Closed
- December 31: Half Day (8AM - 12PM)
- January 1: Closed
- January 2: Normal Operations Resume

**Emergency Contacts:**
- Security Gate: Always staffed
- Emergency Line: +234 800 123 4567
- Email: emergency@residio.test

The gate remains operational 24/7 during the holiday period.',
    'General',
    'published',
    'normal',
    false,
    NOW() - INTERVAL '20 days',
    NOW() + INTERVAL '10 days',
    NULL::uuid,
    NOW() - INTERVAL '20 days',
    NOW() - INTERVAL '20 days'
  ),

  -- ========== DRAFT ANNOUNCEMENTS (2) ==========

  -- ANN-007: Draft - Maintenance
  (
    'ae000001-0001-0001-0001-000000000007'::uuid,
    '[DRAFT] Road Resurfacing Project',
    'The estate management is planning a comprehensive road resurfacing project.

**Proposed Timeline:**
- Phase 1: Oak Avenue (February 2026)
- Phase 2: Palm Close (March 2026)
- Phase 3: Cedar Lane (April 2026)

**Expected Impact:**
- Temporary road closures
- Alternative routes will be provided
- Estimated completion: 6 weeks per phase

[TODO: Add contractor details and budget breakdown]',
    'Maintenance',
    'draft',
    'normal',
    false,
    NULL,
    NULL,
    NULL::uuid,
    NOW() - INTERVAL '5 days',
    NOW() - INTERVAL '2 days'
  ),

  -- ANN-008: Draft - Finance
  (
    'ae000001-0001-0001-0001-000000000008'::uuid,
    '[DRAFT] 2026 Budget Proposal',
    'Draft budget proposal for resident review.

**Proposed Budget Categories:**
1. Security Operations: ₦12,000,000
2. Maintenance: ₦8,000,000
3. Utilities: ₦5,000,000
4. Administration: ₦3,000,000
5. Reserve Fund: ₦2,000,000

Total: ₦30,000,000

[PENDING COMMITTEE APPROVAL]',
    'Finance',
    'draft',
    'normal',
    false,
    NULL,
    NULL,
    NULL::uuid,
    NOW() - INTERVAL '8 days',
    NOW() - INTERVAL '1 day'
  ),

  -- ========== SCHEDULED ANNOUNCEMENTS (2) ==========

  -- ANN-009: Scheduled - Events - Valentine Event
  (
    'ae000001-0001-0001-0001-000000000009'::uuid,
    'Valentine Community Dinner',
    'Join us for a special Valentine community dinner!

**Event Details:**
- Date: Friday, February 14, 2026
- Time: 7:00 PM
- Venue: Estate Garden
- Dress Code: Smart Casual (Red/Pink encouraged)

**Menu:**
- 3-course dinner
- Live music
- Wine and beverages included

**RSVP:**
- Cost: ₦5,000 per person
- RSVP Deadline: February 10, 2026
- Contact: events@residio.test',
    'Events',
    'scheduled',
    'normal',
    false,
    NOW() + INTERVAL '7 days',  -- Scheduled to publish in 7 days
    NOW() + INTERVAL '45 days',
    NULL::uuid,
    NOW() - INTERVAL '2 days',
    NOW() - INTERVAL '2 days'
  ),

  -- ANN-010: Scheduled - Security - New security protocol
  (
    'ae000001-0001-0001-0001-000000000010'::uuid,
    'Enhanced Security Measures - February 2026',
    'Starting February 1, 2026, enhanced security measures will be implemented.

**New Measures:**
1. CCTV coverage expanded to all streets
2. Night patrol increased to 3 guards
3. Vehicle stickers mandatory for all resident vehicles
4. Biometric registration for domestic staff

**Action Required:**
- Register all vehicles by January 25, 2026
- Domestic staff to complete biometric registration

More details will be shared at the AGM.',
    'Security',
    'scheduled',
    'high',
    false,
    NOW() + INTERVAL '14 days',  -- Scheduled to publish in 14 days
    NOW() + INTERVAL '60 days',
    NULL::uuid,
    NOW() - INTERVAL '1 day',
    NOW() - INTERVAL '1 day'
  ),

  -- ========== ARCHIVED ANNOUNCEMENTS (2) ==========

  -- ANN-011: Archived - Events - Past event
  (
    'ae000001-0001-0001-0001-000000000011'::uuid,
    'Christmas Carol Night 2025',
    'Thank you to everyone who attended the Christmas Carol Night!

The event was a huge success with over 100 residents in attendance. Special thanks to:
- The Estate Choir
- All volunteers
- Food committee members

Photos are available on the estate community board.

Wishing everyone a Merry Christmas and Happy New Year!',
    'Events',
    'archived',
    'normal',
    false,
    NOW() - INTERVAL '45 days',
    NOW() - INTERVAL '15 days',  -- Already expired
    NULL::uuid,
    NOW() - INTERVAL '50 days',
    NOW() - INTERVAL '15 days'
  ),

  -- ANN-012: Archived - Finance - Old dues notice
  (
    'ae000001-0001-0001-0001-000000000012'::uuid,
    'December 2025 Service Charge Due',
    'This is a reminder that December 2025 service charges are now due.

Due Date: December 15, 2025

Payment can be made via bank transfer or at the estate office.',
    'Finance',
    'archived',
    'normal',
    false,
    NOW() - INTERVAL '60 days',
    NOW() - INTERVAL '30 days',
    NULL::uuid,
    NOW() - INTERVAL '65 days',
    NOW() - INTERVAL '30 days'
  )
) AS t(id, title, content, category_name, status, priority, is_pinned, published_at, expires_at, created_by, created_at, updated_at)
ON CONFLICT (id) DO UPDATE SET
  title = EXCLUDED.title,
  content = EXCLUDED.content,
  category_id = EXCLUDED.category_id,
  status = EXCLUDED.status,
  priority = EXCLUDED.priority,
  is_pinned = EXCLUDED.is_pinned,
  published_at = EXCLUDED.published_at,
  expires_at = EXCLUDED.expires_at,
  updated_at = NOW();


-- ============================================================================
-- ANNOUNCEMENT TARGETS (for selective targeting)
-- ============================================================================
-- Some announcements target specific audiences



-- ============================================================================
-- ANNOUNCEMENT READ RECEIPTS (tracking who read what)
-- ============================================================================
-- Sample read receipts for published announcements

INSERT INTO announcement_read_receipts (
  id,
  announcement_id,
  resident_id,
  read_at
)
VALUES
  -- ANN-001: Welcome announcement - high read rate
  ('ba000001-0001-0001-0001-000000000001'::uuid, 'ae000001-0001-0001-0001-000000000001'::uuid, 'aa000001-0001-0001-0001-000000000002'::uuid, NOW() - INTERVAL '29 days'),
  ('ba000001-0001-0001-0001-000000000002'::uuid, 'ae000001-0001-0001-0001-000000000001'::uuid, 'aa000001-0001-0001-0001-000000000003'::uuid, NOW() - INTERVAL '28 days'),
  ('ba000001-0001-0001-0001-000000000003'::uuid, 'ae000001-0001-0001-0001-000000000001'::uuid, 'aa000001-0001-0001-0001-000000000004'::uuid, NOW() - INTERVAL '28 days'),
  ('ba000001-0001-0001-0001-000000000004'::uuid, 'ae000001-0001-0001-0001-000000000001'::uuid, 'aa000001-0001-0001-0001-000000000005'::uuid, NOW() - INTERVAL '27 days'),
  ('ba000001-0001-0001-0001-000000000005'::uuid, 'ae000001-0001-0001-0001-000000000001'::uuid, 'aa000001-0001-0001-0001-000000000006'::uuid, NOW() - INTERVAL '27 days'),

  -- ANN-002: Security alert - very high read rate (pinned/urgent)
  ('ba000001-0001-0001-0001-000000000011'::uuid, 'ae000001-0001-0001-0001-000000000002'::uuid, 'aa000001-0001-0001-0001-000000000002'::uuid, NOW() - INTERVAL '14 days'),
  ('ba000001-0001-0001-0001-000000000012'::uuid, 'ae000001-0001-0001-0001-000000000002'::uuid, 'aa000001-0001-0001-0001-000000000003'::uuid, NOW() - INTERVAL '14 days'),
  ('ba000001-0001-0001-0001-000000000013'::uuid, 'ae000001-0001-0001-0001-000000000002'::uuid, 'aa000001-0001-0001-0001-000000000004'::uuid, NOW() - INTERVAL '13 days'),
  ('ba000001-0001-0001-0001-000000000014'::uuid, 'ae000001-0001-0001-0001-000000000002'::uuid, 'aa000001-0001-0001-0001-000000000005'::uuid, NOW() - INTERVAL '13 days'),
  ('ba000001-0001-0001-0001-000000000015'::uuid, 'ae000001-0001-0001-0001-000000000002'::uuid, 'aa000001-0001-0001-0001-000000000006'::uuid, NOW() - INTERVAL '13 days'),
  ('ba000001-0001-0001-0001-000000000016'::uuid, 'ae000001-0001-0001-0001-000000000002'::uuid, 'aa000001-0001-0001-0001-000000000007'::uuid, NOW() - INTERVAL '12 days'),
  ('ba000001-0001-0001-0001-000000000017'::uuid, 'ae000001-0001-0001-0001-000000000002'::uuid, 'aa000001-0001-0001-0001-000000000008'::uuid, NOW() - INTERVAL '12 days'),

  -- ANN-003: Finance notice - moderate read rate
  ('ba000001-0001-0001-0001-000000000021'::uuid, 'ae000001-0001-0001-0001-000000000003'::uuid, 'aa000001-0001-0001-0001-000000000002'::uuid, NOW() - INTERVAL '6 days'),
  ('ba000001-0001-0001-0001-000000000022'::uuid, 'ae000001-0001-0001-0001-000000000003'::uuid, 'aa000001-0001-0001-0001-000000000003'::uuid, NOW() - INTERVAL '5 days'),
  ('ba000001-0001-0001-0001-000000000023'::uuid, 'ae000001-0001-0001-0001-000000000003'::uuid, 'aa000001-0001-0001-0001-000000000004'::uuid, NOW() - INTERVAL '4 days'),

  -- ANN-005: AGM notice - owners reading
  ('ba000001-0001-0001-0001-000000000031'::uuid, 'ae000001-0001-0001-0001-000000000005'::uuid, 'aa000001-0001-0001-0001-000000000002'::uuid, NOW() - INTERVAL '9 days'),
  ('ba000001-0001-0001-0001-000000000032'::uuid, 'ae000001-0001-0001-0001-000000000005'::uuid, 'aa000001-0001-0001-0001-000000000003'::uuid, NOW() - INTERVAL '8 days'),
  ('ba000001-0001-0001-0001-000000000033'::uuid, 'ae000001-0001-0001-0001-000000000005'::uuid, 'aa000001-0001-0001-0001-000000000010'::uuid, NOW() - INTERVAL '7 days')
ON CONFLICT (id) DO UPDATE SET
  read_at = EXCLUDED.read_at;


-- ============================================================================
-- VERIFICATION
-- ============================================================================
DO $$
DECLARE
  v_announcements INT;
  v_receipts INT;
  v_published INT;
  v_draft INT;
  v_scheduled INT;
  v_archived INT;
BEGIN
  SELECT COUNT(*) INTO v_announcements FROM announcements WHERE id::text LIKE 'ae000001%';
  SELECT COUNT(*) INTO v_receipts FROM announcement_read_receipts WHERE id::text LIKE 'ba000001%';

  SELECT COUNT(*) INTO v_published FROM announcements WHERE id::text LIKE 'ae000001%' AND status = 'published';
  SELECT COUNT(*) INTO v_draft FROM announcements WHERE id::text LIKE 'ae000001%' AND status = 'draft';
  SELECT COUNT(*) INTO v_scheduled FROM announcements WHERE id::text LIKE 'ae000001%' AND status = 'scheduled';
  SELECT COUNT(*) INTO v_archived FROM announcements WHERE id::text LIKE 'ae000001%' AND status = 'archived';

  RAISE NOTICE '';
  RAISE NOTICE '=== Announcements Fixture Verification ===';
  RAISE NOTICE 'Total Announcements: % (target: 12)', v_announcements;
  RAISE NOTICE '  - Published: % (target: 6)', v_published;
  RAISE NOTICE '  - Draft: % (target: 2)', v_draft;
  RAISE NOTICE '  - Scheduled: % (target: 2)', v_scheduled;
  RAISE NOTICE '  - Archived: % (target: 2)', v_archived;
  RAISE NOTICE 'Read Receipts: %', v_receipts;
  RAISE NOTICE '==========================================';
END $$;
