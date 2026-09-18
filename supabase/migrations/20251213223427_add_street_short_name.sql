-- Add short_name column to streets table
ALTER TABLE streets
ADD COLUMN IF NOT EXISTS short_name VARCHAR(50);

-- Backfill: Set short_name to first word of name or first 10 chars
UPDATE streets
SET short_name = COALESCE(
  NULLIF(split_part(name, ' ', 1), ''),
  LEFT(name, 10)
)
WHERE short_name IS NULL;

-- Add index for queries that might filter by short_name
CREATE INDEX IF NOT EXISTS idx_streets_short_name ON streets(short_name);
