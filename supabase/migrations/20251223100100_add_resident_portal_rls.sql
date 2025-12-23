-- Migration: Add Resident Portal RLS Policies
-- Purpose: Allow residents to access their own data via portal
-- Phase 12: Resident View Portal

-- =====================================================
-- 1. RLS Policies for residents table
-- =====================================================
-- Allow residents to view and update their own record

-- Policy: Residents can view their own record
CREATE POLICY "Residents can view own record"
ON public.residents
FOR SELECT
TO authenticated
USING (
  id = public.get_my_resident_id()
);

-- Policy: Residents can update limited fields on their own record
-- Note: Field-level restrictions are enforced in server actions
CREATE POLICY "Residents can update own contact info"
ON public.residents
FOR UPDATE
TO authenticated
USING (
  id = public.get_my_resident_id()
)
WITH CHECK (
  id = public.get_my_resident_id()
);

-- =====================================================
-- 2. RLS Policies for invoices table
-- =====================================================
-- Allow residents to view their own invoices

-- Policy: Residents can view invoices where they are the billed party
CREATE POLICY "Residents can view own invoices"
ON public.invoices
FOR SELECT
TO authenticated
USING (
  resident_id = public.get_my_resident_id()
);

-- =====================================================
-- 3. RLS Policies for payment_records table
-- =====================================================
-- Allow residents to view their own payment history

-- Policy: Residents can view payments where they are the payer
CREATE POLICY "Residents can view own payments"
ON public.payment_records
FOR SELECT
TO authenticated
USING (
  resident_id = public.get_my_resident_id()
);

-- =====================================================
-- 4. RLS Policies for security_contacts table
-- =====================================================
-- Allow residents to manage their own security contacts

-- Policy: Residents can view their own security contacts
CREATE POLICY "Residents can view own security contacts"
ON public.security_contacts
FOR SELECT
TO authenticated
USING (
  resident_id = public.get_my_resident_id()
);

-- Policy: Residents can create their own security contacts
CREATE POLICY "Residents can create own security contacts"
ON public.security_contacts
FOR INSERT
TO authenticated
WITH CHECK (
  resident_id = public.get_my_resident_id()
);

-- Policy: Residents can update their own security contacts
CREATE POLICY "Residents can update own security contacts"
ON public.security_contacts
FOR UPDATE
TO authenticated
USING (
  resident_id = public.get_my_resident_id()
)
WITH CHECK (
  resident_id = public.get_my_resident_id()
);

-- Policy: Residents can delete their own security contacts
CREATE POLICY "Residents can delete own security contacts"
ON public.security_contacts
FOR DELETE
TO authenticated
USING (
  resident_id = public.get_my_resident_id()
);

-- =====================================================
-- 5. RLS Policies for notification_preferences table
-- =====================================================
-- Allow residents to manage their notification preferences

-- Policy: Residents can view their own notification preferences
CREATE POLICY "Residents can view own notification preferences"
ON public.notification_preferences
FOR SELECT
TO authenticated
USING (
  resident_id = public.get_my_resident_id()
);

-- Policy: Residents can update their own notification preferences
CREATE POLICY "Residents can update own notification preferences"
ON public.notification_preferences
FOR UPDATE
TO authenticated
USING (
  resident_id = public.get_my_resident_id()
)
WITH CHECK (
  resident_id = public.get_my_resident_id()
);

-- =====================================================
-- 6. RLS Policies for resident_wallets table
-- =====================================================
-- Allow residents to view their wallet balance (read-only)

-- Policy: Residents can view their own wallet
CREATE POLICY "Residents can view own wallet"
ON public.resident_wallets
FOR SELECT
TO authenticated
USING (
  resident_id = public.get_my_resident_id()
);

-- =====================================================
-- 7. RLS Policies for wallet_transactions table
-- =====================================================
-- Allow residents to view their wallet transaction history (read-only)

-- Policy: Residents can view their own wallet transactions
CREATE POLICY "Residents can view own wallet transactions"
ON public.wallet_transactions
FOR SELECT
TO authenticated
USING (
  wallet_id IN (
    SELECT id FROM public.resident_wallets
    WHERE resident_id = public.get_my_resident_id()
  )
);

-- =====================================================
-- 8. RLS Policies for resident_houses table
-- =====================================================
-- Allow residents to view their house assignments

-- Policy: Residents can view their own house assignments
CREATE POLICY "Residents can view own house assignments"
ON public.resident_houses
FOR SELECT
TO authenticated
USING (
  resident_id = public.get_my_resident_id()
);

-- =====================================================
-- 9. RLS Policies for houses table (via resident_houses)
-- =====================================================
-- Allow residents to view houses they are assigned to

-- Policy: Residents can view houses they are assigned to
CREATE POLICY "Residents can view assigned houses"
ON public.houses
FOR SELECT
TO authenticated
USING (
  id IN (
    SELECT house_id FROM public.resident_houses
    WHERE resident_id = public.get_my_resident_id()
    AND is_active = TRUE
  )
);

-- =====================================================
-- 10. RLS Policies for access_codes table
-- =====================================================
-- Allow residents to view access codes for their security contacts

-- Policy: Residents can view access codes for their contacts
CREATE POLICY "Residents can view own access codes"
ON public.access_codes
FOR SELECT
TO authenticated
USING (
  contact_id IN (
    SELECT id FROM public.security_contacts
    WHERE resident_id = public.get_my_resident_id()
  )
);

-- =====================================================
-- 11. RLS Policies for invoice_items table
-- =====================================================
-- Allow residents to view line items for their invoices

-- Policy: Residents can view invoice items for their invoices
CREATE POLICY "Residents can view own invoice items"
ON public.invoice_items
FOR SELECT
TO authenticated
USING (
  invoice_id IN (
    SELECT id FROM public.invoices
    WHERE resident_id = public.get_my_resident_id()
  )
);
