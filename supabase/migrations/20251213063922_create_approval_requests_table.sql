-- Create approval_requests table for maker-checker workflow
-- Used when financial_secretary makes changes that require chairman approval

-- Create enum for approval status
CREATE TYPE approval_status AS ENUM ('pending', 'approved', 'rejected');

-- Create enum for request types
CREATE TYPE approval_request_type AS ENUM ('billing_profile_effective_date', 'house_plots_change');

-- Create the approval_requests table
CREATE TABLE approval_requests (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  request_type approval_request_type NOT NULL,
  entity_type TEXT NOT NULL,           -- 'billing_profile' or 'house'
  entity_id UUID NOT NULL,             -- ID of the entity being changed
  requested_changes JSONB NOT NULL,    -- { field: value } of proposed changes
  current_values JSONB NOT NULL,       -- { field: value } of current state
  reason TEXT,                         -- Why this change is needed
  status approval_status NOT NULL DEFAULT 'pending',
  requested_by UUID NOT NULL REFERENCES profiles(id) ON DELETE RESTRICT,
  reviewed_by UUID REFERENCES profiles(id) ON DELETE SET NULL,
  reviewed_at TIMESTAMPTZ,
  review_notes TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Index for pending requests (most common query)
CREATE INDEX idx_approval_requests_pending ON approval_requests(status) WHERE status = 'pending';

-- Index for requests by entity
CREATE INDEX idx_approval_requests_entity ON approval_requests(entity_type, entity_id);

-- Index for requests by requester
CREATE INDEX idx_approval_requests_requester ON approval_requests(requested_by);

-- Prevent multiple pending requests for the same entity and field
CREATE UNIQUE INDEX idx_approval_requests_unique_pending 
ON approval_requests(entity_type, entity_id, request_type) 
WHERE status = 'pending';

-- Enable RLS
ALTER TABLE approval_requests ENABLE ROW LEVEL SECURITY;

-- Policy: Admin and chairman can view all requests
CREATE POLICY "Admin and chairman can view all approval requests"
ON approval_requests FOR SELECT
TO authenticated
USING (
  get_my_role() IN ('admin', 'chairman')
);

-- Policy: Financial secretary can view their own requests
CREATE POLICY "Users can view their own approval requests"
ON approval_requests FOR SELECT
TO authenticated
USING (
  requested_by = auth.uid()
);

-- Policy: Financial secretary can create requests
CREATE POLICY "Financial secretary can create approval requests"
ON approval_requests FOR INSERT
TO authenticated
WITH CHECK (
  get_my_role() IN ('admin', 'chairman', 'financial_secretary')
  AND requested_by = auth.uid()
);

-- Policy: Admin and chairman can update requests (approve/reject)
CREATE POLICY "Admin and chairman can update approval requests"
ON approval_requests FOR UPDATE
TO authenticated
USING (
  get_my_role() IN ('admin', 'chairman')
)
WITH CHECK (
  get_my_role() IN ('admin', 'chairman')
);

-- Add comments
COMMENT ON TABLE approval_requests IS 'Stores pending approval requests for maker-checker workflow';
COMMENT ON COLUMN approval_requests.request_type IS 'Type of change being requested';
COMMENT ON COLUMN approval_requests.requested_changes IS 'JSON object with proposed field values';
COMMENT ON COLUMN approval_requests.current_values IS 'JSON object with current field values for comparison';
