import { readFileSync, readdirSync, statSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import { describe, expect, it } from 'vitest';

/**
 * The "Users can update own profile" RLS policy limits which rows a signed-in
 * user can update, but RLS cannot limit columns, and the table-level UPDATE
 * grant covered every column. A user could set their own role_id to
 * super_admin with a single Data API call. Verified against the live database
 * inside a rolled-back transaction before the migration was written.
 *
 * The fix is column privileges: authenticated may update only the two theme
 * columns. Two things keep that true:
 *
 * 1. The migration revokes table-level UPDATE and grants exactly those columns.
 * 2. No action writes any other profiles column through the session client.
 *    If one ever needs to, it must use createAdminClient after its own
 *    authorizePermission() check, or widen the grant in a reviewed migration.
 *
 * Structural assertions only. Nothing here connects to a database.
 */

const root = fileURLToPath(new URL('../..', import.meta.url));
const migration = readFileSync(
  path.join(root, 'supabase/migrations/20261011120000_restrict_profiles_column_updates.sql'),
  'utf8',
);
const sql = migration
  .split('\n')
  .filter((line) => !line.trim().startsWith('--'))
  .join('\n')
  .replace(/\s+/g, ' ')
  .trim();

const GRANTED_COLUMNS = ['dashboard_theme_override', 'portal_theme_override'];

function listFiles(dir: string): string[] {
  return readdirSync(dir).flatMap((entry) => {
    const full = path.join(dir, entry);
    if (statSync(full).isDirectory()) return listFiles(full);
    return /\.(ts|tsx)$/.test(entry) ? [full] : [];
  });
}

describe('profiles column-level UPDATE grants', () => {
  it('revokes table-level UPDATE from anon and authenticated', () => {
    expect(sql).toContain('REVOKE UPDATE ON public.profiles FROM anon, authenticated;');
  });

  it('removes every anon write and TRUNCATE, which bypasses RLS', () => {
    expect(sql).toContain('REVOKE INSERT, DELETE ON public.profiles FROM anon;');
    expect(sql).toContain('REVOKE TRUNCATE ON public.profiles FROM anon, authenticated;');
  });

  it('grants authenticated UPDATE on the theme columns only', () => {
    const grants = [...sql.matchAll(/GRANT UPDATE \(([^)]*)\) ON public\.profiles TO (\w+);/g)];
    expect(grants).toHaveLength(1);
    const [, columns, grantee] = grants[0];
    expect(grantee).toBe('authenticated');
    expect(columns.split(',').map((c) => c.trim()).sort()).toEqual(GRANTED_COLUMNS);
  });

  it('grants nothing else and never grants table-level UPDATE back', () => {
    expect(sql.match(/\bGRANT\b/g)).toHaveLength(1);
    expect(sql).not.toMatch(/GRANT UPDATE ON/);
    expect(sql).not.toMatch(/GRANT ALL/);
  });

  it('session-client profiles writes touch only granted columns', () => {
    const offenders: string[] = [];
    const write = /\.from\(\s*[`'"]profiles[`'"]\s*\)\s*\.(update|upsert|insert)\(/g;
    for (const file of listFiles(path.join(root, 'src'))) {
      if (file.includes(`${path.sep}__tests__${path.sep}`)) continue;
      const source = readFileSync(file, 'utf8');
      for (const match of source.matchAll(write)) {
        const before = source.slice(source.lastIndexOf(';', match.index) + 1, match.index);
        // Inline receiver: the statement itself must build the admin client.
        if (/createAdminClient\(\)\s*\)?\s*$/.test(before)) continue;
        const receiver = /(\w+)\s*$/.exec(before)?.[1];
        // Named receiver: every declaration of that name in the file must be
        // the admin client. A trusted-sounding name is not enough.
        const declarations = receiver
          ? [...source.matchAll(new RegExp(`(?:const|let|var)\\s+${receiver}\\s*=\\s*([^;]+);`, 'g'))]
          : [];
        if (declarations.length > 0 && declarations.every((d) => /^(await\s+)?createAdminClient\(/.test(d[1].trim()))) {
          continue;
        }
        // POSIX separators, so the expectation below holds on Windows checkouts too.
        const relative = path.relative(root, file).split(path.sep).join('/');
        offenders.push(`${relative} (${match[1]} via ${receiver ?? 'inline client'})`);
      }
    }
    // The single permitted session-client writer, reviewed below.
    expect(offenders).toEqual(['src/actions/settings/theme-preferences.ts (update via supabase)']);
  });

  it('the theme-preferences writer updates only the granted columns', () => {
    const source = readFileSync(path.join(root, 'src/actions/settings/theme-preferences.ts'), 'utf8');
    // What is actually passed to .update(), not just the object built for it.
    const updateArgs = [...source.matchAll(/\.from\(\s*['"]profiles['"]\s*\)\s*\.update\(([^)]*)\)/g)].map((m) => m[1].trim());
    expect(updateArgs).toEqual(['updateData']);
    const updateData = /const updateData = ([\s\S]*?);/.exec(source)?.[1] ?? '';
    expect(updateData).not.toContain('...');
    const columns = [...updateData.matchAll(/(\w+):/g)].map((m) => m[1]).sort();
    expect([...new Set(columns)]).toEqual(GRANTED_COLUMNS);
  });
});
