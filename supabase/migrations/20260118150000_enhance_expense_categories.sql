-- Migration: Enhance expense_categories for unified categorization
-- Adds keywords, color, is_active, sort_order to expense_categories
-- Migrates relevant data from transaction_tags (debit)

-- Step 1: Add new columns to expense_categories
ALTER TABLE public.expense_categories 
ADD COLUMN IF NOT EXISTS keywords TEXT[] DEFAULT '{}',
ADD COLUMN IF NOT EXISTS color TEXT DEFAULT 'gray',
ADD COLUMN IF NOT EXISTS is_active BOOLEAN DEFAULT true,
ADD COLUMN IF NOT EXISTS sort_order INTEGER DEFAULT 0;

-- Step 2: Add comments for documentation
COMMENT ON COLUMN public.expense_categories.keywords IS 'Keywords for auto-matching bank statement descriptions to this category';
COMMENT ON COLUMN public.expense_categories.color IS 'Display color for UI badges (gray, blue, green, red, yellow, purple, orange)';
COMMENT ON COLUMN public.expense_categories.is_active IS 'Whether this category is active and available for use';
COMMENT ON COLUMN public.expense_categories.sort_order IS 'Display order in dropdowns and lists';

-- Step 3: Migrate keywords from existing debit transaction tags
-- Map matching categories based on name similarity
UPDATE public.expense_categories ec
SET 
  keywords = tt.keywords,
  color = tt.color
FROM public.transaction_tags tt
WHERE tt.transaction_type = 'debit'
AND tt.keywords IS NOT NULL
AND array_length(tt.keywords, 1) > 0
AND (
  (LOWER(ec.name) = 'security' AND LOWER(tt.name) LIKE '%security%') OR
  (LOWER(ec.name) = 'water' AND LOWER(tt.name) LIKE '%water%') OR
  (LOWER(ec.name) = 'electricity' AND LOWER(tt.name) LIKE '%electri%') OR
  (LOWER(ec.name) LIKE '%waste%' AND LOWER(tt.name) LIKE '%sanit%') OR
  (LOWER(ec.name) LIKE '%generator%' AND LOWER(tt.name) LIKE '%fuel%') OR
  (LOWER(ec.name) LIKE '%repair%' AND LOWER(tt.name) LIKE '%maint%')
);

-- Step 4: Add default keywords for categories that weren't matched
UPDATE public.expense_categories 
SET keywords = ARRAY['security', 'guard', 'surveillance']
WHERE LOWER(name) = 'security' AND (keywords IS NULL OR array_length(keywords, 1) IS NULL);

UPDATE public.expense_categories 
SET keywords = ARRAY['water', 'borehole', 'supply']
WHERE LOWER(name) = 'water' AND (keywords IS NULL OR array_length(keywords, 1) IS NULL);

UPDATE public.expense_categories 
SET keywords = ARRAY['electricity', 'power', 'transformer', 'nepa']
WHERE LOWER(name) = 'electricity' AND (keywords IS NULL OR array_length(keywords, 1) IS NULL);

UPDATE public.expense_categories 
SET keywords = ARRAY['waste', 'refuse', 'garbage', 'sanitation']
WHERE LOWER(name) LIKE '%waste%' AND (keywords IS NULL OR array_length(keywords, 1) IS NULL);

UPDATE public.expense_categories 
SET keywords = ARRAY['generator', 'diesel', 'fuel']
WHERE LOWER(name) LIKE '%generator%' AND (keywords IS NULL OR array_length(keywords, 1) IS NULL);

UPDATE public.expense_categories 
SET keywords = ARRAY['salary', 'wages', 'staff']
WHERE LOWER(name) LIKE '%salari%' AND (keywords IS NULL OR array_length(keywords, 1) IS NULL);

UPDATE public.expense_categories 
SET keywords = ARRAY['repair', 'maintenance', 'fix']
WHERE LOWER(name) LIKE '%repair%' AND (keywords IS NULL OR array_length(keywords, 1) IS NULL);

UPDATE public.expense_categories 
SET keywords = ARRAY['admin', 'office', 'stationery']
WHERE LOWER(name) LIKE '%admin%' AND (keywords IS NULL OR array_length(keywords, 1) IS NULL);

UPDATE public.expense_categories 
SET keywords = ARRAY['legal', 'lawyer', 'professional', 'consultant']
WHERE LOWER(name) LIKE '%legal%' AND (keywords IS NULL OR array_length(keywords, 1) IS NULL);

UPDATE public.expense_categories 
SET keywords = ARRAY['garden', 'landscaping', 'lawn']
WHERE LOWER(name) LIKE '%landscap%' AND (keywords IS NULL OR array_length(keywords, 1) IS NULL);

-- Step 5: Set display colors for categories without color
UPDATE public.expense_categories 
SET color = 'red'
WHERE LOWER(name) = 'security' AND color = 'gray';

UPDATE public.expense_categories 
SET color = 'blue'
WHERE LOWER(name) = 'water' AND color = 'gray';

UPDATE public.expense_categories 
SET color = 'yellow'
WHERE LOWER(name) = 'electricity' AND color = 'gray';

UPDATE public.expense_categories 
SET color = 'green'
WHERE LOWER(name) LIKE '%waste%' AND color = 'gray';

UPDATE public.expense_categories 
SET color = 'orange'
WHERE LOWER(name) LIKE '%generator%' AND color = 'gray';

UPDATE public.expense_categories 
SET color = 'purple'
WHERE LOWER(name) LIKE '%salari%' AND color = 'gray';

-- Step 6: Add a "Bank Import - Miscellaneous" category if it doesn't exist
-- This is used as fallback for unmatched debit transactions
INSERT INTO public.expense_categories (name, description, keywords, color, sort_order)
VALUES (
  'Bank Import - Miscellaneous',
  'Fallback category for bank import debits that do not match any other category',
  ARRAY['misc', 'other', 'sundry'],
  'gray',
  999
)
ON CONFLICT (name) DO NOTHING;

-- Step 7: Add triggers for updated_at (if not already present)
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_trigger 
    WHERE tgname = 'set_updated_at_expense_categories_unified'
  ) THEN
    CREATE TRIGGER set_updated_at_expense_categories_unified
    BEFORE UPDATE ON public.expense_categories 
    FOR EACH ROW 
    EXECUTE FUNCTION public.handle_updated_at();
  END IF;
END $$;
