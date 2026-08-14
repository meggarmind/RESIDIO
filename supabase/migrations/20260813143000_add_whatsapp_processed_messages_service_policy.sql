-- Make the service-only access contract explicit for the webhook idempotency
-- ledger. The table remains inaccessible to anon/authenticated because its
-- table grants are revoked; service_role is the only role with a policy and
-- table privileges.
CREATE POLICY "whatsapp_processed_messages_service_role_all"
  ON public.whatsapp_processed_messages
  FOR ALL TO service_role
  USING (true)
  WITH CHECK (true);
