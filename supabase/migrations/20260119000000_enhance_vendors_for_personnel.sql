-- Enhance Vendors table to support broader Personnel Management
-- 20260119000000_enhance_vendors_for_personnel.sql

-- 1. Add new columns for Personnel differentiation
ALTER TABLE public.vendors
ADD COLUMN IF NOT EXISTS type TEXT CHECK (type IN ('staff', 'vendor', 'contractor', 'supplier')) DEFAULT 'vendor',
ADD COLUMN IF NOT EXISTS status TEXT CHECK (status IN ('active', 'inactive', 'terminated')) DEFAULT 'active',
ADD COLUMN IF NOT EXISTS job_title TEXT, -- For Staff/Contractors
ADD COLUMN IF NOT EXISTS department TEXT, -- For Staff
ADD COLUMN IF NOT EXISTS start_date DATE,
ADD COLUMN IF NOT EXISTS end_date DATE,
ADD COLUMN IF NOT EXISTS notes TEXT;

-- 2. Update existing records to have type='vendor' (default handles this for new inserts, but good to be explicit)
UPDATE public.vendors SET type = 'vendor' WHERE type IS NULL;

-- 3. Create index for performance
CREATE INDEX IF NOT EXISTS idx_vendors_type ON public.vendors(type);
CREATE INDEX IF NOT EXISTS idx_vendors_status ON public.vendors(status);
