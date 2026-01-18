-- Migration: Add Hybrid Payments support (2026-01-18)
-- 1. Update payment_records table
-- 2. Create payment-proofs storage bucket
-- 3. Update approval_requests metadata

BEGIN;

-- 1. Update payment_records table
ALTER TABLE public.payment_records 
ADD COLUMN IF NOT EXISTS proof_url TEXT,
ADD COLUMN IF NOT EXISTS approval_request_id UUID REFERENCES public.approval_requests(id);

-- 2. Create payment-proofs storage bucket
-- We use the storage.buckets table directly.
INSERT INTO storage.buckets (id, name, public)
VALUES ('payment-proofs', 'payment-proofs', false)
ON CONFLICT (id) DO NOTHING;

-- RLS for storage.objects
-- Allow residents to upload to their own folder within payment-proofs
-- Folder structure: payment-proofs/resident_id/filename
DROP POLICY IF EXISTS "Residents can upload their own payment proofs" ON storage.objects;
CREATE POLICY "Residents can upload their own payment proofs"
ON storage.objects FOR INSERT
TO authenticated
WITH CHECK (
    bucket_id = 'payment-proofs' AND
    (storage.foldername(name))[1] = auth.uid()::text
);

DROP POLICY IF EXISTS "Residents can view their own payment proofs" ON storage.objects;
CREATE POLICY "Residents can view their own payment proofs"
ON storage.objects FOR SELECT
TO authenticated
USING (
    bucket_id = 'payment-proofs' AND
    (storage.foldername(name))[1] = auth.uid()::text
);

DROP POLICY IF EXISTS "Admins can view all payment proofs" ON storage.objects;
CREATE POLICY "Admins can view all payment proofs"
ON storage.objects FOR SELECT
TO authenticated
USING (
    bucket_id = 'payment-proofs' AND
    (
        SELECT name FROM app_roles ar 
        JOIN profiles pr ON pr.role_id = ar.id 
        WHERE pr.id = auth.uid()
    ) IN ('super_admin', 'chairman', 'financial_officer')
);

-- 3. Update approval_requests table comment to include new type
COMMENT ON TABLE public.approval_requests IS
'Maker-checker workflow for sensitive operations.
Valid request_type values:
- billing_profile_effective_date: Change to billing profile effective date
- house_plots_change: Change to house number of plots
- bank_account_create: Create new bank account
- bank_account_update: Update existing bank account
- bank_account_delete: Delete bank account
- manual_payment_verification: Verification of uploaded payment proof (NEW)

Valid entity_type values:
- billing_profile
- house
- estate_bank_account
- payment_record (NEW)';

COMMIT;
