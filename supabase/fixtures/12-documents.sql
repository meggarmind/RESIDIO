-- ============================================================================
-- Residio Comprehensive Seed Data
-- File: 12-documents.sql
-- Description: 25 documents across various categories
-- Dependencies: 01-reference-data.sql, 02-residents.sql
-- ============================================================================

-- ============================================================================
-- DOCUMENTS (25 total)
-- ============================================================================
-- Category Distribution:
--   - Estate Rules: 5
--   - Financial Reports: 8
--   - Meeting Minutes: 6
--   - Legal Documents: 3
--   - Forms & Templates: 3
--
-- NOTE: This seeds document metadata only (no actual file uploads)
-- ============================================================================

-- First, ensure document categories exist
INSERT INTO document_categories (id, name, description, is_resident_accessible, is_active, display_order)
VALUES
  ('dc000001-0001-0001-0001-000000000001'::uuid, 'Estate Rules', 'Estate rules and regulations', true, true, 1),
  ('dc000001-0001-0001-0001-000000000002'::uuid, 'Financial Reports', 'Financial statements and reports', true, true, 2),
  ('dc000001-0001-0001-0001-000000000003'::uuid, 'Meeting Minutes', 'Minutes from estate meetings', true, true, 3),
  ('dc000001-0001-0001-0001-000000000004'::uuid, 'Legal Documents', 'Legal and compliance documents', true, true, 4),
  ('dc000001-0001-0001-0001-000000000005'::uuid, 'Forms & Templates', 'Downloadable forms and templates', true, true, 5)
ON CONFLICT (id) DO UPDATE SET
  name = EXCLUDED.name,
  description = EXCLUDED.description,
  is_resident_accessible = EXCLUDED.is_resident_accessible,
  display_order = EXCLUDED.display_order;


-- Insert documents
INSERT INTO documents (
  id,
  title,
  description,
  file_name,
  file_path,
  file_type,
  file_size_bytes,
  mime_type,
  category_id,
  uploaded_by,
  is_archived,
  created_at,
  updated_at
)
VALUES
  -- ========== ESTATE RULES (5) ==========

  -- DOC-001: Estate Constitution
  (
    'ss000001-0001-0001-0001-000000000001'::uuid,
    'Residio Estate Constitution',
    'The official constitution governing the estate, including ownership rights, responsibilities, and governance structure.',
    'residio-estate-constitution-2024.pdf',
    'documents/estate-rules/residio-estate-constitution-2024.pdf',
    'pdf',
    2457600,  -- ~2.4MB
    'application/pdf',
    'dc000001-0001-0001-0001-000000000001'::uuid,
    'aa000001-0001-0001-0001-000000000001'::uuid,
    false,
    NOW() - INTERVAL '365 days',
    NOW() - INTERVAL '30 days'
  ),

  -- DOC-002: Resident Handbook
  (
    'ss000001-0001-0001-0001-000000000002'::uuid,
    'Resident Handbook 2025',
    'Comprehensive guide for residents covering rules, procedures, facilities, and contact information.',
    'resident-handbook-2025.pdf',
    'documents/estate-rules/resident-handbook-2025.pdf',
    'pdf',
    1843200,  -- ~1.8MB
    'application/pdf',
    'dc000001-0001-0001-0001-000000000001'::uuid,
    'aa000001-0001-0001-0001-000000000001'::uuid,
    false,
    NOW() - INTERVAL '180 days',
    NOW() - INTERVAL '60 days'
  ),

  -- DOC-003: Security Protocols
  (
    'ss000001-0001-0001-0001-000000000003'::uuid,
    'Security Protocols and Procedures',
    'Security guidelines for gate access, visitor management, and emergency procedures.',
    'security-protocols-2025.pdf',
    'documents/estate-rules/security-protocols-2025.pdf',
    'pdf',
    921600,  -- ~900KB
    'application/pdf',
    'dc000001-0001-0001-0001-000000000001'::uuid,
    'aa000001-0001-0001-0001-000000000001'::uuid,
    false,
    NOW() - INTERVAL '120 days',
    NOW() - INTERVAL '45 days'
  ),

  -- DOC-004: Building Guidelines
  (
    'ss000001-0001-0001-0001-000000000004'::uuid,
    'Building and Renovation Guidelines',
    'Guidelines for construction, renovation, and modification of properties within the estate.',
    'building-guidelines-2024.pdf',
    'documents/estate-rules/building-guidelines-2024.pdf',
    'pdf',
    3072000,  -- ~3MB
    'application/pdf',
    'dc000001-0001-0001-0001-000000000001'::uuid,
    'aa000001-0001-0001-0001-000000000001'::uuid,
    false,
    NOW() - INTERVAL '400 days',
    NOW() - INTERVAL '200 days'
  ),

  -- DOC-005: Parking Rules
  (
    'ss000001-0001-0001-0001-000000000005'::uuid,
    'Parking Rules and Regulations',
    'Rules governing vehicle parking, guest parking, and commercial vehicle restrictions.',
    'parking-rules-2025.pdf',
    'documents/estate-rules/parking-rules-2025.pdf',
    'pdf',
    512000,  -- ~500KB
    'application/pdf',
    'dc000001-0001-0001-0001-000000000001'::uuid,
    'aa000001-0001-0001-0001-000000000001'::uuid,
    false,
    NOW() - INTERVAL '90 days',
    NOW() - INTERVAL '90 days'
  ),

  -- ========== FINANCIAL REPORTS (8) ==========

  -- DOC-006: Annual Report 2024
  (
    'ss000001-0001-0001-0001-000000000006'::uuid,
    'Annual Financial Report 2024',
    'Comprehensive annual financial report including income, expenses, and reserves.',
    'annual-report-2024.pdf',
    'documents/financial/annual-report-2024.pdf',
    'pdf',
    4096000,  -- ~4MB
    'application/pdf',
    'dc000001-0001-0001-0001-000000000002'::uuid,
    'aa000001-0001-0001-0001-000000000001'::uuid,
    false,
    NOW() - INTERVAL '45 days',
    NOW() - INTERVAL '45 days'
  ),

  -- DOC-007 to DOC-013: Quarterly Reports
  (
    'ss000001-0001-0001-0001-000000000007'::uuid,
    'Q1 2025 Financial Statement',
    'First quarter financial statement for 2025.',
    'q1-2025-financial-statement.pdf',
    'documents/financial/q1-2025-financial-statement.pdf',
    'pdf',
    1024000,
    'application/pdf',
    'dc000001-0001-0001-0001-000000000002'::uuid,
    'aa000001-0001-0001-0001-000000000001'::uuid,
    false,
    NOW() - INTERVAL '270 days',
    NOW() - INTERVAL '270 days'
  ),

  (
    'ss000001-0001-0001-0001-000000000008'::uuid,
    'Q2 2025 Financial Statement',
    'Second quarter financial statement for 2025.',
    'q2-2025-financial-statement.pdf',
    'documents/financial/q2-2025-financial-statement.pdf',
    'pdf',
    1126400,
    'application/pdf',
    'dc000001-0001-0001-0001-000000000002'::uuid,
    'aa000001-0001-0001-0001-000000000001'::uuid,
    false,
    NOW() - INTERVAL '180 days',
    NOW() - INTERVAL '180 days'
  ),

  (
    'ss000001-0001-0001-0001-000000000009'::uuid,
    'Q3 2025 Financial Statement',
    'Third quarter financial statement for 2025.',
    'q3-2025-financial-statement.pdf',
    'documents/financial/q3-2025-financial-statement.pdf',
    'pdf',
    1228800,
    'application/pdf',
    'dc000001-0001-0001-0001-000000000002'::uuid,
    'aa000001-0001-0001-0001-000000000001'::uuid,
    false,
    NOW() - INTERVAL '90 days',
    NOW() - INTERVAL '90 days'
  ),

  (
    'ss000001-0001-0001-0001-000000000010'::uuid,
    'Service Charge Schedule 2026',
    'Approved service charge rates for 2026.',
    'service-charge-schedule-2026.pdf',
    'documents/financial/service-charge-schedule-2026.pdf',
    'pdf',
    307200,
    'application/pdf',
    'dc000001-0001-0001-0001-000000000002'::uuid,
    'aa000001-0001-0001-0001-000000000001'::uuid,
    false,
    NOW() - INTERVAL '30 days',
    NOW() - INTERVAL '30 days'
  ),

  (
    'ss000001-0001-0001-0001-000000000011'::uuid,
    'Development Levy Breakdown 2025',
    'Detailed breakdown of the 2025 development levy and planned projects.',
    'development-levy-breakdown-2025.pdf',
    'documents/financial/development-levy-breakdown-2025.pdf',
    'pdf',
    819200,
    'application/pdf',
    'dc000001-0001-0001-0001-000000000002'::uuid,
    'aa000001-0001-0001-0001-000000000001'::uuid,
    false,
    NOW() - INTERVAL '200 days',
    NOW() - INTERVAL '200 days'
  ),

  (
    'ss000001-0001-0001-0001-000000000012'::uuid,
    'Audit Report 2024',
    'External audit report for financial year 2024.',
    'audit-report-2024.pdf',
    'documents/financial/audit-report-2024.pdf',
    'pdf',
    5120000,  -- ~5MB
    'application/pdf',
    'dc000001-0001-0001-0001-000000000002'::uuid,
    'aa000001-0001-0001-0001-000000000001'::uuid,
    false,
    NOW() - INTERVAL '60 days',
    NOW() - INTERVAL '60 days'
  ),

  (
    'ss000001-0001-0001-0001-000000000013'::uuid,
    'Bank Reconciliation Dec 2025',
    'Bank reconciliation statement for December 2025.',
    'bank-reconciliation-dec-2025.xlsx',
    'documents/financial/bank-reconciliation-dec-2025.xlsx',
    'xlsx',
    256000,
    'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    'dc000001-0001-0001-0001-000000000002'::uuid,
    'aa000001-0001-0001-0001-000000000001'::uuid,
    false,
    NOW() - INTERVAL '7 days',
    NOW() - INTERVAL '7 days'
  ),

  -- ========== MEETING MINUTES (6) ==========

  (
    'ss000001-0001-0001-0001-000000000014'::uuid,
    'AGM Minutes - March 2025',
    'Minutes from the Annual General Meeting held in March 2025.',
    'agm-minutes-march-2025.pdf',
    'documents/minutes/agm-minutes-march-2025.pdf',
    'pdf',
    614400,
    'application/pdf',
    'dc000001-0001-0001-0001-000000000003'::uuid,
    'aa000001-0001-0001-0001-000000000001'::uuid,
    false,
    NOW() - INTERVAL '300 days',
    NOW() - INTERVAL '300 days'
  ),

  (
    'ss000001-0001-0001-0001-000000000015'::uuid,
    'Executive Committee Meeting - October 2025',
    'Minutes from the Executive Committee meeting in October 2025.',
    'exco-minutes-oct-2025.pdf',
    'documents/minutes/exco-minutes-oct-2025.pdf',
    'pdf',
    409600,
    'application/pdf',
    'dc000001-0001-0001-0001-000000000003'::uuid,
    'aa000001-0001-0001-0001-000000000001'::uuid,
    false,
    NOW() - INTERVAL '75 days',
    NOW() - INTERVAL '75 days'
  ),

  (
    'ss000001-0001-0001-0001-000000000016'::uuid,
    'Executive Committee Meeting - November 2025',
    'Minutes from the Executive Committee meeting in November 2025.',
    'exco-minutes-nov-2025.pdf',
    'documents/minutes/exco-minutes-nov-2025.pdf',
    'pdf',
    389120,
    'application/pdf',
    'dc000001-0001-0001-0001-000000000003'::uuid,
    'aa000001-0001-0001-0001-000000000001'::uuid,
    false,
    NOW() - INTERVAL '45 days',
    NOW() - INTERVAL '45 days'
  ),

  (
    'ss000001-0001-0001-0001-000000000017'::uuid,
    'Executive Committee Meeting - December 2025',
    'Minutes from the Executive Committee meeting in December 2025.',
    'exco-minutes-dec-2025.pdf',
    'documents/minutes/exco-minutes-dec-2025.pdf',
    'pdf',
    430080,
    'application/pdf',
    'dc000001-0001-0001-0001-000000000003'::uuid,
    'aa000001-0001-0001-0001-000000000001'::uuid,
    false,
    NOW() - INTERVAL '15 days',
    NOW() - INTERVAL '15 days'
  ),

  (
    'ss000001-0001-0001-0001-000000000018'::uuid,
    'Security Committee Meeting - Q4 2025',
    'Minutes from the Security Committee review meeting.',
    'security-committee-q4-2025.pdf',
    'documents/minutes/security-committee-q4-2025.pdf',
    'pdf',
    307200,
    'application/pdf',
    'dc000001-0001-0001-0001-000000000003'::uuid,
    'aa000001-0001-0001-0001-000000000001'::uuid,
    false,
    NOW() - INTERVAL '20 days',
    NOW() - INTERVAL '20 days'
  ),

  (
    'ss000001-0001-0001-0001-000000000019'::uuid,
    'Special General Meeting - Emergency Levy',
    'Minutes from the SGM regarding the emergency infrastructure levy.',
    'sgm-minutes-emergency-levy.pdf',
    'documents/minutes/sgm-minutes-emergency-levy.pdf',
    'pdf',
    512000,
    'application/pdf',
    'dc000001-0001-0001-0001-000000000003'::uuid,
    'aa000001-0001-0001-0001-000000000001'::uuid,
    false,
    NOW() - INTERVAL '150 days',
    NOW() - INTERVAL '150 days'
  ),

  -- ========== LEGAL DOCUMENTS (3) ==========

  (
    'ss000001-0001-0001-0001-000000000020'::uuid,
    'Deed of Assignment Template',
    'Standard deed of assignment template for property transfers within the estate.',
    'deed-of-assignment-template.pdf',
    'documents/legal/deed-of-assignment-template.pdf',
    'pdf',
    716800,
    'application/pdf',
    'dc000001-0001-0001-0001-000000000004'::uuid,
    'aa000001-0001-0001-0001-000000000001'::uuid,
    false,
    NOW() - INTERVAL '500 days',
    NOW() - INTERVAL '100 days'
  ),

  (
    'ss000001-0001-0001-0001-000000000021'::uuid,
    'Estate By-Laws 2024',
    'Updated estate by-laws as amended in 2024.',
    'estate-bylaws-2024.pdf',
    'documents/legal/estate-bylaws-2024.pdf',
    'pdf',
    1638400,
    'application/pdf',
    'dc000001-0001-0001-0001-000000000004'::uuid,
    'aa000001-0001-0001-0001-000000000001'::uuid,
    false,
    NOW() - INTERVAL '400 days',
    NOW() - INTERVAL '400 days'
  ),

  (
    'ss000001-0001-0001-0001-000000000022'::uuid,
    'Tenancy Agreement Guidelines',
    'Guidelines and template for tenancy agreements within the estate.',
    'tenancy-agreement-guidelines.pdf',
    'documents/legal/tenancy-agreement-guidelines.pdf',
    'pdf',
    921600,
    'application/pdf',
    'dc000001-0001-0001-0001-000000000004'::uuid,
    'aa000001-0001-0001-0001-000000000001'::uuid,
    false,
    NOW() - INTERVAL '250 days',
    NOW() - INTERVAL '250 days'
  ),

  -- ========== FORMS & TEMPLATES (3) ==========

  (
    'ss000001-0001-0001-0001-000000000023'::uuid,
    'Visitor Pre-Registration Form',
    'Form for pre-registering visitors and contractors.',
    'visitor-registration-form.pdf',
    'documents/forms/visitor-registration-form.pdf',
    'pdf',
    204800,
    'application/pdf',
    'dc000001-0001-0001-0001-000000000005'::uuid,
    'aa000001-0001-0001-0001-000000000001'::uuid,
    false,
    NOW() - INTERVAL '100 days',
    NOW() - INTERVAL '50 days'
  ),

  (
    'ss000001-0001-0001-0001-000000000024'::uuid,
    'Renovation Request Form',
    'Application form for property renovation and modification approvals.',
    'renovation-request-form.pdf',
    'documents/forms/renovation-request-form.pdf',
    'pdf',
    256000,
    'application/pdf',
    'dc000001-0001-0001-0001-000000000005'::uuid,
    'aa000001-0001-0001-0001-000000000001'::uuid,
    false,
    NOW() - INTERVAL '180 days',
    NOW() - INTERVAL '180 days'
  ),

  (
    'ss000001-0001-0001-0001-000000000025'::uuid,
    'Change of Ownership Notification Form',
    'Form to notify the estate of property ownership changes.',
    'ownership-change-form.pdf',
    'documents/forms/ownership-change-form.pdf',
    'pdf',
    307200,
    'application/pdf',
    'dc000001-0001-0001-0001-000000000005'::uuid,
    'aa000001-0001-0001-0001-000000000001'::uuid,
    false,
    NOW() - INTERVAL '200 days',
    NOW() - INTERVAL '200 days'
  )
ON CONFLICT (id) DO UPDATE SET
  title = EXCLUDED.title,
  description = EXCLUDED.description,
  file_name = EXCLUDED.file_name,
  file_path = EXCLUDED.file_path,
  file_type = EXCLUDED.file_type,
  file_size_bytes = EXCLUDED.file_size_bytes,
  category_id = EXCLUDED.category_id,
  updated_at = NOW();


-- ============================================================================
-- DOCUMENT ACCESS LOGS (sample of who accessed what)
-- ============================================================================

INSERT INTO document_access_logs (
  id,
  document_id,
  accessed_by,
  action,
  accessed_at
)
VALUES
  -- DOC-001: Constitution - high access
  ('tt000001-0001-0001-0001-000000000001'::uuid, 'ss000001-0001-0001-0001-000000000001'::uuid, 'aa000001-0001-0001-0001-000000000002'::uuid, 'view', NOW() - INTERVAL '25 days'),
  ('tt000001-0001-0001-0001-000000000002'::uuid, 'ss000001-0001-0001-0001-000000000001'::uuid, 'aa000001-0001-0001-0001-000000000003'::uuid, 'view', NOW() - INTERVAL '20 days'),
  ('tt000001-0001-0001-0001-000000000003'::uuid, 'ss000001-0001-0001-0001-000000000001'::uuid, 'aa000001-0001-0001-0001-000000000002'::uuid, 'download', NOW() - INTERVAL '15 days'),
  ('tt000001-0001-0001-0001-000000000004'::uuid, 'ss000001-0001-0001-0001-000000000001'::uuid, 'aa000001-0001-0001-0001-000000000004'::uuid, 'view', NOW() - INTERVAL '10 days'),

  -- DOC-002: Handbook - very high access
  ('tt000001-0001-0001-0001-000000000011'::uuid, 'ss000001-0001-0001-0001-000000000002'::uuid, 'aa000001-0001-0001-0001-000000000002'::uuid, 'view', NOW() - INTERVAL '170 days'),
  ('tt000001-0001-0001-0001-000000000012'::uuid, 'ss000001-0001-0001-0001-000000000002'::uuid, 'aa000001-0001-0001-0001-000000000003'::uuid, 'download', NOW() - INTERVAL '150 days'),
  ('tt000001-0001-0001-0001-000000000013'::uuid, 'ss000001-0001-0001-0001-000000000002'::uuid, 'aa000001-0001-0001-0001-000000000004'::uuid, 'view', NOW() - INTERVAL '120 days'),
  ('tt000001-0001-0001-0001-000000000014'::uuid, 'ss000001-0001-0001-0001-000000000002'::uuid, 'aa000001-0001-0001-0001-000000000005'::uuid, 'view', NOW() - INTERVAL '90 days'),
  ('tt000001-0001-0001-0001-000000000015'::uuid, 'ss000001-0001-0001-0001-000000000002'::uuid, 'aa000001-0001-0001-0001-000000000006'::uuid, 'download', NOW() - INTERVAL '60 days'),

  -- DOC-006: Annual Report 2024 - moderate access
  ('tt000001-0001-0001-0001-000000000021'::uuid, 'ss000001-0001-0001-0001-000000000006'::uuid, 'aa000001-0001-0001-0001-000000000002'::uuid, 'view', NOW() - INTERVAL '40 days'),
  ('tt000001-0001-0001-0001-000000000022'::uuid, 'ss000001-0001-0001-0001-000000000006'::uuid, 'aa000001-0001-0001-0001-000000000003'::uuid, 'download', NOW() - INTERVAL '35 days'),
  ('tt000001-0001-0001-0001-000000000023'::uuid, 'ss000001-0001-0001-0001-000000000006'::uuid, 'aa000001-0001-0001-0001-000000000010'::uuid, 'view', NOW() - INTERVAL '30 days'),

  -- DOC-010: Service Charge Schedule 2026 - high access (recent)
  ('tt000001-0001-0001-0001-000000000031'::uuid, 'ss000001-0001-0001-0001-000000000010'::uuid, 'aa000001-0001-0001-0001-000000000002'::uuid, 'view', NOW() - INTERVAL '28 days'),
  ('tt000001-0001-0001-0001-000000000032'::uuid, 'ss000001-0001-0001-0001-000000000010'::uuid, 'aa000001-0001-0001-0001-000000000003'::uuid, 'download', NOW() - INTERVAL '25 days'),
  ('tt000001-0001-0001-0001-000000000033'::uuid, 'ss000001-0001-0001-0001-000000000010'::uuid, 'aa000001-0001-0001-0001-000000000004'::uuid, 'view', NOW() - INTERVAL '20 days'),
  ('tt000001-0001-0001-0001-000000000034'::uuid, 'ss000001-0001-0001-0001-000000000010'::uuid, 'aa000001-0001-0001-0001-000000000005'::uuid, 'download', NOW() - INTERVAL '15 days'),
  ('tt000001-0001-0001-0001-000000000035'::uuid, 'ss000001-0001-0001-0001-000000000010'::uuid, 'aa000001-0001-0001-0001-000000000006'::uuid, 'view', NOW() - INTERVAL '10 days'),

  -- DOC-023: Visitor Form - frequent downloads
  ('tt000001-0001-0001-0001-000000000041'::uuid, 'ss000001-0001-0001-0001-000000000023'::uuid, 'aa000001-0001-0001-0001-000000000002'::uuid, 'download', NOW() - INTERVAL '45 days'),
  ('tt000001-0001-0001-0001-000000000042'::uuid, 'ss000001-0001-0001-0001-000000000023'::uuid, 'aa000001-0001-0001-0001-000000000003'::uuid, 'download', NOW() - INTERVAL '30 days'),
  ('tt000001-0001-0001-0001-000000000043'::uuid, 'ss000001-0001-0001-0001-000000000023'::uuid, 'aa000001-0001-0001-0001-000000000004'::uuid, 'download', NOW() - INTERVAL '20 days'),
  ('tt000001-0001-0001-0001-000000000044'::uuid, 'ss000001-0001-0001-0001-000000000023'::uuid, 'aa000001-0001-0001-0001-000000000005'::uuid, 'download', NOW() - INTERVAL '10 days'),
  ('tt000001-0001-0001-0001-000000000045'::uuid, 'ss000001-0001-0001-0001-000000000023'::uuid, 'aa000001-0001-0001-0001-000000000006'::uuid, 'download', NOW() - INTERVAL '5 days')
ON CONFLICT (id) DO UPDATE SET
  action = EXCLUDED.action,
  accessed_at = EXCLUDED.accessed_at;


-- ============================================================================
-- VERIFICATION
-- ============================================================================
DO $$
DECLARE
  v_categories INT;
  v_documents INT;
  v_access_logs INT;
  v_estate_rules INT;
  v_financial INT;
  v_minutes INT;
  v_legal INT;
  v_forms INT;
BEGIN
  SELECT COUNT(*) INTO v_categories FROM document_categories WHERE id::text LIKE 'dc000001%';
  SELECT COUNT(*) INTO v_documents FROM documents WHERE id::text LIKE 'ss000001%';
  SELECT COUNT(*) INTO v_access_logs FROM document_access_logs WHERE id::text LIKE 'tt000001%';

  SELECT COUNT(*) INTO v_estate_rules FROM documents d JOIN document_categories c ON d.category_id = c.id WHERE d.id::text LIKE 'ss000001%' AND c.name = 'Estate Rules';
  SELECT COUNT(*) INTO v_financial FROM documents d JOIN document_categories c ON d.category_id = c.id WHERE d.id::text LIKE 'ss000001%' AND c.name = 'Financial Reports';
  SELECT COUNT(*) INTO v_minutes FROM documents d JOIN document_categories c ON d.category_id = c.id WHERE d.id::text LIKE 'ss000001%' AND c.name = 'Meeting Minutes';
  SELECT COUNT(*) INTO v_legal FROM documents d JOIN document_categories c ON d.category_id = c.id WHERE d.id::text LIKE 'ss000001%' AND c.name = 'Legal Documents';
  SELECT COUNT(*) INTO v_forms FROM documents d JOIN document_categories c ON d.category_id = c.id WHERE d.id::text LIKE 'ss000001%' AND c.name = 'Forms & Templates';

  RAISE NOTICE '';
  RAISE NOTICE '=== Documents Fixture Verification ===';
  RAISE NOTICE 'Document Categories: % (target: 5)', v_categories;
  RAISE NOTICE 'Total Documents: % (target: 25)', v_documents;
  RAISE NOTICE '  By Category:';
  RAISE NOTICE '    - Estate Rules: % (target: 5)', v_estate_rules;
  RAISE NOTICE '    - Financial Reports: % (target: 8)', v_financial;
  RAISE NOTICE '    - Meeting Minutes: % (target: 6)', v_minutes;
  RAISE NOTICE '    - Legal Documents: % (target: 3)', v_legal;
  RAISE NOTICE '    - Forms & Templates: % (target: 3)', v_forms;
  RAISE NOTICE 'Document Access Logs: %', v_access_logs;
  RAISE NOTICE '======================================';
END $$;
