-- Phase 15: Document Management System
-- Creates tables for document storage, categorization, and access logging

-- ============================================
-- 0. ADD DOCUMENTS TO PERMISSION CATEGORY ENUM
-- ============================================
ALTER TYPE permission_category ADD VALUE IF NOT EXISTS 'documents';

-- ============================================
-- 1. DOCUMENT CATEGORIES TABLE
-- ============================================
CREATE TABLE IF NOT EXISTS document_categories (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name VARCHAR(100) NOT NULL,
  description TEXT,
  is_resident_accessible BOOLEAN DEFAULT FALSE,
  is_active BOOLEAN DEFAULT TRUE,
  display_order INT DEFAULT 0,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Add unique constraint on name
ALTER TABLE document_categories ADD CONSTRAINT document_categories_name_unique UNIQUE (name);

-- Create index for active categories
CREATE INDEX idx_document_categories_active ON document_categories(is_active) WHERE is_active = TRUE;

-- ============================================
-- 2. DOCUMENTS TABLE
-- ============================================
CREATE TABLE IF NOT EXISTS documents (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  title VARCHAR(255) NOT NULL,
  description TEXT,
  file_name VARCHAR(255) NOT NULL,
  file_path VARCHAR(500) NOT NULL,
  file_type VARCHAR(50),
  file_size_bytes BIGINT,
  mime_type VARCHAR(100),
  category_id UUID REFERENCES document_categories(id) ON DELETE SET NULL,
  -- Optional: link to specific resident or house (for private docs)
  resident_id UUID REFERENCES residents(id) ON DELETE SET NULL,
  house_id UUID REFERENCES houses(id) ON DELETE SET NULL,
  -- Version control
  version INT DEFAULT 1,
  parent_document_id UUID REFERENCES documents(id) ON DELETE SET NULL,
  -- Metadata
  uploaded_by UUID NOT NULL REFERENCES profiles(id),
  is_archived BOOLEAN DEFAULT FALSE,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Create indexes for common queries
CREATE INDEX idx_documents_category ON documents(category_id);
CREATE INDEX idx_documents_uploaded_by ON documents(uploaded_by);
CREATE INDEX idx_documents_created_at ON documents(created_at DESC);
CREATE INDEX idx_documents_parent ON documents(parent_document_id) WHERE parent_document_id IS NOT NULL;
CREATE INDEX idx_documents_archived ON documents(is_archived) WHERE is_archived = FALSE;
CREATE INDEX idx_documents_resident ON documents(resident_id) WHERE resident_id IS NOT NULL;
CREATE INDEX idx_documents_house ON documents(house_id) WHERE house_id IS NOT NULL;

-- Full-text search index on title and description
CREATE INDEX idx_documents_search ON documents USING gin(to_tsvector('english', coalesce(title, '') || ' ' || coalesce(description, '')));

-- ============================================
-- 3. DOCUMENT ACCESS LOGS TABLE
-- ============================================
CREATE TABLE IF NOT EXISTS document_access_logs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  document_id UUID NOT NULL REFERENCES documents(id) ON DELETE CASCADE,
  accessed_by UUID NOT NULL REFERENCES profiles(id),
  action VARCHAR(50) NOT NULL,
  ip_address INET,
  user_agent TEXT,
  accessed_at TIMESTAMPTZ DEFAULT NOW()
);

-- Index for querying access history
CREATE INDEX idx_document_access_logs_document ON document_access_logs(document_id);
CREATE INDEX idx_document_access_logs_user ON document_access_logs(accessed_by);
CREATE INDEX idx_document_access_logs_time ON document_access_logs(accessed_at DESC);

-- ============================================
-- 4. TRIGGERS FOR UPDATED_AT
-- ============================================
CREATE OR REPLACE FUNCTION update_document_categories_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trigger_document_categories_updated_at
  BEFORE UPDATE ON document_categories
  FOR EACH ROW
  EXECUTE FUNCTION update_document_categories_updated_at();

CREATE OR REPLACE FUNCTION update_documents_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trigger_documents_updated_at
  BEFORE UPDATE ON documents
  FOR EACH ROW
  EXECUTE FUNCTION update_documents_updated_at();

-- ============================================
-- 5. SEED DATA - INITIAL CATEGORIES
-- ============================================
INSERT INTO document_categories (name, description, is_resident_accessible, display_order) VALUES
  ('Estate Policies', 'General estate rules and policies', TRUE, 1),
  ('Bylaws', 'Constitutional documents and bylaws', TRUE, 2),
  ('Financial Reports', 'Monthly and annual financial statements', FALSE, 3),
  ('Notices', 'Official notices and announcements', TRUE, 4),
  ('Forms', 'Application forms and templates', TRUE, 5),
  ('Meeting Minutes', 'EXCO and AGM meeting records', FALSE, 6)
ON CONFLICT (name) DO NOTHING;

-- ============================================
-- 6. ADD DOCUMENT PERMISSIONS
-- ============================================
INSERT INTO app_permissions (name, display_name, description, category) VALUES
  ('documents.view', 'View Documents', 'View documents in the document library', 'documents'),
  ('documents.upload', 'Upload Documents', 'Upload new documents', 'documents'),
  ('documents.update', 'Update Documents', 'Update document metadata', 'documents'),
  ('documents.delete', 'Delete Documents', 'Delete documents', 'documents'),
  ('documents.manage_categories', 'Manage Categories', 'Manage document categories', 'documents')
ON CONFLICT (name) DO NOTHING;

-- ============================================
-- 7. ASSIGN PERMISSIONS TO ROLES
-- ============================================

-- Get permission IDs
DO $$
DECLARE
  perm_view UUID;
  perm_upload UUID;
  perm_update UUID;
  perm_delete UUID;
  perm_manage_categories UUID;
  role_super_admin UUID := '3b76d76c-6261-406f-9b67-fed1f3f00279';
  role_chairman UUID := 'd9aa2711-ce4f-4c3d-a553-5b2b58c77b7d';
  role_vice_chairman UUID := 'b3145952-67de-4240-8b24-ed6210347922';
  role_financial_officer UUID := 'ea18f4f5-6e81-4b27-a1d1-57e868fa1171';
  role_security_officer UUID := 'e9ab347a-a33c-4001-827c-b1706f755c74';
  role_resident UUID := 'c20636f7-a9e7-4a65-9690-3d0d94a7d700';
  role_secretary UUID := 'a9db55c5-247a-49fd-b3f6-c26519c78881';
BEGIN
  -- Fetch permission IDs
  SELECT id INTO perm_view FROM app_permissions WHERE name = 'documents.view';
  SELECT id INTO perm_upload FROM app_permissions WHERE name = 'documents.upload';
  SELECT id INTO perm_update FROM app_permissions WHERE name = 'documents.update';
  SELECT id INTO perm_delete FROM app_permissions WHERE name = 'documents.delete';
  SELECT id INTO perm_manage_categories FROM app_permissions WHERE name = 'documents.manage_categories';

  -- Super Admin: All permissions
  INSERT INTO role_permissions (role_id, permission_id) VALUES
    (role_super_admin, perm_view),
    (role_super_admin, perm_upload),
    (role_super_admin, perm_update),
    (role_super_admin, perm_delete),
    (role_super_admin, perm_manage_categories)
  ON CONFLICT DO NOTHING;

  -- Chairman: All permissions
  INSERT INTO role_permissions (role_id, permission_id) VALUES
    (role_chairman, perm_view),
    (role_chairman, perm_upload),
    (role_chairman, perm_update),
    (role_chairman, perm_delete),
    (role_chairman, perm_manage_categories)
  ON CONFLICT DO NOTHING;

  -- Vice Chairman: All permissions
  INSERT INTO role_permissions (role_id, permission_id) VALUES
    (role_vice_chairman, perm_view),
    (role_vice_chairman, perm_upload),
    (role_vice_chairman, perm_update),
    (role_vice_chairman, perm_delete),
    (role_vice_chairman, perm_manage_categories)
  ON CONFLICT DO NOTHING;

  -- Financial Officer: View, Upload, Update (no delete, no manage categories)
  INSERT INTO role_permissions (role_id, permission_id) VALUES
    (role_financial_officer, perm_view),
    (role_financial_officer, perm_upload),
    (role_financial_officer, perm_update)
  ON CONFLICT DO NOTHING;

  -- Secretary: View, Upload, Update
  INSERT INTO role_permissions (role_id, permission_id) VALUES
    (role_secretary, perm_view),
    (role_secretary, perm_upload),
    (role_secretary, perm_update)
  ON CONFLICT DO NOTHING;

  -- Security Officer: View only
  INSERT INTO role_permissions (role_id, permission_id) VALUES
    (role_security_officer, perm_view)
  ON CONFLICT DO NOTHING;

  -- Resident: View only (filtered by category accessibility)
  INSERT INTO role_permissions (role_id, permission_id) VALUES
    (role_resident, perm_view)
  ON CONFLICT DO NOTHING;
END $$;

-- ============================================
-- 8. ROW LEVEL SECURITY POLICIES
-- ============================================

-- Enable RLS on all tables
ALTER TABLE document_categories ENABLE ROW LEVEL SECURITY;
ALTER TABLE documents ENABLE ROW LEVEL SECURITY;
ALTER TABLE document_access_logs ENABLE ROW LEVEL SECURITY;

-- Document Categories: All authenticated users can view active categories
CREATE POLICY "Authenticated users can view active categories"
  ON document_categories
  FOR SELECT
  TO authenticated
  USING (is_active = TRUE);

-- Document Categories: Only admins can manage categories
CREATE POLICY "Admins can manage categories"
  ON document_categories
  FOR ALL
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM profiles p
      JOIN role_permissions rp ON rp.role_id = p.role_id
      JOIN app_permissions ap ON ap.id = rp.permission_id
      WHERE p.id = auth.uid() AND ap.name = 'documents.manage_categories'
    )
  );

-- Documents: Users with view permission can see documents
-- Residents only see documents in accessible categories
CREATE POLICY "Users can view documents based on permissions"
  ON documents
  FOR SELECT
  TO authenticated
  USING (
    is_archived = FALSE
    AND (
      -- Users with document view permission (non-residents see all)
      EXISTS (
        SELECT 1 FROM profiles p
        JOIN role_permissions rp ON rp.role_id = p.role_id
        JOIN app_permissions ap ON ap.id = rp.permission_id
        JOIN app_roles ar ON ar.id = p.role_id
        WHERE p.id = auth.uid()
          AND ap.name = 'documents.view'
          AND ar.name != 'resident'
      )
      OR
      -- Residents see only accessible categories
      EXISTS (
        SELECT 1 FROM profiles p
        JOIN role_permissions rp ON rp.role_id = p.role_id
        JOIN app_permissions ap ON ap.id = rp.permission_id
        JOIN app_roles ar ON ar.id = p.role_id
        WHERE p.id = auth.uid()
          AND ap.name = 'documents.view'
          AND ar.name = 'resident'
          AND (
            category_id IS NULL
            OR EXISTS (
              SELECT 1 FROM document_categories dc
              WHERE dc.id = documents.category_id
                AND dc.is_resident_accessible = TRUE
            )
          )
      )
    )
  );

-- Documents: Users with upload permission can insert
CREATE POLICY "Users can upload documents"
  ON documents
  FOR INSERT
  TO authenticated
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM profiles p
      JOIN role_permissions rp ON rp.role_id = p.role_id
      JOIN app_permissions ap ON ap.id = rp.permission_id
      WHERE p.id = auth.uid() AND ap.name = 'documents.upload'
    )
  );

-- Documents: Users with update permission can update
CREATE POLICY "Users can update documents"
  ON documents
  FOR UPDATE
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM profiles p
      JOIN role_permissions rp ON rp.role_id = p.role_id
      JOIN app_permissions ap ON ap.id = rp.permission_id
      WHERE p.id = auth.uid() AND ap.name = 'documents.update'
    )
  );

-- Documents: Users with delete permission can delete
CREATE POLICY "Users can delete documents"
  ON documents
  FOR DELETE
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM profiles p
      JOIN role_permissions rp ON rp.role_id = p.role_id
      JOIN app_permissions ap ON ap.id = rp.permission_id
      WHERE p.id = auth.uid() AND ap.name = 'documents.delete'
    )
  );

-- Access Logs: Users can insert their own access logs
CREATE POLICY "Users can log their own access"
  ON document_access_logs
  FOR INSERT
  TO authenticated
  WITH CHECK (accessed_by = auth.uid());

-- Access Logs: Admins can view all logs
CREATE POLICY "Admins can view access logs"
  ON document_access_logs
  FOR SELECT
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM profiles p
      JOIN role_permissions rp ON rp.role_id = p.role_id
      JOIN app_permissions ap ON ap.id = rp.permission_id
      WHERE p.id = auth.uid() AND ap.name IN ('documents.manage_categories', 'audit.view')
    )
  );

-- ============================================
-- 9. STORAGE BUCKET AND POLICIES
-- ============================================

-- Create the documents storage bucket
INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES (
  'documents',
  'documents',
  false,
  52428800,  -- 50MB in bytes
  ARRAY['application/pdf', 'application/vnd.openxmlformats-officedocument.wordprocessingml.document', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet', 'text/plain']
)
ON CONFLICT (id) DO NOTHING;

-- Allow authenticated users with upload permission to upload files
CREATE POLICY "Users can upload documents to storage"
  ON storage.objects
  FOR INSERT
  TO authenticated
  WITH CHECK (
    bucket_id = 'documents'
    AND EXISTS (
      SELECT 1 FROM profiles p
      JOIN role_permissions rp ON rp.role_id = p.role_id
      JOIN app_permissions ap ON ap.id = rp.permission_id
      WHERE p.id = auth.uid() AND ap.name = 'documents.upload'
    )
  );

-- Allow authenticated users with view permission to download files
CREATE POLICY "Users can download documents from storage"
  ON storage.objects
  FOR SELECT
  TO authenticated
  USING (
    bucket_id = 'documents'
    AND EXISTS (
      SELECT 1 FROM profiles p
      JOIN role_permissions rp ON rp.role_id = p.role_id
      JOIN app_permissions ap ON ap.id = rp.permission_id
      WHERE p.id = auth.uid() AND ap.name = 'documents.view'
    )
  );

-- Allow users with delete permission to delete files
CREATE POLICY "Users can delete documents from storage"
  ON storage.objects
  FOR DELETE
  TO authenticated
  USING (
    bucket_id = 'documents'
    AND EXISTS (
      SELECT 1 FROM profiles p
      JOIN role_permissions rp ON rp.role_id = p.role_id
      JOIN app_permissions ap ON ap.id = rp.permission_id
      WHERE p.id = auth.uid() AND ap.name = 'documents.delete'
    )
  );

-- Allow users with update permission to update files
CREATE POLICY "Users can update documents in storage"
  ON storage.objects
  FOR UPDATE
  TO authenticated
  USING (
    bucket_id = 'documents'
    AND EXISTS (
      SELECT 1 FROM profiles p
      JOIN role_permissions rp ON rp.role_id = p.role_id
      JOIN app_permissions ap ON ap.id = rp.permission_id
      WHERE p.id = auth.uid() AND ap.name = 'documents.update'
    )
  );
