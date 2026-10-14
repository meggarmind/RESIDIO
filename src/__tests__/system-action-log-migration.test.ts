import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import { describe, expect, it } from 'vitest';

/**
 * Static checks on the System Action Log migrations (#538). Pins the text of the SQL
 * (no database): the table shape, the single SELECT policy, the grants, and the
 * permission seed that only super_admin receives.
 */

const root = fileURLToPath(new URL('../..', import.meta.url));

function load(name: string): string {
  return readFileSync(path.join(root, 'supabase/migrations', name), 'utf8')
    .split('\n')
    .filter((line) => !line.trim().startsWith('--'))
    .join('\n')
    .replace(/\s+/g, ' ')
    .trim();
}

const table = load('20261014170000_system_action_log.sql');
const seed = load('20261014171000_seed_system_view_system_log_permission.sql');

describe('system_action_log table migration (static)', () => {
  it('creates the table with the decided columns', () => {
    expect(table).toContain('CREATE TABLE public.system_action_log');
    expect(table).toContain('id uuid PRIMARY KEY DEFAULT gen_random_uuid()');
    expect(table).toContain('occurred_at timestamptz NOT NULL DEFAULT now()');
    expect(table).toContain('source text NOT NULL');
    expect(table).toContain('action text NOT NULL');
    expect(table).toContain("summary jsonb NOT NULL DEFAULT '{}'::jsonb");
    expect(table).toContain('error_message text,');
    expect(table).toContain('duration_ms integer');
  });

  it('restricts outcome to success, partial and failure', () => {
    expect(table).toContain("outcome text NOT NULL CHECK (outcome IN ('success', 'partial', 'failure'))");
  });

  it('indexes by time and by source and time', () => {
    expect(table).toContain('(occurred_at DESC)');
    expect(table).toContain('(source, occurred_at DESC)');
  });

  it('enables row level security', () => {
    expect(table).toContain('ALTER TABLE public.system_action_log ENABLE ROW LEVEL SECURITY');
  });

  it('has exactly one policy: SELECT for authenticated via has_permission', () => {
    expect(table.match(/CREATE POLICY/g)).toHaveLength(1);
    expect(table).toMatch(
      /CREATE POLICY "[^"]+" ON public\.system_action_log FOR SELECT TO authenticated USING \(public\.has_permission\('system\.view_system_log'\)\)/,
    );
  });

  it('has no insert, update or delete policy', () => {
    expect(table).not.toMatch(/FOR (INSERT|UPDATE|DELETE|ALL)/i);
  });

  it('revokes everything from the API roles and grants SELECT only to authenticated', () => {
    expect(table).toContain('REVOKE ALL ON public.system_action_log FROM PUBLIC, anon, authenticated');
    expect(table).toContain('GRANT SELECT ON public.system_action_log TO authenticated');
    expect(table.match(/GRANT /g)).toHaveLength(1);
  });
});

describe('system.view_system_log seed migration (static)', () => {
  it('seeds the permission idempotently in the system category', () => {
    expect(seed).toContain('INSERT INTO public.app_permissions');
    expect(seed).toContain("'system.view_system_log'");
    expect(seed).toContain("'View System Action Log'");
    expect(seed).toMatch(/'system', true \) ON CONFLICT \(name\) DO NOTHING/);
  });

  it('does not add an enum value', () => {
    expect(seed).not.toContain('ALTER TYPE');
  });

  it('grants it to super_admin and no other role', () => {
    expect(seed).toContain("WHERE r.name = 'super_admin'");
    expect(seed).not.toMatch(/r\.name IN/);
    expect(seed).not.toContain('chairman');
    expect(seed).not.toContain('vice_chairman');
    expect(seed).toContain('ON CONFLICT DO NOTHING');
  });
});
