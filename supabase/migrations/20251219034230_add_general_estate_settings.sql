-- Add general estate settings to system_settings table
-- These settings configure basic estate information and social links

INSERT INTO system_settings (key, value, description, category)
VALUES
  ('estate_name', '"Residio Estate"'::jsonb, 'Name of the estate', 'general'),
  ('estate_address', '""'::jsonb, 'Physical address of the estate', 'general'),
  ('estate_phone', '""'::jsonb, 'Contact phone number for the estate', 'general'),
  ('estate_email', '""'::jsonb, 'Contact email address for the estate', 'general'),
  ('estate_logo_url', 'null'::jsonb, 'URL to the estate logo image', 'general'),
  ('estate_website_url', 'null'::jsonb, 'Estate website URL', 'general'),
  ('estate_facebook_url', 'null'::jsonb, 'Estate Facebook page URL', 'general'),
  ('estate_twitter_url', 'null'::jsonb, 'Estate Twitter/X profile URL', 'general'),
  ('estate_instagram_url', 'null'::jsonb, 'Estate Instagram profile URL', 'general')
ON CONFLICT (key) DO NOTHING;
