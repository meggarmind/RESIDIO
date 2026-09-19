-- Update the file_type check constraint to include 'pdf'
ALTER TABLE bank_statement_imports 
DROP CONSTRAINT bank_statement_imports_file_type_check;

ALTER TABLE bank_statement_imports 
ADD CONSTRAINT bank_statement_imports_file_type_check 
CHECK (file_type = ANY (ARRAY['csv'::text, 'xlsx'::text, 'pdf'::text]));
