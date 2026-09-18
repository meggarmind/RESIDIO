-- =====================================================
-- Contact Verification System
-- Adds email and phone verification for residents
-- =====================================================

-- Add verification timestamps to residents table
ALTER TABLE public.residents
ADD COLUMN IF NOT EXISTS email_verified_at TIMESTAMPTZ,
ADD COLUMN IF NOT EXISTS phone_verified_at TIMESTAMPTZ;

-- Create index for verification status queries
CREATE INDEX IF NOT EXISTS idx_residents_email_verified ON public.residents(email_verified_at);
CREATE INDEX IF NOT EXISTS idx_residents_phone_verified ON public.residents(phone_verified_at);

-- Create verification type enum
DO $$ BEGIN
    CREATE TYPE public.verification_type AS ENUM ('email', 'phone');
EXCEPTION
    WHEN duplicate_object THEN null;
END $$;

-- Verification tokens table for OTP management
CREATE TABLE IF NOT EXISTS public.verification_tokens (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    resident_id UUID NOT NULL REFERENCES public.residents(id) ON DELETE CASCADE,
    token_type public.verification_type NOT NULL,
    token CHAR(6) NOT NULL,
    target_value TEXT NOT NULL, -- The email or phone being verified
    expires_at TIMESTAMPTZ NOT NULL,
    used_at TIMESTAMPTZ, -- Null until token is used
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),

    -- Constraints
    CONSTRAINT verification_tokens_token_format CHECK (token ~ '^[0-9]{6}$')
);

-- Indexes for verification_tokens
CREATE INDEX IF NOT EXISTS idx_verification_tokens_resident ON public.verification_tokens(resident_id);
CREATE INDEX IF NOT EXISTS idx_verification_tokens_token ON public.verification_tokens(token);
CREATE INDEX IF NOT EXISTS idx_verification_tokens_expires ON public.verification_tokens(expires_at);
CREATE INDEX IF NOT EXISTS idx_verification_tokens_type_resident ON public.verification_tokens(token_type, resident_id);

-- Enable RLS on verification_tokens
ALTER TABLE public.verification_tokens ENABLE ROW LEVEL SECURITY;

-- RLS Policy: Users can view their own verification tokens
CREATE POLICY "Users can view own verification tokens"
    ON public.verification_tokens
    FOR SELECT
    USING (
        resident_id IN (
            SELECT p.resident_id
            FROM public.profiles p
            WHERE p.id = auth.uid()
        )
    );

-- RLS Policy: Service role (server-side) can manage all tokens
CREATE POLICY "Service role can manage verification tokens"
    ON public.verification_tokens
    FOR ALL
    USING (auth.jwt() ->> 'role' = 'service_role');

-- Add role verification requirement column to app_roles
ALTER TABLE public.app_roles
ADD COLUMN IF NOT EXISTS requires_contact_verification BOOLEAN NOT NULL DEFAULT false;

-- Set all roles (except resident) to require contact verification
UPDATE public.app_roles
SET requires_contact_verification = true
WHERE name != 'resident';

-- Grant permissions
GRANT ALL ON public.verification_tokens TO authenticated;
GRANT ALL ON public.verification_tokens TO service_role;

-- Documentation comments
COMMENT ON TABLE public.verification_tokens IS 'Stores OTP tokens for email and phone verification';
COMMENT ON COLUMN public.verification_tokens.token IS '6-digit OTP code';
COMMENT ON COLUMN public.verification_tokens.target_value IS 'The email address or phone number being verified';
COMMENT ON COLUMN public.verification_tokens.used_at IS 'Timestamp when token was successfully used, null if unused';
COMMENT ON COLUMN public.residents.email_verified_at IS 'Timestamp when email was verified via OTP';
COMMENT ON COLUMN public.residents.phone_verified_at IS 'Timestamp when phone was verified via OTP';
COMMENT ON COLUMN public.app_roles.requires_contact_verification IS 'Whether this role requires verified email for assignment';
