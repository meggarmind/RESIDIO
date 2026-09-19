-- Add default move-out validity period setting
INSERT INTO system_settings (key, value, description, category)
VALUES (
  'moveout_validity_days',
  '7',
  'Default validity period (in days) for renter move-out clearance certificates',
  'residents'
)
ON CONFLICT (key) DO NOTHING;
