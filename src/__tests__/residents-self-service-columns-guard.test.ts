import { readFileSync } from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';

/**
 * #728: a resident could PATCH any column of their own residents row (verification_status, account_status,
 * portal_enabled, whatsapp_pin_hash, ...) because "Residents can update own contact info" limits rows, not
 * columns. Admin edits run as authenticated too, so column grants (the profiles fix) would break them; a
 * BEFORE UPDATE trigger limits non-admin callers to the self-service columns instead.
 *
 * This checks the migration text only, not trigger behaviour: structural assertions on the SQL, plus the
 * trigger's rule replayed against the column list it declares. Each check is also run against a mutated copy
 * and must fail there. Nothing here connects to a database; the trigger itself is verified on Residio_Stage
 * after the migration is applied.
 */
const FILE = path.join(process.cwd(), 'supabase/migrations/20261017130000_guard_residents_self_service_columns.sql');
const sql = readFileSync(FILE, 'utf8');

const upToRollback = (s: string) => s.slice(0, s.indexOf('-- ROLLBACK:'));

// Same role list as the "Admins chairmen fin sec can update residents" policy.
const ADMIN_ROLES = ['super_admin', 'chairman', 'vice_chairman', 'financial_officer'];

const SELF_SERVICE = [
  'email',
  'phone_primary',
  'phone_secondary',
  'emergency_contact_name',
  'emergency_contact_phone',
  'emergency_contact_relationship',
  'emergency_contact_resident_id',
  'liaison_contact_name',
  'liaison_contact_phone',
  'photo_url',
  'updated_at',
];

// The columns #728 names as admin-controlled, plus notes (deliberately not self-service).
const ADMIN_ONLY = [
  'verification_status',
  'account_status',
  'resident_type',
  'id_verified_at',
  'id_verified_by',
  'profile_id',
  'portal_enabled',
  'portal_enabled_at',
  'portal_enabled_by',
  'email_verified_at',
  'phone_verified_at',
  'whatsapp_pin_hash',
  'whatsapp_pin_set_at',
  'use_override_comms',
  'notes',
];

function selfServiceColumns(s: string): string[] {
  const m = s.match(/self_service CONSTANT text\[\] := ARRAY\[([^\]]*)\]/);
  if (!m) return [];
  return [...m[1].matchAll(/'([a-z_]+)'/g)].map((x) => x[1]);
}

/** The trigger's rule for a non-admin authenticated caller: which changed columns it would reject. */
function blockedColumns(s: string, oldRow: Record<string, unknown>, newRow: Record<string, unknown>): string[] {
  const allowed = selfServiceColumns(s);
  return Object.keys(newRow)
    .filter((k) => k in oldRow && newRow[k] !== oldRow[k])
    .filter((k) => !allowed.includes(k))
    .sort();
}

const ownRow = {
  email: 'r@example.test',
  phone_primary: '08000000000',
  verification_status: 'pending',
  account_status: 'active',
  whatsapp_pin_hash: null,
  notes: null,
};

type Check = (s: string) => boolean;

const CHECKS: Record<string, { check: Check; mutate: (s: string) => string }> = {
  'trigger is BEFORE UPDATE, per row, on residents': {
    check: (s) =>
      /CREATE TRIGGER residents_guard_self_service_columns\s+BEFORE UPDATE ON public\.residents\s+FOR EACH ROW EXECUTE FUNCTION public\.guard_residents_self_service_columns\(\)/.test(
        s
      ),
    mutate: (s) => s.replace('BEFORE UPDATE ON public.residents', 'AFTER UPDATE ON public.residents'),
  },
  'only API roles are checked (service_role, postgres and definer functions pass)': {
    check: (s) => s.includes("IF current_user NOT IN ('authenticated', 'anon') THEN\n    RETURN NEW;"),
    mutate: (s) => s.replace("current_user NOT IN ('authenticated', 'anon')", "current_user NOT IN ('anon')"),
  },
  'admin roles of the update policy pass': {
    check: (s) =>
      s.includes(
        `public.get_my_role_name() = ANY (ARRAY[${ADMIN_ROLES.map((r) => `'${r}'::text`).join(', ')}])`
      ),
    mutate: (s) => s.replace("'financial_officer'::text]", "'secretary'::text]"),
  },
  'self-service list is exactly the contact columns': {
    check: (s) => JSON.stringify(selfServiceColumns(s)) === JSON.stringify(SELF_SERVICE),
    mutate: (s) => s.replace("'photo_url',", "'photo_url',\n    'notes',"),
  },
  'a resident changing an admin-only column is blocked': {
    check: (s) =>
      ADMIN_ONLY.every(
        (c) => JSON.stringify(blockedColumns(s, { ...ownRow, [c]: 'old' }, { ...ownRow, [c]: 'new' })) === JSON.stringify([c])
      ),
    mutate: (s) => s.replace("'photo_url',", "'photo_url',\n    'verification_status',"),
  },
  'a resident changing only contact columns is allowed': {
    check: (s) =>
      blockedColumns(s, ownRow, { ...ownRow, email: 'new@example.test', phone_primary: '08011111111' }).length === 0,
    mutate: (s) => s.replace("'phone_primary',", ''),
  },
  'unchanged admin columns sent alongside a contact change are allowed': {
    check: (s) => s.includes('WHERE n.value IS DISTINCT FROM o.value'),
    mutate: (s) => s.replace('WHERE n.value IS DISTINCT FROM o.value', 'WHERE true'),
  },
  'a resident changing email or phone_primary clears its verified stamp, after the blocked check': {
    check: (s) => {
      const body = upToRollback(s);
      const raise = body.indexOf("USING ERRCODE = '42501'");
      const email = body.indexOf('IF NEW.email IS DISTINCT FROM OLD.email THEN\n    NEW.email_verified_at := NULL;');
      const phone = body.indexOf(
        'IF NEW.phone_primary IS DISTINCT FROM OLD.phone_primary THEN\n    NEW.phone_verified_at := NULL;'
      );
      return raise > -1 && email > raise && phone > raise;
    },
    mutate: (s) => s.replace('NEW.phone_verified_at := NULL;', 'NULL;'),
  },
  'anyone else gets 42501': {
    check: (s) => /RAISE EXCEPTION 'residents: [^']*'[^;]*USING ERRCODE = '42501'/.test(s),
    mutate: (s) => s.replace("ERRCODE = '42501'", "ERRCODE = '23514'"),
  },
  'function is SECURITY INVOKER with a pinned search_path': {
    check: (s) => /SECURITY INVOKER\s+SET search_path = public/.test(s),
    mutate: (s) => s.replace('SECURITY INVOKER', 'SECURITY DEFINER'),
  },
  'rollback drops the trigger, then the function': {
    check: (s) => {
      const r = s.slice(s.indexOf('-- ROLLBACK:'));
      const t = r.indexOf('DROP TRIGGER');
      const f = r.indexOf('DROP FUNCTION');
      return t > -1 && f > t;
    },
    mutate: (s) => s.replace('-- DROP TRIGGER IF EXISTS residents_guard_self_service_columns ON public.residents;\n', ''),
  },
  'no grants or revokes (privileges are unchanged)': {
    check: (s) => !/\b(GRANT|REVOKE)\b/.test(upToRollback(s).split('\n').filter((l) => !l.trim().startsWith('--')).join('\n')),
    mutate: (s) =>
      s.replace('-- ROLLBACK:', 'REVOKE UPDATE ON public.residents FROM authenticated;\n\n-- ROLLBACK:'),
  },
};

describe('residents self-service columns guard migration (#728)', () => {
  it.each(Object.entries(CHECKS))('%s', (_name, { check }) => {
    expect(check(sql)).toBe(true);
  });

  it.each(Object.entries(CHECKS))('is able to fail: %s', (_name, { check, mutate }) => {
    const mutated = mutate(sql);
    expect(mutated).not.toBe(sql);
    expect(check(mutated)).toBe(false);
  });

  it('is a plain script: no psql meta-commands', () => {
    expect(sql).not.toMatch(/^\\/m);
  });
});
