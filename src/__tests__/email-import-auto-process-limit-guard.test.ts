import { readFileSync } from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import { EMAIL_AUTO_PROCESS_LIMIT_KEY } from '@/lib/email-imports/utils';

/**
 * #710: only super_admin may change email_import_auto_process_limit, but the system_settings
 * INSERT/UPDATE policies also admit chairman and vice_chairman, so the settings actions' role
 * check could be skipped through the Data API. A BEFORE trigger closes that for this key only.
 *
 * This checks two declarative facts of the migration only: what the trigger fires on, and that the
 * key it guards is the one the app reads. The trigger's behaviour is not verified here. It was
 * driven against a throwaway PGlite outside the worktree (chairman as authenticated refused with
 * 42501, super_admin allowed, service_role allowed, other keys unaffected), and it must be
 * verified on Residio_Stage after the migration is applied.
 */
const FILE = path.join(process.cwd(), 'supabase/migrations/20261018130100_guard_email_import_auto_process_limit.sql');
const sql = readFileSync(FILE, 'utf8')
  .split('\n')
  .filter((l) => !l.trim().startsWith('--'))
  .join('\n');

function trigger(s: string) {
  const m = s.match(/CREATE\s+TRIGGER\s+\w+\s+(BEFORE|AFTER)\s+([\w\s]+?)\s+ON\s+([\w.]+)/i);
  return {
    timing: m?.[1].toUpperCase(),
    events: m?.[2].toUpperCase().split(/\s+OR\s+/).sort(),
    table: m?.[3],
  };
}

describe('email import auto-process limit guard migration (#710)', () => {
  it('fires before insert, update and delete on system_settings', () => {
    expect(trigger(sql)).toEqual({
      timing: 'BEFORE',
      events: ['DELETE', 'INSERT', 'UPDATE'],
      table: 'public.system_settings',
    });
  });

  it('guards the key the app reads', () => {
    expect(sql.match(/guarded_key\s+CONSTANT\s+text\s*:=\s*'([^']*)'/)?.[1]).toBe(EMAIL_AUTO_PROCESS_LIMIT_KEY);
  });
});
