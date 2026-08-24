import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

const migration = readFileSync(
  new URL('../../supabase/migrations/20260824200000_harden_database_security_and_health_indexes.sql', import.meta.url),
  'utf8'
);

describe('database hardening migration contract', () => {
  it('makes exposed views invoke RLS as the caller and removes anonymous access', () => {
    expect(migration).toContain('ALTER VIEW public.security_settings_view SET (security_invoker = true)');
    expect(migration).toContain('ALTER VIEW public.visitor_analytics SET (security_invoker = true)');
    expect(migration).toContain('REVOKE SELECT ON public.security_settings_view, public.visitor_analytics FROM PUBLIC, anon');
  });

  it('hardens RLS helper functions with an explicit search path and grants', () => {
    expect(migration).toContain(
      'ALTER FUNCTION public.get_my_role() SET search_path = public, auth, extensions, pg_temp'
    );
    expect(migration).toContain('REVOKE EXECUTE ON FUNCTION public.is_super_admin() FROM PUBLIC, anon');
    expect(migration).toContain('GRANT EXECUTE ON FUNCTION public.is_super_admin() TO authenticated, service_role');
  });

  it('indexes the timestamp predicates used by WhatsApp health reads', () => {
    expect(migration).toContain('idx_whatsapp_processed_messages_received_at');
    expect(migration).toContain('idx_notification_history_whatsapp_health');
    expect(migration).toContain('idx_notification_queue_whatsapp_health');
  });
});
