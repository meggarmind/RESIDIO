-- Fix invoice period dates to align with invoice_number month
-- Invoice numbers follow pattern: INV-YYYYMM-XXXXXXXX
-- Extract year/month and set correct period_start (1st) and period_end (last day)

UPDATE invoices
SET 
    period_start = make_date(
        CAST(SUBSTRING(invoice_number FROM 5 FOR 4) AS INTEGER),  -- YYYY
        CAST(SUBSTRING(invoice_number FROM 9 FOR 2) AS INTEGER),  -- MM
        1  -- First day
    ),
    period_end = (
        make_date(
            CAST(SUBSTRING(invoice_number FROM 5 FOR 4) AS INTEGER),  -- YYYY
            CAST(SUBSTRING(invoice_number FROM 9 FOR 2) AS INTEGER),  -- MM
            1  -- First day
        ) + INTERVAL '1 month' - INTERVAL '1 day'
    )::DATE
WHERE invoice_number LIKE 'INV-%';

-- Verify the fix
DO $$
DECLARE
    fixed_count INTEGER;
BEGIN
    SELECT COUNT(*) INTO fixed_count
    FROM invoices
    WHERE period_start = make_date(
        CAST(SUBSTRING(invoice_number FROM 5 FOR 4) AS INTEGER),
        CAST(SUBSTRING(invoice_number FROM 9 FOR 2) AS INTEGER),
        1
    );
    
    RAISE NOTICE 'Fixed % invoices with correct period dates', fixed_count;
END $$;
