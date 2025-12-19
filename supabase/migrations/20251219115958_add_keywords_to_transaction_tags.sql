-- Add keywords array column to transaction_tags for auto-tagging functionality
ALTER TABLE transaction_tags
ADD COLUMN keywords text[] DEFAULT '{}';

-- Add comment explaining the column's purpose
COMMENT ON COLUMN transaction_tags.keywords IS
'Array of keywords/patterns for auto-tagging. Case-insensitive matching against transaction descriptions.';
