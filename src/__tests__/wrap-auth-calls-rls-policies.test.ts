import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import { describe, expect, it } from 'vitest';

/**
 * Issue #63, slice 2. Supabase's `auth_rls_initplan` advisor flags policies that
 * call `auth.uid()` / `auth.role()` / `auth.jwt()` directly, which Postgres
 * re-evaluates per row. The migration rewrites each as `(select auth.uid())`.
 *
 * The change must not alter who can see or do anything, so this test pins it to
 * the live definitions captured in `fixtures/initplan-policies.json`: for every
 * policy the migration alters, the new USING / WITH CHECK text must equal the
 * original with ONLY the three auth calls wrapped, and the commented rollback
 * must restore every original verbatim. Nothing here connects to a database.
 */

const MIGRATION = '20261014170000_wrap_auth_calls_in_rls_policies.sql';
const migrationPath = path.join(
  fileURLToPath(new URL('../../supabase/migrations', import.meta.url)),
  MIGRATION
);
const fixturePath = fileURLToPath(new URL('./fixtures/initplan-policies.json', import.meta.url));

interface Policy {
  table: string;
  policy: string;
  cmd: string;
  using: string | null;
  check: string | null;
}

/**
 * Policies deliberately NOT altered here: their predicate compares
 * app_roles.name to string literals, so restating it in a new migration trips
 * hardcoded-role-name-ratchet.test.ts. They need their own change to
 * has_permission(), which is not a no-op rewrite.
 */
const LEFT_OUT = [{ table: 'documents', policy: 'Users can view documents based on permissions' }];

const originals: Policy[] = JSON.parse(readFileSync(fixturePath, 'utf8'));
const included = originals.filter(
  (p) => !LEFT_OUT.some((o) => o.table === p.table && o.policy === p.policy)
);

/** Independent expectation: the simplest possible textual wrap. */
function wrap(text: string): string {
  return text
    .replace(/auth\.uid\(\)/g, '(select auth.uid())')
    .replace(/auth\.role\(\)/g, '(select auth.role())')
    .replace(/auth\.jwt\(\)/g, '(select auth.jwt())');
}

interface Altered {
  policy: string;
  table: string;
  using: string | null;
  check: string | null;
}

function parseStatements(sql: string): Altered[] {
  const out: Altered[] = [];
  for (const raw of sql.split(/;\n/)) {
    const stmt = raw.trim();
    if (!stmt) continue;
    const head = /^ALTER POLICY "([^"]+)" ON public\.([a-z_]+)\n/.exec(stmt);
    if (!head) throw new Error(`Unrecognised statement:\n${stmt.slice(0, 200)}`);
    const rest = stmt.slice(head[0].length);
    const using = /^ {2}USING \(\n([\s\S]*?)\n {2}\)(?=\n {2}WITH CHECK|$)/.exec(rest);
    const afterUsing = using ? rest.slice(using[0].length).replace(/^\n/, '') : rest;
    const check = /^ {2}WITH CHECK \(\n([\s\S]*?)\n {2}\)$/.exec(afterUsing);
    if (!using && !check) throw new Error(`No clause in:\n${stmt.slice(0, 200)}`);
    if (using && afterUsing && !check) throw new Error(`Trailing text in:\n${stmt.slice(0, 200)}`);
    out.push({ policy: head[1], table: head[2], using: using?.[1] ?? null, check: check?.[1] ?? null });
  }
  return out;
}

/** Splits a migration into its commented rollback lines and its executable body. */
function splitMigration(sql: string): { rollback: string; body: string } {
  const lines = sql.split('\n');
  const rollbackLines: string[] = [];
  const bodyLines: string[] = [];
  let inRollback = false;
  for (const line of lines) {
    if (line === '-- BEGIN;') {
      inRollback = true;
      continue;
    }
    if (line === '-- COMMIT;') {
      inRollback = false;
      continue;
    }
    if (inRollback) rollbackLines.push(line.replace(/^-- ?/, ''));
    else if (!line.startsWith('--')) bodyLines.push(line);
  }
  return { rollback: rollbackLines.join('\n'), body: bodyLines.join('\n') };
}

const sql = readFileSync(migrationPath, 'utf8');
const { rollback, body } = splitMigration(sql);
const inner = body.replace(/^\s*BEGIN;\n/, '').replace(/\nCOMMIT;\s*$/, '\n');
const altered = parseStatements(inner);
const rolledBack = parseStatements(rollback);

const find = (list: Altered[], t: string, n: string) =>
  list.filter((a) => a.table === t && a.policy === n);

describe('wrap auth calls in RLS policies (#63)', () => {
  it('fixture holds the 45 flagged policies on 26 tables', () => {
    expect(originals).toHaveLength(45);
    expect(new Set(originals.map((p) => p.table)).size).toBe(26);
  });

  it('is a single transaction', () => {
    expect(body.trim().startsWith('BEGIN;')).toBe(true);
    expect(body.trim().endsWith('COMMIT;')).toBe(true);
  });

  it('alters exactly the included policies, once each, and nothing else', () => {
    expect(altered).toHaveLength(included.length);
    const keys = altered.map((a) => `${a.table}|${a.policy}`);
    expect(new Set(keys).size).toBe(keys.length);
    expect(keys.sort()).toEqual(included.map((p) => `${p.table}|${p.policy}`).sort());
  });

  it('contains only ALTER POLICY statements (no DROP/CREATE or other DDL/DML)', () => {
    const statements = inner.split(/;\n/).map((s) => s.trim()).filter(Boolean);
    expect(statements.every((s) => s.startsWith('ALTER POLICY "'))).toBe(true);
    expect(inner).not.toMatch(/\b(DROP|CREATE|INSERT|UPDATE\s+public|DELETE\s+FROM|GRANT|REVOKE)\b/);
  });

  it('leaves out only the role-name policy that would trip the ratchet', () => {
    for (const o of LEFT_OUT) {
      expect(originals.some((p) => p.table === o.table && p.policy === o.policy)).toBe(true);
      expect(find(altered, o.table, o.policy)).toHaveLength(0);
    }
  });

  describe.each(included)('$table / $policy', (original) => {
    const matches = find(altered, original.table, original.policy);

    it('has exactly one ALTER POLICY statement', () => {
      expect(matches).toHaveLength(1);
    });

    it('wraps USING and changes nothing else', () => {
      const [a] = matches;
      expect(a.using).toBe(original.using === null ? null : wrap(original.using));
    });

    it('wraps WITH CHECK and changes nothing else', () => {
      const [a] = matches;
      expect(a.check).toBe(original.check === null ? null : wrap(original.check));
    });

    it('leaves no bare auth call outside (select ...)', () => {
      const [a] = matches;
      for (const clause of [a.using, a.check]) {
        if (clause === null) continue;
        const stripped = clause.replace(/\(select auth\.(uid|role|jwt)\(\)\)/g, '');
        expect(stripped).not.toMatch(/auth\./);
        expect(clause).not.toMatch(/\(select \(select/);
      }
    });

    it('rollback restores the original verbatim', () => {
      const back = find(rolledBack, original.table, original.policy);
      expect(back).toHaveLength(1);
      expect(back[0].using).toBe(original.using);
      expect(back[0].check).toBe(original.check);
    });
  });

  it('rollback covers exactly the included policies', () => {
    expect(rolledBack).toHaveLength(included.length);
  });
});
