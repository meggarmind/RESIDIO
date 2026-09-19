ALTER TABLE gmail_oauth_credentials 
ADD COLUMN IF NOT EXISTS sync_criteria JSONB DEFAULT '{
  "senders": ["alert@firstbanknigeria.com", "noreply@firstbanknigeria.com"],
  "keywords": ["alert", "statement", "ngn"],
  "days_back": 7,
  "include_credits": true,
  "include_debits": true
}'::jsonb;

COMMENT ON COLUMN gmail_oauth_credentials.sync_criteria IS 'Configurable criteria for fetching bank emails (senders, keywords, history range).';
