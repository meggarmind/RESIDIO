import fs from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';

/**
 * #455 convention: migration 20261012210000 made profiles reads per-column for
 * anon/authenticated, so a column added to public.profiles afterwards is
 * unreadable through the API until it is granted. Every later migration that adds
 * a profiles column must also GRANT SELECT (column) on it in the same file.
 *
 * Deliberately line-pattern based; it only understands plain `ALTER TABLE
 * [public.]profiles ... ADD COLUMN [IF NOT EXISTS] name`. A fancier DDL form
 * (dynamic SQL in a DO block) escapes it, which is why the convention is also
 * written in the migration header.
 */

const DIR = path.resolve(__dirname, '../../supabase/migrations');
const CUTOFF = '20261012210000';

export function missingGrants(sql: string): string[] {
  const clean = sql.replace(/--.*$/gm, '');
  const added: string[] = [];
  const alter = /ALTER\s+TABLE\s+(?:ONLY\s+)?(?:IF\s+EXISTS\s+)?(?:public\.)?"?profiles"?\s+([^;]*);/gi;
  let m: RegExpExecArray | null;
  while ((m = alter.exec(clean))) {
    const col = /ADD\s+COLUMN\s+(?:IF\s+NOT\s+EXISTS\s+)?"?(\w+)"?/gi;
    let c: RegExpExecArray | null;
    while ((c = col.exec(m[1]))) added.push(c[1]);
  }

  const grants = [...clean.matchAll(/GRANT\s+SELECT\s*\(([^)]*)\)\s+ON\s+(?:TABLE\s+)?(?:public\.)?"?profiles"?\s+TO\s+[^;]*\bauthenticated\b/gi)]
    .flatMap((g) => g[1].split(',').map((x) => x.replace(/["\s]/g, '')));

  return added.filter((col) => !grants.includes(col));
}

describe('profiles column grants convention (#455)', () => {
  it('every migration after the lock-down that adds a profiles column grants SELECT on it', () => {
    const offenders = fs
      .readdirSync(DIR)
      .filter((f) => f.endsWith('.sql') && f.slice(0, 14) > CUTOFF)
      .flatMap((f) => missingGrants(fs.readFileSync(path.join(DIR, f), 'utf8')).map((col) => `${f}: ${col}`));
    expect(offenders).toEqual([]);
  });

  it('the checker flags an ungranted column and accepts a granted one', () => {
    expect(missingGrants('ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS nickname text;')).toEqual(['nickname']);
    expect(
      missingGrants(
        'ALTER TABLE profiles ADD COLUMN nickname text, ADD COLUMN bio text;\nGRANT SELECT (nickname) ON public.profiles TO authenticated;'
      )
    ).toEqual(['bio']);
    expect(
      missingGrants(
        'ALTER TABLE profiles ADD COLUMN nickname text;\nGRANT SELECT (nickname) ON public.profiles TO anon, authenticated;'
      )
    ).toEqual([]);
    expect(missingGrants('-- ALTER TABLE profiles ADD COLUMN x text;')).toEqual([]);
    expect(missingGrants('ALTER TABLE residents ADD COLUMN x text;')).toEqual([]);
  });
});
