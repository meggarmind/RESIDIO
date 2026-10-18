import { readFileSync } from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import { EMAIL_AUTO_PROCESS_LIMIT_KEY } from '@/lib/email-imports/utils';

/**
 * #710: only super_admin may change email_import_auto_process_limit, but the system_settings
 * INSERT/UPDATE policies also admit chairman and vice_chairman, so the settings actions' role
 * check could be skipped through the Data API. A BEFORE trigger closes that for this key only.
 *
 * Nothing here connects to a database. The migration is parsed into the parts the trigger acts
 * on (events, guarded key, API roles, allowed role, error code) and its rule is replayed over a
 * matrix of callers. Each check is also run against a mutated copy and must fail there. The
 * trigger itself is verified on Residio_Stage after the migration is applied.
 */
const FILE = path.join(process.cwd(), 'supabase/migrations/20261018130100_guard_email_import_auto_process_limit.sql');
const sql = readFileSync(FILE, 'utf8');

type Op = 'INSERT' | 'UPDATE' | 'DELETE';

interface Guard {
  table: string;
  events: Op[];
  guardedKey: string;
  apiRoles: string[];
  allowedRole: string;
  errcode: string;
  checksOld: boolean;
  checksNew: boolean;
  invoker: boolean;
  rollback: string[];
}

function parse(s: string): Guard {
  const trigger = s.match(/CREATE TRIGGER \w+\s+BEFORE ([A-Z ]+?) ON ([\w.]+)\s+FOR EACH ROW/);
  return {
    table: trigger?.[2] ?? '',
    events: (trigger?.[1].split(' OR ') ?? []) as Op[],
    guardedKey: s.match(/guarded_key CONSTANT text := '([^']*)'/)?.[1] ?? '',
    apiRoles: [...(s.match(/current_user IN \(([^)]*)\)/)?.[1] ?? '').matchAll(/'([^']*)'/g)].map((m) => m[1]),
    allowedRole: s.match(/get_my_role_name\(\) IS DISTINCT FROM '([^']*)'/)?.[1] ?? '',
    errcode: s.match(/USING ERRCODE = '([^']*)'/)?.[1] ?? '',
    checksOld: /IF TG_OP <> 'INSERT' THEN\s+touched := OLD\.key = guarded_key;/.test(s),
    checksNew: /IF TG_OP <> 'DELETE' THEN\s+touched := touched OR NEW\.key = guarded_key;/.test(s),
    invoker: /SECURITY INVOKER\s+SET search_path = public/.test(s),
    rollback: [...s.slice(s.indexOf('-- ROLLBACK:')).matchAll(/^-- (DROP \w+)/gm)].map((m) => m[1]),
  };
}

/** What the trigger does for one write: the error code it raises, or the row it returns. */
function run(g: Guard, op: Op, keys: { old?: string; new?: string }, currentUser: string, role: string | null) {
  if (!g.events.includes(op)) return op === 'DELETE' ? 'OLD' : 'NEW';
  const touched =
    (g.checksOld && op !== 'INSERT' && keys.old === g.guardedKey) ||
    (g.checksNew && op !== 'DELETE' && keys.new === g.guardedKey);
  if (touched && g.apiRoles.includes(currentUser) && role !== g.allowedRole) return g.errcode;
  return op === 'DELETE' ? 'OLD' : 'NEW';
}

const KEY = EMAIL_AUTO_PROCESS_LIMIT_KEY;
const OTHER = 'estate_name';
const OPS: Op[] = ['INSERT', 'UPDATE', 'DELETE'];
const keysFor = (op: Op, key: string) => (op === 'INSERT' ? { new: key } : op === 'DELETE' ? { old: key } : { old: key, new: key });
const ok = (op: Op) => (op === 'DELETE' ? 'OLD' : 'NEW');

const CHECKS: Record<string, { check: (g: Guard) => boolean; mutate: (s: string) => string }> = {
  'guards system_settings and the limit key the app reads': {
    check: (g) => g.table === 'public.system_settings' && g.guardedKey === KEY,
    mutate: (s) => s.replace(`'${KEY}'`, "'email_import_limit'"),
  },
  'chairman and vice_chairman are refused 42501 on insert, update and delete': {
    check: (g) =>
      ['chairman', 'vice_chairman', 'financial_officer', null].every((role) =>
        OPS.every((op) => run(g, op, keysFor(op, KEY), 'authenticated', role) === '42501')
      ),
    mutate: (s) => s.replace('BEFORE INSERT OR UPDATE OR DELETE', 'BEFORE INSERT OR UPDATE'),
  },
  'renaming another row to the key, or the key row away, is refused': {
    check: (g) =>
      run(g, 'UPDATE', { old: OTHER, new: KEY }, 'authenticated', 'chairman') === '42501' &&
      run(g, 'UPDATE', { old: KEY, new: OTHER }, 'authenticated', 'chairman') === '42501',
    mutate: (s) => s.replace('touched := OLD.key = guarded_key;', 'NULL;'),
  },
  'anon is refused': {
    check: (g) => run(g, 'UPDATE', keysFor('UPDATE', KEY), 'anon', null) === '42501',
    mutate: (s) => s.replace("current_user IN ('authenticated', 'anon')", "current_user IN ('authenticated')"),
  },
  'super_admin passes and gets its row back': {
    check: (g) => OPS.every((op) => run(g, op, keysFor(op, KEY), 'authenticated', 'super_admin') === ok(op)),
    mutate: (s) => s.replace("IS DISTINCT FROM 'super_admin'", "IS DISTINCT FROM 'superadmin'"),
  },
  'service_role, postgres and definer owners pass': {
    check: (g) =>
      ['service_role', 'postgres', 'supabase_admin'].every((u) =>
        OPS.every((op) => run(g, op, keysFor(op, KEY), u, null) === ok(op))
      ),
    mutate: (s) => s.replace("current_user IN ('authenticated', 'anon')", "current_user IN ('authenticated', 'anon', 'service_role')"),
  },
  'other settings are untouched for every role': {
    check: (g) => OPS.every((op) => run(g, op, keysFor(op, OTHER), 'authenticated', 'chairman') === ok(op)),
    mutate: (s) => s.replace(`'${KEY}'`, `'${OTHER}'`),
  },
  'function is SECURITY INVOKER with a pinned search_path': {
    check: (g) => g.invoker,
    mutate: (s) => s.replace('SECURITY INVOKER', 'SECURITY DEFINER'),
  },
  'rollback drops the trigger, then the function': {
    check: (g) => JSON.stringify(g.rollback) === JSON.stringify(['DROP TRIGGER', 'DROP FUNCTION']),
    mutate: (s) => s.replace(/^-- DROP TRIGGER .*\n/m, ''),
  },
};

describe('email import auto-process limit guard migration (#710)', () => {
  it.each(Object.entries(CHECKS))('%s', (_name, { check }) => {
    expect(check(parse(sql))).toBe(true);
  });

  it.each(Object.entries(CHECKS))('is able to fail: %s', (_name, { check, mutate }) => {
    const mutated = mutate(sql);
    expect(mutated).not.toBe(sql);
    expect(check(parse(mutated))).toBe(false);
  });

  it('is idempotent and changes no policy or privilege', () => {
    const body = sql.slice(0, sql.indexOf('-- ROLLBACK:')).split('\n').filter((l) => !l.trim().startsWith('--')).join('\n');
    expect(body).toMatch(/CREATE OR REPLACE FUNCTION public\.guard_email_import_auto_process_limit\(\)/);
    expect(body).toMatch(/DROP TRIGGER IF EXISTS system_settings_guard_email_import_auto_process_limit ON public\.system_settings;/);
    expect(body).not.toMatch(/\b(GRANT|REVOKE|POLICY)\b/);
  });
});
