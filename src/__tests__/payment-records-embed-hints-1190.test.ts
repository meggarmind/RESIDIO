import { describe, expect, it } from 'vitest';
import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join, relative } from 'node:path';

/**
 * #1190: payment_records has TWO foreign keys to residents (resident_id, paid_by_resident_id), so
 * any embed between the two without an explicit hint fails with PGRST201 (CORE.md section 13).
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

/** Returns a description of each unhinted payment_records <-> residents embed in `source`. */
function findUnhintedEmbeds(source: string): string[] {
  const hits: string[] = [];
  // Only the select string directly following .from('<table>') is inspected. `!inner` is a join
  // modifier, not an FK hint. Select strings built from variables are invisible.
  const selectAfterFrom = /from\(\s*'(payment_records|residents)'\s*\)\s*\.select\(\s*(`[^`]*`|'[^']*'|"[^"]*")/g;
  for (const m of source.matchAll(selectAfterFrom)) {
    const [, table, select] = m;
    const bad =
      table === 'payment_records'
        ? /\bresidents(?:!inner)?\s*\(/.test(select)
        : /\bpayment_records(?:!inner)?\s*\(/.test(select);
    if (bad) hits.push(`from ${table}: ${select.replace(/\s+/g, ' ').slice(0, 100)}`);
  }
  const nested = /\bpayment_records(?:!inner)?\s*\([^;`]{0,600}?\bresidents(?:!inner)?\s*\(/g;
  for (const m of source.matchAll(nested)) hits.push(`nested: ${m[0].replace(/\s+/g, ' ').slice(0, 100)}`);
  return hits;
}

describe('findUnhintedEmbeds (detector sanity)', () => {
  it('flags the unhinted shapes', () => {
    expect(findUnhintedEmbeds(`.from('payment_records').select('resident:residents(id)')`)).not.toHaveLength(0);
    expect(findUnhintedEmbeds(`.from('payment_records').select('residents!inner(id)')`)).not.toHaveLength(0);
    expect(findUnhintedEmbeds(`.from('residents').select('payment_records(id)')`)).not.toHaveLength(0);
    expect(findUnhintedEmbeds(`.from('houses').select('payment_records(id, resident:residents(id))')`)).not.toHaveLength(0);
  });

  it('accepts hinted shapes', () => {
    expect(
      findUnhintedEmbeds(`.from('payment_records').select('resident:residents!payment_records_resident_id_fkey(id)')`)
    ).toHaveLength(0);
    expect(
      findUnhintedEmbeds(`.from('payment_records').select('residents!payment_records_resident_id_fkey!inner(id)')`)
    ).toHaveLength(0);
  });
});

describe('payment_records embeds carry an explicit FK hint', () => {
  it('has no unhinted payment_records <-> residents embed under src/', () => {
    const offenders: string[] = [];
    for (const file of walk(SRC)) {
      for (const hit of findUnhintedEmbeds(readFileSync(file, 'utf8'))) {
        offenders.push(`${relative(process.cwd(), file)} :: ${hit}`);
      }
    }
    expect(offenders).toEqual([]);
  }, 60_000);
});
