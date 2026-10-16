import { readFileSync } from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import { PERMISSIONS } from '@/lib/auth/action-roles';

/**
 * #716: residents.use_override_comms is guarded by a trigger, because the table-level UPDATE grant and the
 * "Residents can update own contact info" policy would otherwise let a resident PATCH their own flag.
 * Text assertions on the migration; each check is also run against a mutated copy and must fail there.
 */
const FILE = path.join(process.cwd(), 'supabase/migrations/20261017110000_residents_use_override_comms.sql');
const sql = readFileSync(FILE, 'utf8');

type Check = (s: string) => boolean;

const upToRollback = (s: string) => s.slice(0, s.indexOf('-- ROLLBACK:'));
const rollback = (s: string) => s.slice(s.indexOf('-- ROLLBACK:'));

const CHECKS: Record<string, { check: Check; mutate: (s: string) => string }> = {
  'trigger is BEFORE INSERT OR UPDATE, per row, on residents': {
    check: (s) =>
      /CREATE TRIGGER residents_guard_use_override_comms\s+BEFORE INSERT OR UPDATE ON public\.residents\s+FOR EACH ROW/.test(s),
    mutate: (s) => s.replace('BEFORE INSERT OR UPDATE', 'BEFORE UPDATE'),
  },
  'INSERT is guarded when the value is not null': {
    check: (s) => s.includes("TG_OP = 'INSERT' AND NEW.use_override_comms IS NOT NULL"),
    mutate: (s) => s.replace('NEW.use_override_comms IS NOT NULL', 'false'),
  },
  'UPDATE is guarded when the value changes': {
    check: (s) => s.includes("TG_OP = 'UPDATE' AND NEW.use_override_comms IS DISTINCT FROM OLD.use_override_comms"),
    mutate: (s) => s.replace('IS DISTINCT FROM OLD.use_override_comms', 'IS NULL'),
  },
  'service_role is allowed': {
    check: (s) => s.includes("auth.role() = 'service_role'"),
    mutate: (s) => s.replace("auth.role() = 'service_role'", 'false'),
  },
  'a session with no JWT is allowed': {
    check: (s) => s.includes('auth.uid() IS NULL'),
    mutate: (s) => s.replace('auth.uid() IS NULL', 'false'),
  },
  'settings.manage_general is allowed via has_permission': {
    check: (s) => s.includes(`public.has_permission('${PERMISSIONS.SETTINGS_MANAGE_GENERAL}')`),
    mutate: (s) => s.replace(`public.has_permission('${PERMISSIONS.SETTINGS_MANAGE_GENERAL}')`, 'false'),
  },
  'anyone else gets 42501': {
    check: (s) =>
      /RAISE EXCEPTION 'use_override_comms may only be changed by a settings manager'\s+USING ERRCODE = '42501'/.test(s),
    mutate: (s) => s.replace("ERRCODE = '42501'", "ERRCODE = '23514'"),
  },
  'function is SECURITY INVOKER with a pinned search_path': {
    check: (s) => /SECURITY INVOKER\s+SET search_path = public/.test(s),
    mutate: (s) => s.replace('SECURITY INVOKER', 'SECURITY DEFINER'),
  },
  'rollback drops the trigger, then the function, then the column': {
    check: (s) => {
      const r = rollback(s);
      const t = r.indexOf('DROP TRIGGER');
      const f = r.indexOf('DROP FUNCTION');
      const c = r.indexOf('DROP COLUMN');
      return t > -1 && f > t && c > f;
    },
    mutate: (s) => {
      const lines = rollback(s).split('\n');
      // Drop the column first, then the trigger and function.
      const swapped = [lines[0], lines[3], lines[1], lines[2], ...lines.slice(4)];
      return upToRollback(s) + swapped.join('\n');
    },
  },
  'no grants on the trigger function': {
    check: (s) => !/GRANT\s+EXECUTE/i.test(upToRollback(s)),
    mutate: (s) =>
      s.replace(
        '-- ROLLBACK:',
        'GRANT EXECUTE ON FUNCTION public.guard_residents_use_override_comms() TO authenticated;\n\n-- ROLLBACK:'
      ),
  },
};

describe('residents.use_override_comms guard migration (#716)', () => {
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

  it('only adds the column and the guard (alters no other column)', () => {
    expect(upToRollback(sql).match(/ALTER TABLE/g)).toHaveLength(1);
  });
});
