-- WhatsApp admin security layer (#972).
--
-- WHAT CHANGES
--   1. CREATE TABLE public.whatsapp_admin_bindings: pins one WhatsApp number to one admin account.
--      A row is born when the admin, signed in to the dashboard with authenticator 2FA, asks for a
--      link code: only the code's SHA-256 hash is stored, valid 10 minutes. `ADMIN LINK <code>` from
--      the phone sets phone_number and bound_at. account_fingerprint ties the binding to the admin's
--      role and authenticator secret, so a role change or a new 2FA setup ends it. last_totp_step
--      makes each authenticator code single-use; session_expires_at is the 15-minute admin session.
--      One active binding per admin and one per number (partial unique indexes); one unused code
--      per admin.
--   2. CREATE TABLE public.whatsapp_admin_requests: one row per admin action asked for on WhatsApp.
--      A request made without a live session waits as 'pending' for 5 minutes, bound to its action
--      and parameters, and is used at most once. Rows marked 'done' count toward the daily cap.
--   3. CREATE TABLE public.whatsapp_admin_number_locks: wrong codes per number. Five wrong codes lock
--      admin mode on that number for 30 minutes.
--   4. Permission whatsapp_admin.query ("Use WhatsApp Admin Mode"), category notifications like the
--      other WhatsApp permissions, granted to super_admin, chairman and financial_officer.
--   All three tables are service_role only, like the other WhatsApp tables.
--
-- WHY
--   The WhatsApp provider gives only the sender's number, so a number alone proves nothing. Admin
--   mode needs a pinned number, an authenticator code and an audit trail before any admin action.
--
-- IDEMPOTENT: CREATE ... IF NOT EXISTS, DROP POLICY IF EXISTS before CREATE POLICY, ON CONFLICT DO NOTHING.
--
-- ROLLBACK (loses every binding and request; export the tables first):
--   BEGIN;
--   DROP TABLE IF EXISTS public.whatsapp_admin_requests;
--   DROP TABLE IF EXISTS public.whatsapp_admin_bindings;
--   DROP TABLE IF EXISTS public.whatsapp_admin_number_locks;
--   DELETE FROM public.role_permissions WHERE permission_id IN
--     (SELECT id FROM public.app_permissions WHERE name = 'whatsapp_admin.query');
--   DELETE FROM public.app_permissions WHERE name = 'whatsapp_admin.query';
--   COMMIT;
--   Roll the application code back first: it reads and writes the three tables.
--
-- VERIFY (run on the database after applying):
--   SELECT has_table_privilege('authenticated', 'public.whatsapp_admin_bindings', 'SELECT');  -- expect false
--   SELECT r.name FROM public.role_permissions rp JOIN public.app_roles r ON r.id = rp.role_id
--     JOIN public.app_permissions p ON p.id = rp.permission_id
--     WHERE p.name = 'whatsapp_admin.query' ORDER BY 1;  -- expect chairman, financial_officer, super_admin

CREATE TABLE IF NOT EXISTS public.whatsapp_admin_bindings (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  profile_id UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  link_code_hash TEXT NOT NULL UNIQUE,
  link_code_expires_at TIMESTAMPTZ NOT NULL,
  phone_number TEXT,
  bound_at TIMESTAMPTZ,
  account_fingerprint TEXT,
  last_used_at TIMESTAMPTZ,
  last_totp_step BIGINT,
  session_expires_at TIMESTAMPTZ,
  revoked_at TIMESTAMPTZ,
  revoked_reason TEXT,
  created_by UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT timezone('utc', now()),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT timezone('utc', now()),
  CONSTRAINT whatsapp_admin_bindings_bound_check CHECK (
    (bound_at IS NULL AND phone_number IS NULL)
    OR (bound_at IS NOT NULL AND phone_number IS NOT NULL AND account_fingerprint IS NOT NULL)
  )
);

CREATE UNIQUE INDEX IF NOT EXISTS whatsapp_admin_bindings_one_active_per_admin
  ON public.whatsapp_admin_bindings (profile_id)
  WHERE revoked_at IS NULL AND bound_at IS NOT NULL;
CREATE UNIQUE INDEX IF NOT EXISTS whatsapp_admin_bindings_one_active_per_number
  ON public.whatsapp_admin_bindings (phone_number)
  WHERE revoked_at IS NULL AND bound_at IS NOT NULL;
CREATE UNIQUE INDEX IF NOT EXISTS whatsapp_admin_bindings_one_code_per_admin
  ON public.whatsapp_admin_bindings (profile_id)
  WHERE revoked_at IS NULL AND bound_at IS NULL;

CREATE TABLE IF NOT EXISTS public.whatsapp_admin_requests (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  binding_id UUID NOT NULL REFERENCES public.whatsapp_admin_bindings(id) ON DELETE CASCADE,
  profile_id UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  action TEXT NOT NULL,
  params JSONB NOT NULL DEFAULT '{}'::jsonb,
  status TEXT NOT NULL DEFAULT 'pending',
  expires_at TIMESTAMPTZ NOT NULL,
  provider_message_id TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT timezone('utc', now()),
  completed_at TIMESTAMPTZ,
  CONSTRAINT whatsapp_admin_requests_status_check CHECK (status IN ('pending', 'done', 'expired'))
);

CREATE INDEX IF NOT EXISTS idx_whatsapp_admin_requests_profile
  ON public.whatsapp_admin_requests (profile_id, status, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_whatsapp_admin_requests_binding
  ON public.whatsapp_admin_requests (binding_id, status);

CREATE TABLE IF NOT EXISTS public.whatsapp_admin_number_locks (
  phone_number TEXT PRIMARY KEY,
  failed_attempts INTEGER NOT NULL DEFAULT 0,
  locked_until TIMESTAMPTZ,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT timezone('utc', now())
);

ALTER TABLE public.whatsapp_admin_bindings ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.whatsapp_admin_requests ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.whatsapp_admin_number_locks ENABLE ROW LEVEL SECURITY;

REVOKE ALL ON TABLE public.whatsapp_admin_bindings, public.whatsapp_admin_requests, public.whatsapp_admin_number_locks
  FROM anon, authenticated;
GRANT ALL ON TABLE public.whatsapp_admin_bindings, public.whatsapp_admin_requests, public.whatsapp_admin_number_locks
  TO service_role;

DROP POLICY IF EXISTS "whatsapp_admin_bindings_service_role_all" ON public.whatsapp_admin_bindings;
CREATE POLICY "whatsapp_admin_bindings_service_role_all"
  ON public.whatsapp_admin_bindings FOR ALL TO service_role USING (true) WITH CHECK (true);
DROP POLICY IF EXISTS "whatsapp_admin_requests_service_role_all" ON public.whatsapp_admin_requests;
CREATE POLICY "whatsapp_admin_requests_service_role_all"
  ON public.whatsapp_admin_requests FOR ALL TO service_role USING (true) WITH CHECK (true);
DROP POLICY IF EXISTS "whatsapp_admin_number_locks_service_role_all" ON public.whatsapp_admin_number_locks;
CREATE POLICY "whatsapp_admin_number_locks_service_role_all"
  ON public.whatsapp_admin_number_locks FOR ALL TO service_role USING (true) WITH CHECK (true);

INSERT INTO public.app_permissions (name, display_name, description, category, is_active)
VALUES (
  'whatsapp_admin.query',
  'Use WhatsApp Admin Mode',
  'Link a WhatsApp number to this admin account and run approved read-only admin lookups on WhatsApp with an authenticator code',
  'notifications',
  true
)
ON CONFLICT (name) DO NOTHING;

INSERT INTO public.role_permissions (role_id, permission_id)
SELECT r.id, p.id
FROM public.app_roles r
CROSS JOIN public.app_permissions p
WHERE r.name IN ('super_admin', 'chairman', 'financial_officer')
  AND p.name = 'whatsapp_admin.query'
ON CONFLICT DO NOTHING;
