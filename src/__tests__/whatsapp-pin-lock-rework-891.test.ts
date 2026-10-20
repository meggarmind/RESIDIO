import { readFileSync } from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';

/**
 * #891: the WhatsApp PIN lock, reworked to the owner's spec (3 wrong in a row locks 15 minutes; 6 wrong
 * within 24 hours locks until the estate office resets it; a correct PIN resets the in-a-row count).
 *
 * This checks the migration text only, not function behaviour: structural assertions on the SQL. Each check
 * is also run against a mutated copy and must fail there. Nothing here connects to a database; the functions
 * are exercised by the lock probe in the migration header on Residio_Stage after the migration is applied.
 */
const FILE = path.join(process.cwd(), 'supabase/migrations/20261021120000_whatsapp_pin_lock_rework.sql');
const sql = readFileSync(FILE, 'utf8');

/** The executable part: everything from the transaction start, with the header comments left out. */
const body = (s: string) => s.slice(s.indexOf('\nBEGIN;\n'));
const claimFn = (s: string) => {
  const b = body(s);
  const start = b.indexOf('CREATE OR REPLACE FUNCTION public.claim_whatsapp_pin_try(');
  return start < 0 ? '' : b.slice(start, b.indexOf('$fn$;', start));
};
const clearFn = (s: string) => {
  const b = body(s);
  const start = b.indexOf('CREATE OR REPLACE FUNCTION public.clear_whatsapp_pin_try(');
  return start < 0 ? '' : b.slice(start, b.indexOf('$fn$;', start));
};

type Check = (s: string) => boolean;

/** Replaces in the executable part only, so a match in the header comments cannot stand in for the code. */
const inBody = (from: string, to: string) => (s: string) => {
  const i = s.indexOf('\nBEGIN;\n');
  return s.slice(0, i) + s.slice(i).replace(from, to);
};

const CHECKS: Record<string, { check: Check; mutate: (s: string) => string }> = {
  'thresholds default to 3 in a row, 15 minutes, 6 in 24 hours': {
    check: (s) =>
      /p_soft_limit integer DEFAULT 3,\s+p_soft_lock_minutes integer DEFAULT 15,\s+p_hard_limit integer DEFAULT 6,\s+p_window_hours integer DEFAULT 24\s*\)/.test(
        claimFn(s)
      ),
    mutate: inBody('p_hard_limit integer DEFAULT 6', 'p_hard_limit integer DEFAULT 10'),
  },
  'counting is atomic: the row is locked before it is read and updated': {
    check: (s) => {
      const f = claimFn(s);
      const lock = f.indexOf('WHERE r.id = p_resident_id FOR UPDATE;');
      return lock > -1 && lock < f.indexOf('UPDATE public.residents');
    },
    mutate: inBody('WHERE r.id = p_resident_id FOR UPDATE;', 'WHERE r.id = p_resident_id;'),
  },
  'a hard lock refuses every try and has no expiry': {
    check: (s) => {
      const f = claimFn(s);
      const hard = f.indexOf('IF v_row.whatsapp_pin_hard_locked_at IS NOT NULL THEN\n');
      return hard > -1 && hard < f.indexOf('IF v_row.whatsapp_pin_locked_until > v_now THEN') && hard < f.indexOf('UPDATE public.residents');
    },
    mutate: inBody(
        'IF v_row.whatsapp_pin_hard_locked_at IS NOT NULL THEN\n',
        "IF v_row.whatsapp_pin_hard_locked_at > v_now - interval '24 hours' THEN\n"
      ),
  },
  'the 15-minute lock refuses tries until it ends': {
    check: (s) => /IF v_row\.whatsapp_pin_locked_until > v_now THEN\s+RETURN QUERY SELECT 'locked'::text/.test(claimFn(s)),
    mutate: inBody('IF v_row.whatsapp_pin_locked_until > v_now THEN', 'IF false THEN'),
  },
  'the in-a-row count restarts at 1 after an ended 15-minute lock': {
    check: (s) =>
      claimFn(s).includes(
        'v_in_a_row := CASE WHEN v_row.whatsapp_pin_locked_until IS NOT NULL THEN 1\n                     ELSE v_row.whatsapp_pin_failed_attempts + 1 END;'
      ),
    mutate: inBody('IS NOT NULL THEN 1\n', 'IS NOT NULL THEN v_row.whatsapp_pin_failed_attempts + 1\n'),
  },
  'the 3rd wrong in a row sets the 15-minute lock': {
    check: (s) =>
      /v_locked_until := CASE WHEN v_in_a_row >= p_soft_limit\s+THEN v_now \+ make_interval\(mins => p_soft_lock_minutes\) END;/.test(
        claimFn(s)
      ),
    mutate: inBody('WHEN v_in_a_row >= p_soft_limit', 'WHEN v_in_a_row > p_soft_limit'),
  },
  'only tries within the last 24 hours stay in the window': {
    check: (s) => claimFn(s).includes('WHERE t > v_now - make_interval(hours => p_window_hours)'),
    mutate: inBody('WHERE t > v_now - make_interval(hours => p_window_hours)', 'WHERE true'),
  },
  'the 6th wrong in the window sets the hard lock': {
    check: (s) =>
      claimFn(s).includes('whatsapp_pin_hard_locked_at = CASE WHEN cardinality(v_window) >= p_hard_limit THEN v_now END'),
    mutate: inBody('cardinality(v_window) >= p_hard_limit THEN v_now END', 'cardinality(v_window) > p_hard_limit THEN v_now END'),
  },
  'a correct PIN resets the in-a-row count and the 15-minute lock': {
    check: (s) => /SET whatsapp_pin_failed_attempts = 0,\s+whatsapp_pin_locked_until = NULL,/.test(clearFn(s)),
    mutate: inBody('SET whatsapp_pin_failed_attempts = 0,', 'SET whatsapp_pin_failed_attempts = r.whatsapp_pin_failed_attempts,'),
  },
  'a correct PIN takes only its own try out of the window': {
    check: (s) => clearFn(s).includes('whatsapp_pin_failed_at = array_remove(r.whatsapp_pin_failed_at, p_claimed_at)'),
    mutate: inBody('array_remove(r.whatsapp_pin_failed_at, p_claimed_at)', "'{}'"),
  },
  'a correct PIN lifts a hard lock only when its own try set it': {
    check: (s) =>
      /whatsapp_pin_hard_locked_at = CASE WHEN r\.whatsapp_pin_hard_locked_at = p_claimed_at THEN NULL\s+ELSE r\.whatsapp_pin_hard_locked_at END/.test(
        clearFn(s)
      ),
    mutate: inBody('ELSE r.whatsapp_pin_hard_locked_at END', 'ELSE NULL END'),
  },
  'the claimed try is stamped with clock_timestamp so it can be matched back': {
    check: (s) => claimFn(s).includes('v_now timestamptz := clock_timestamp();'),
    mutate: inBody('v_now timestamptz := clock_timestamp();', 'v_now timestamptz := now();'),
  },
  'the 5-wrong / 24-hour function is dropped': {
    check: (s) => body(s).includes('DROP FUNCTION IF EXISTS public.claim_whatsapp_pin_attempt(uuid, integer, integer);'),
    mutate: inBody('DROP FUNCTION IF EXISTS public.claim_whatsapp_pin_attempt(uuid, integer, integer);', ''),
  },
  'both functions are SECURITY INVOKER with an empty search_path': {
    check: (s) => [claimFn(s), clearFn(s)].every((f) => /SECURITY INVOKER\s+SET search_path = ''/.test(f)),
    mutate: inBody('SECURITY INVOKER', 'SECURITY DEFINER'),
  },
  'only service_role can execute either function': {
    check: (s) =>
      [
        'public.claim_whatsapp_pin_try(uuid, integer, integer, integer, integer)',
        'public.clear_whatsapp_pin_try(uuid, timestamptz)',
      ].every(
        (fn) =>
          body(s).includes(`REVOKE ALL ON FUNCTION ${fn} FROM PUBLIC, anon, authenticated;`) &&
          body(s).includes(`GRANT EXECUTE ON FUNCTION ${fn} TO service_role;`)
      ),
    mutate: inBody(
        'REVOKE ALL ON FUNCTION public.clear_whatsapp_pin_try(uuid, timestamptz) FROM PUBLIC, anon, authenticated;',
        'REVOKE ALL ON FUNCTION public.clear_whatsapp_pin_try(uuid, timestamptz) FROM PUBLIC;'
      ),
  },
};

describe('WhatsApp PIN lock rework migration (#891)', () => {
  it.each(Object.entries(CHECKS))('%s', (_name, { check }) => {
    expect(check(sql)).toBe(true);
  });

  it.each(Object.entries(CHECKS))('is able to fail: %s', (_name, { check, mutate }) => {
    const mutated = mutate(sql);
    expect(mutated).not.toBe(sql);
    expect(check(mutated)).toBe(false);
  });

  it('is a plain script in one transaction: no psql meta-commands', () => {
    expect(sql).not.toMatch(/^\\/m);
    expect(body(sql).trim().startsWith('BEGIN;')).toBe(true);
    expect(body(sql).trim().endsWith('COMMIT;')).toBe(true);
  });
});
