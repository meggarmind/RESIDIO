-- Migration: Create Billing Schema
-- Establishes Billing Profiles, Billing Items, and Invoices

BEGIN;

-- 1. Create billing_profiles table (Rate Cards)
CREATE TABLE IF NOT EXISTS public.billing_profiles (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    name TEXT NOT NULL UNIQUE,
    description TEXT,
    is_active BOOLEAN NOT NULL DEFAULT true,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    created_by UUID REFERENCES public.profiles(id)
);

-- RLS for billing_profiles
ALTER TABLE public.billing_profiles ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Admins chairmen fin sec can manage billing profiles" ON public.billing_profiles
    FOR ALL USING (public.get_my_role() IN ('admin', 'chairman', 'financial_secretary'));

CREATE POLICY "All authenticated can view billing profiles" ON public.billing_profiles
    FOR SELECT USING (true); -- Publicly viewable for transparency/debugging, or restrict if needed

-- Trigger for billing_profiles updated_at
CREATE TRIGGER billing_profiles_updated_at
    BEFORE UPDATE ON public.billing_profiles
    FOR EACH ROW EXECUTE FUNCTION public.handle_updated_at();


-- 2. Create billing_items table (Line items for a profile)
CREATE TYPE public.billing_frequency AS ENUM ('monthly', 'yearly', 'one_off');

CREATE TABLE IF NOT EXISTS public.billing_items (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    billing_profile_id UUID NOT NULL REFERENCES public.billing_profiles(id) ON DELETE CASCADE,
    name TEXT NOT NULL, -- e.g. "Security Fee"
    amount DECIMAL(10, 2) NOT NULL DEFAULT 0,
    frequency public.billing_frequency NOT NULL DEFAULT 'monthly',
    is_mandatory BOOLEAN NOT NULL DEFAULT true,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- RLS for billing_items
ALTER TABLE public.billing_items ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Admins chairmen fin sec can manage billing items" ON public.billing_items
    FOR ALL USING (public.get_my_role() IN ('admin', 'chairman', 'financial_secretary'));

CREATE POLICY "All authenticated can view billing items" ON public.billing_items
    FOR SELECT USING (true);

-- Trigger for billing_items updated_at
CREATE TRIGGER billing_items_updated_at
    BEFORE UPDATE ON public.billing_items
    FOR EACH ROW EXECUTE FUNCTION public.handle_updated_at();


-- 3. Update house_types to link to billing_profiles
ALTER TABLE public.house_types
ADD COLUMN IF NOT EXISTS billing_profile_id UUID REFERENCES public.billing_profiles(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_house_types_billing_profile ON public.house_types(billing_profile_id);


-- 4. Create invoices table
CREATE TYPE public.invoice_status AS ENUM ('unpaid', 'paid', 'void', 'partially_paid');

CREATE TABLE IF NOT EXISTS public.invoices (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    resident_id UUID NOT NULL REFERENCES public.residents(id) ON DELETE RESTRICT,
    house_id UUID REFERENCES public.houses(id) ON DELETE SET NULL, -- Context: which house was this billed for?
    billing_profile_id UUID REFERENCES public.billing_profiles(id), -- Snapshot: which profile was used?
    
    invoice_number TEXT NOT NULL UNIQUE, -- e.g. INV-2025-0001
    amount_due DECIMAL(12, 2) NOT NULL DEFAULT 0,
    amount_paid DECIMAL(12, 2) NOT NULL DEFAULT 0,
    status public.invoice_status NOT NULL DEFAULT 'unpaid',
    due_date DATE NOT NULL,
    period_start DATE,
    period_end DATE,
    
    notes TEXT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    created_by UUID REFERENCES public.profiles(id) -- System or User
);

-- RLS for invoices
ALTER TABLE public.invoices ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Admins chairmen fin sec can manage all invoices" ON public.invoices
    FOR ALL USING (public.get_my_role() IN ('admin', 'chairman', 'financial_secretary'));

CREATE POLICY "Residents can view own invoices" ON public.invoices
    FOR SELECT USING (
        resident_id IN (SELECT id FROM public.residents WHERE profile_id = auth.uid())
    );

-- Trigger for invoices updated_at
CREATE TRIGGER invoices_updated_at
    BEFORE UPDATE ON public.invoices
    FOR EACH ROW EXECUTE FUNCTION public.handle_updated_at();


-- 5. Create invoice_items table (Snapshot of charges)
CREATE TABLE IF NOT EXISTS public.invoice_items (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    invoice_id UUID NOT NULL REFERENCES public.invoices(id) ON DELETE CASCADE,
    description TEXT NOT NULL, -- e.g. "Security Fee (Oct 2025)"
    amount DECIMAL(10, 2) NOT NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- RLS for invoice_items
ALTER TABLE public.invoice_items ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Admins chairmen fin sec can manage all invoice items" ON public.invoice_items
    FOR ALL USING (public.get_my_role() IN ('admin', 'chairman', 'financial_secretary'));

CREATE POLICY "Residents can view own invoice items" ON public.invoice_items
    FOR SELECT USING (
        invoice_id IN (
            SELECT id FROM public.invoices 
            WHERE resident_id IN (SELECT id FROM public.residents WHERE profile_id = auth.uid())
        )
    );

COMMIT;
