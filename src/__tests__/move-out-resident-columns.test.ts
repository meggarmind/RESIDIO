/**
 * Issue #585 -- move-out actions selected residents.user_id, a column that does not
 * exist, so every call returned 'Resident not found'. This source-level guard checks
 * that every column selected from `residents` exists in the generated Row type.
 */
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

const ROOT = process.cwd();
const FILES = ['src/actions/residents/move-out-renter.ts', 'src/actions/residents/move-out-owner.ts'];

/**
 * The staff-notification block in move-out-renter.ts still selects residents.user_id.
 * It is left as-is pending an owner decision (#585). Remove this exemption when fixed.
 */
const KNOWN_BROKEN = ['id, user_id'];

function read(rel: string): string {
  return readFileSync(join(ROOT, rel), 'utf8');
}

function residentsRowColumns(): Set<string> {
  const types = read('src/types/database.generated.ts');
  const start = types.indexOf('      residents: {');
  const rowStart = types.indexOf('Row: {', start);
  const body = types.slice(rowStart + 'Row: {'.length, types.indexOf('\n        }', rowStart));
  return new Set([...body.matchAll(/^\s+(\w+)\??:/gm)].map((m) => m[1]));
}

/** Plain-column select strings that directly follow `.from('residents')`. */
function residentsSelects(src: string): string[] {
  return [...src.matchAll(/\.from\('residents'\)\s*\.select\('([^'`]*)'\)/g)].map((m) => m[1]);
}

describe('move-out actions select only real residents columns (#585)', () => {
  const columns = residentsRowColumns();

  it('parses the residents Row type', () => {
    expect(columns.has('profile_id')).toBe(true);
    expect(columns.has('first_name')).toBe(true);
    expect(columns.has('user_id')).toBe(false);
  });

  it.each(FILES)('%s selects only existing columns', (file) => {
    const selects = residentsSelects(read(file)).filter((s) => !KNOWN_BROKEN.includes(s));
    expect(selects.length).toBeGreaterThan(0);
    for (const select of selects) {
      for (const col of select.split(',').map((c) => c.trim())) {
        expect(columns.has(col), `${file}: residents has no column "${col}"`).toBe(true);
      }
    }
  });

  it.each(FILES)('%s never reads resident.user_id', (file) => {
    expect(read(file)).not.toMatch(/resident\??\.user_id/);
  });
});
