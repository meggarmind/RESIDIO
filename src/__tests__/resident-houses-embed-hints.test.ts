import { describe, expect, it } from 'vitest';
import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join, relative } from 'node:path';

/**
 * resident_houses has TWO foreign keys to residents (resident_id, sponsor_resident_id), so any
 * embed between the two without an explicit hint fails with PGRST201 (#457, CORE.md section 13).
 */

const SRC = join(process.cwd(), 'src');

function walk(dir: string, out: string[] = []): string[] {
  for (const name of readdirSync(dir)) {
    const full = join(dir, name);
    if (statSync(full).isDirectory()) {
      if (name === '__tests__' || name === 'node_modules') continue;
      walk(full, out);
    } else if (/\.(ts|tsx)$/.test(name) && !/database\.generated\.ts$/.test(name)) {
      out.push(full);
    }
  }
  return out;
}

/** Returns a description of each unhinted resident_houses <-> residents embed in `source`. */
export function findUnhintedEmbeds(source: string): string[] {
  const hits: string[] = [];
  // Only the select string directly following .from('<table>') is inspected, so a neighbouring
  // query in the same statement cannot cause a false positive. `!inner` is a join modifier, not
  // an FK hint, so it does not disambiguate. Select strings built from variables are invisible.
  const selectAfterFrom = /from\(\s*'(resident_houses|residents)'\s*\)\s*\.select\(\s*(`[^`]*`|'[^']*'|"[^"]*")/g;
  for (const m of source.matchAll(selectAfterFrom)) {
    const [, table, select] = m;
    const bad =
      table === 'resident_houses'
        ? /\bresidents(?:!inner)?\s*\(/.test(select)
        : /\bresident_houses(?:!inner)?\s*\(/.test(select);
    if (bad) hits.push(`from ${table}: ${select.replace(/\s+/g, ' ').slice(0, 100)}`);
  }
  // nested: houses -> resident_houses( ... residents( ...) inside one select string
  const nested = /\bresident_houses(?:!inner)?\s*\([^;`]{0,600}?\bresidents(?:!inner)?\s*\(/g;
  for (const m of source.matchAll(nested)) hits.push(`nested: ${m[0].replace(/\s+/g, ' ').slice(0, 100)}`);
  return hits;
}

describe('findUnhintedEmbeds (detector sanity)', () => {
  it('flags the unhinted shapes', () => {
    expect(findUnhintedEmbeds(`.from('resident_houses').select('resident:residents(id)')`)).not.toHaveLength(0);
    expect(findUnhintedEmbeds(`.from('resident_houses').select('residents!inner(id)')`)).not.toHaveLength(0);
    expect(findUnhintedEmbeds(`.from('residents').select('resident_houses(id)')`)).not.toHaveLength(0);
    expect(findUnhintedEmbeds(`.from('houses').select('resident_houses(id, resident:residents(id))')`)).not.toHaveLength(0);
  });

  it('accepts hinted shapes', () => {
    expect(
      findUnhintedEmbeds(`.from('resident_houses').select('resident:residents!resident_houses_resident_id_fkey(id)')`)
    ).toHaveLength(0);
    expect(
      findUnhintedEmbeds(`.from('resident_houses').select('residents!resident_houses_resident_id_fkey!inner(id)')`)
    ).toHaveLength(0);
    expect(
      findUnhintedEmbeds(`.from('residents').select('resident_houses!resident_houses_resident_id_fkey(id)')`)
    ).toHaveLength(0);
    expect(
      findUnhintedEmbeds(`.from('houses').select('resident_houses(id, resident:residents!resident_id(id))')`)
    ).toHaveLength(0);
  });
});

describe('resident_houses embeds carry an explicit FK hint', () => {
  it('has no unhinted resident_houses <-> residents embed under src/', () => {
    const offenders: string[] = [];
    for (const file of walk(SRC)) {
      const hits = findUnhintedEmbeds(readFileSync(file, 'utf8'));
      for (const hit of hits) offenders.push(`${relative(process.cwd(), file)} :: ${hit}`);
    }
    expect(offenders).toEqual([]);
  }, 60_000);

  it.each([
    ['src/actions/email/send-payment-receipt-email.ts', 'residents!resident_houses_resident_id_fkey('],
    ['src/actions/email/send-welcome-email.ts', 'resident_houses!resident_houses_resident_id_fkey('],
    ['src/actions/residents/add-household-member.ts', 'residents!resident_houses_resident_id_fkey ('],
    ['src/actions/residents/add-household-member.ts', 'residents!resident_houses_resident_id_fkey('],
  ])('%s uses the hinted form %s', (file, needle) => {
    expect(readFileSync(join(process.cwd(), file), 'utf8')).toContain(needle);
  });
});
