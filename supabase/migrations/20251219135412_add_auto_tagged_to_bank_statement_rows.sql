-- Add auto_tagged column to bank_statement_rows for tracking automatic vs manual tagging
ALTER TABLE bank_statement_rows
ADD COLUMN auto_tagged boolean DEFAULT false;

-- Add comment explaining the column's purpose
COMMENT ON COLUMN bank_statement_rows.auto_tagged IS
'True if tag was automatically applied based on keyword match, false for manual tags';
