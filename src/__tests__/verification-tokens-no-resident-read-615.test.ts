import { describe, expect, it } from 'vitest';
import { readdirSync, readFileSync } from 'node:fs';
import path from 'node:path';

const dir = path.resolve(__dirname, '../../supabase/migrations');
const dropFile = path.join(dir, '20261015100000_drop_verification_tokens_resident_select.sql');

const SERVICE_ROLE_POLICY = 'Service role can manage verification tokens';

/** SQL with line comments removed. */
function sql(file: string): string {
  return readFileSync(file, 'utf8').replace(/--[^\n]*/g, '');
}

/** Policy name, quoted or bare. */
const NAME = '("[^"]+"|[A-Za-z_][A-Za-z0-9_]*)';
const TABLE = '(?:public\\.)?verification_tokens\\b';
const unquote = (n: string) => n.replace(/^"|"$/g, '');

/**
 * Replays CREATE POLICY / DROP POLICY on verification_tokens across every migration in
 * version order and returns the policies that survive. The table is read by the
 * service-role admin client only, so the only survivor allowed is the service-role one.
 */
function survivingPolicies(): Map<string, string> {
  const live = new Map<string, string>();
  const files = readdirSync(dir)
    .filter((f) => f.endsWith('.sql'))
    .sort();

  for (const f of files) {
    const text = sql(path.join(dir, f));
    const events: Array<{ at: number; kind: 'create' | 'drop'; name: string }> = [];

    for (const m of text.matchAll(new RegExp(`CREATE\\s+POLICY\\s+${NAME}\\s+ON\\s+${TABLE}`, 'gi'))) {
      events.push({ at: m.index ?? 0, kind: 'create', name: unquote(m[1]) });
    }
    for (const m of text.matchAll(
      new RegExp(`DROP\\s+POLICY\\s+(?:IF\\s+EXISTS\\s+)?${NAME}\\s+ON\\s+${TABLE}`, 'gi'),
    )) {
      events.push({ at: m.index ?? 0, kind: 'drop', name: unquote(m[1]) });
    }

    for (const e of events.sort((a, b) => a.at - b.at)) {
      if (e.kind === 'create') live.set(e.name, f);
      else live.delete(e.name);
    }
  }
  return live;
}

describe('#615 verification_tokens is not readable by residents', () => {
  it('leaves only the service-role policy once every migration is replayed', () => {
    // A SELECT policy for any other role exposes `token` (the 6-digit code). Adding one
    // back, under any name, fails here.
    expect([...survivingPolicies().keys()]).toEqual([SERVICE_ROLE_POLICY]);
  });

  it('sees the resident SELECT policy being created, so the replay is not vacuous', () => {
    const created = readFileSync(
      path.join(dir, '20251231001120_add_contact_verification.sql'),
      'utf8',
    );
    expect(created).toMatch(/CREATE POLICY "Users can view own verification tokens"/);
  });

  it('is a single idempotent DROP POLICY and nothing else', () => {
    const statements = sql(dropFile)
      .split(';')
      .map((s) => s.replace(/\s+/g, ' ').trim())
      .filter(Boolean);
    expect(statements).toEqual([
      'DROP POLICY IF EXISTS "Users can view own verification tokens" ON public.verification_tokens',
    ]);
  });

  it('documents a rollback that recreates the policy', () => {
    expect(readFileSync(dropFile, 'utf8')).toMatch(
      /--\s+CREATE POLICY "Users can view own verification tokens"/,
    );
  });
});
