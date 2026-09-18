-- Performance optimization indexes based on query pattern analysis

-- For payment date range + status queries
CREATE INDEX IF NOT EXISTS idx_payment_records_date_status 
  ON payment_records(payment_date, status);

-- For invoice deduplication in generation
CREATE INDEX IF NOT EXISTS idx_invoices_resident_house_profile_period 
  ON invoices(resident_id, house_id, billing_profile_id, period_start, period_end);

-- For active resident house lookups (partial index)
CREATE INDEX IF NOT EXISTS idx_resident_houses_house_active 
  ON resident_houses(house_id, is_active) 
  WHERE is_active = true;

-- For security contact expiry checks (partial index)
CREATE INDEX IF NOT EXISTS idx_access_codes_active_valid 
  ON access_codes(is_active, valid_until) 
  WHERE is_active = true;

-- For invoice status distribution (partial index)
CREATE INDEX IF NOT EXISTS idx_invoices_status_not_void 
  ON invoices(status) 
  WHERE status != 'void';

-- For billing profile lookups (partial index)
CREATE INDEX IF NOT EXISTS idx_houses_billing_profile 
  ON houses(billing_profile_id) 
  WHERE billing_profile_id IS NOT NULL;

-- For wallet transaction lookups
CREATE INDEX IF NOT EXISTS idx_wallet_transactions_wallet_created 
  ON wallet_transactions(wallet_id, created_at DESC);

-- For audit log queries
CREATE INDEX IF NOT EXISTS idx_audit_logs_entity_created 
  ON audit_logs(entity_type, created_at DESC);
