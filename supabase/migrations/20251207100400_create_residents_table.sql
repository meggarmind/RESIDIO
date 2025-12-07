-- Migration: Create residents table
-- Core resident entity - individuals living in the estate

CREATE TABLE public.residents (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),

    -- 6-digit unique code for quick identification (auto-generated)
    resident_code CHAR(6) NOT NULL UNIQUE,

    -- Personal information
    first_name TEXT NOT NULL,
    last_name TEXT NOT NULL,
    email TEXT,
    phone_primary TEXT NOT NULL,
    phone_secondary TEXT,

    -- Resident classification
    resident_type public.resident_type NOT NULL DEFAULT 'primary',

    -- Status fields
    verification_status public.verification_status NOT NULL DEFAULT 'pending',
    account_status public.account_status NOT NULL DEFAULT 'active',

    -- Identity verification (optional, for future KYC)
    id_type TEXT,
    id_number TEXT,
    id_verified_at TIMESTAMPTZ,
    id_verified_by UUID REFERENCES public.profiles(id),

    -- Photo (URL to stored image)
    photo_url TEXT,

    -- Emergency contact
    emergency_contact_name TEXT,
    emergency_contact_phone TEXT,
    emergency_contact_relationship TEXT,

    -- Additional info
    notes TEXT,

    -- Audit fields
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    created_by UUID REFERENCES public.profiles(id),
    updated_by UUID REFERENCES public.profiles(id)
);

-- Indexes
CREATE INDEX residents_code_idx ON public.residents(resident_code);
CREATE INDEX residents_name_idx ON public.residents(last_name, first_name);
CREATE INDEX residents_email_idx ON public.residents(email) WHERE email IS NOT NULL;
CREATE INDEX residents_phone_idx ON public.residents(phone_primary);
CREATE INDEX residents_status_idx ON public.residents(account_status);
CREATE INDEX residents_verification_idx ON public.residents(verification_status);
CREATE INDEX residents_type_idx ON public.residents(resident_type);

-- Enable RLS
ALTER TABLE public.residents ENABLE ROW LEVEL SECURITY;

-- Trigger for updated_at
CREATE TRIGGER residents_updated_at
    BEFORE UPDATE ON public.residents
    FOR EACH ROW
    EXECUTE FUNCTION public.handle_updated_at();

-- RLS Policies
-- Admins, chairmen, and financial secretaries can view all residents
CREATE POLICY "Admins chairmen fin sec can view all residents"
    ON public.residents
    FOR SELECT
    USING (public.get_my_role() IN ('admin', 'chairman', 'financial_secretary'));

-- Security officers can only view active residents
CREATE POLICY "Security officers can view active residents"
    ON public.residents
    FOR SELECT
    USING (
        public.get_my_role() = 'security_officer'
        AND account_status = 'active'
    );

-- Admins, chairmen, and financial secretaries can insert residents
CREATE POLICY "Admins chairmen fin sec can insert residents"
    ON public.residents
    FOR INSERT
    WITH CHECK (public.get_my_role() IN ('admin', 'chairman', 'financial_secretary'));

-- Admins, chairmen, and financial secretaries can update residents
CREATE POLICY "Admins chairmen fin sec can update residents"
    ON public.residents
    FOR UPDATE
    USING (public.get_my_role() IN ('admin', 'chairman', 'financial_secretary'));

-- Only admins can delete residents
CREATE POLICY "Only admins can delete residents"
    ON public.residents
    FOR DELETE
    USING (public.get_my_role() = 'admin');

-- Grant permissions
GRANT ALL ON public.residents TO authenticated;
