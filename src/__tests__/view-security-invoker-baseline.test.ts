import { describe, expect, it } from 'vitest';
import { readdirSync, readFileSync } from 'node:fs';
import path from 'node:path';

const root = path.resolve(__dirname, '../../supabase');
const migrationsDir = path.join(root, 'migrations');
const baselinePath = path.join(root, 'baseline', '00000000000000_baseline.sql');

const SET_RE =
  /ALTER\s+VIEW\s+(?:IF\s+EXISTS\s+)?(?:public\.)?"?(\w+)"?\s+SET\s*\(([^)]*)\)/gi;
const CREATE_RE =
  /CREATE\s+(?:OR\s+REPLACE\s+)?VIEW\s+(?:public\.)?"?(\w+)"?\s+WITH\s*\(([^)]*)\)/gi;

/** Views for which `text` turns security_invoker on. */
function invokerViews(text: string): Set<string> {
  const sql = text.replace(/--[^\n]*/g, '');
  const out = new Set<string>();
  for (const re of [SET_RE, CREATE_RE]) {
    for (const m of sql.matchAll(re)) {
      if (/security_invoker\s*=\s*(true|on)/i.test(m[2])) out.add(m[1].toLowerCase());
    }
  }
  return out;
}

describe('view security_invoker survives a baseline rebuild (#450)', () => {
  it('detector recognises both syntaxes and ignores comments', () => {
    const s = invokerViews(
      `ALTER VIEW public.a SET (security_invoker = true);
       CREATE VIEW public.b WITH (security_invoker=on) AS SELECT 1;
       -- ALTER VIEW public.c SET (security_invoker = true);
       ALTER VIEW public.d SET (security_barrier = true);`,
    );
    expect([...s].sort()).toEqual(['a', 'b']);
  });

  it('baseline sets security_invoker on every view a migration sets it on', () => {
    const expected = new Set<string>();
    for (const f of readdirSync(migrationsDir).filter((n) => n.endsWith('.sql'))) {
      for (const v of invokerViews(readFileSync(path.join(migrationsDir, f), 'utf8'))) {
        expected.add(v);
      }
    }
    expect(expected.size).toBeGreaterThan(0);
    const baseline = invokerViews(readFileSync(baselinePath, 'utf8'));
    const missing = [...expected].filter((v) => !baseline.has(v));
    expect(missing).toEqual([]);
  });
});
