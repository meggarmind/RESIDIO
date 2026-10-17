import fs from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';

/**
 * #701: process_expired_approvals() is SECURITY DEFINER and rejects every expired pending approval
 * estate-wide, so only service_role (the cron route's admin client) may EXECUTE it. Replays every
 * migration's EXECUTE grants and revokes on it, in file order, to find who ends up holding it.
 *
 * Lexical ratchet: it checks migration text, not live database grants. It understands plain
 * GRANT/REVOKE EXECUTE ON FUNCTION statements naming process_expired_approvals first, and the
 * blanket `GRANT EXECUTE ON ALL FUNCTIONS IN SCHEMA public`. It misses list-form statements where
 * process_expired_approvals is not the first function named (`ON FUNCTION public.a(),
 * public.process_expired_approvals() ...`) and grants issued from DO blocks or other dynamic SQL.
 * The authoritative proof is the has_function_privilege probe in the migration header, run after
 * the migration is applied.
 */

const DIR = path.resolve(__dirname, '../../supabase/migrations');
const ROLES = ['public', 'anon', 'authenticated', 'service_role'];

export function executeHolders(sqls: string[], initial: string[] = []): string[] {
  const holders = new Set(initial);
  const stmt =
    /\b(GRANT|REVOKE)\s+EXECUTE\s+ON\s+(?:FUNCTION\s+(?:public\.)?"?process_expired_approvals"?\b[^;]*?|ALL\s+FUNCTIONS\s+IN\s+SCHEMA\s+public)\s+(?:TO|FROM)\s+([^;]*);/gi;
  for (const sql of sqls) {
    for (const m of sql.replace(/--.*$/gm, '').matchAll(stmt)) {
      const roles = m[2].split(',').map((r) => r.trim().toLowerCase()).filter((r) => ROLES.includes(r));
      for (const role of roles) {
        if (m[1].toUpperCase() === 'GRANT') holders.add(role);
        else holders.delete(role);
      }
    }
  }
  return [...holders].sort();
}

describe('process_expired_approvals() EXECUTE grant (#701)', () => {
  it('only service_role holds EXECUTE after every migration', () => {
    const sqls = fs
      .readdirSync(DIR)
      .filter((f) => f.endsWith('.sql'))
      .sort()
      .map((f) => fs.readFileSync(path.join(DIR, f), 'utf8'));
    // The baseline (#279) granted EXECUTE ON ALL FUNCTIONS to these, which Prod's ledger starts from.
    expect(executeHolders(sqls, ['anon', 'authenticated', 'service_role'])).toEqual(['service_role']);
  });

  it('the replay tracks grants, revokes and the blanket schema grant', () => {
    expect(executeHolders(['GRANT EXECUTE ON FUNCTION process_expired_approvals TO authenticated;'])).toEqual([
      'authenticated',
    ]);
    expect(
      executeHolders(
        ['REVOKE EXECUTE ON FUNCTION public.process_expired_approvals() FROM PUBLIC, anon;'],
        ['anon', 'authenticated']
      )
    ).toEqual(['authenticated']);
    expect(executeHolders(['GRANT EXECUTE ON ALL FUNCTIONS IN SCHEMA public TO anon, authenticated;'])).toEqual([
      'anon',
      'authenticated',
    ]);
    expect(executeHolders(['-- GRANT EXECUTE ON FUNCTION public.process_expired_approvals() TO authenticated;'])).toEqual(
      []
    );
    expect(executeHolders(['GRANT EXECUTE ON FUNCTION public.process_expired_approvals_other() TO anon;'])).toEqual([]);
  });
});
