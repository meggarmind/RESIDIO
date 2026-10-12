import { describe, expect, it } from 'vitest';
import {
  eqValue,
  idOrParentFilter,
  ilikeAny,
  ilikeContains,
  isUuid,
  MAX_SEARCH_TERM_LENGTH,
  quotePostgrestValue,
  uuidInList,
} from '@/lib/postgrest-filter';

/**
 * Minimal model of how PostgREST splits an or() list: respects double quotes
 * (with backslash escapes) and returns the top-level comma-separated clauses.
 * Used to prove injected text cannot create additional clauses.
 */
function splitTopLevel(filter: string): string[] {
  const out: string[] = [];
  let cur = '';
  let inQuote = false;
  let depth = 0;
  for (let i = 0; i < filter.length; i++) {
    const ch = filter[i];
    if (inQuote) {
      cur += ch;
      if (ch === '\\') cur += filter[++i];
      else if (ch === '"') inQuote = false;
      continue;
    }
    if (ch === '"') inQuote = true;
    else if (ch === '(') depth++;
    else if (ch === ')') depth--;
    if (ch === ',' && depth === 0) {
      out.push(cur);
      cur = '';
    } else cur += ch;
  }
  out.push(cur);
  return out;
}

const INJECTIONS = [
  'a,id.neq.0',
  'x),or(y',
  'a),id.not.is.null,(b',
  '"; drop',
  'a"),id.neq."0',
  'back\\slash',
  '*,id.gt.0',
  'a:b.c',
];

describe('quotePostgrestValue', () => {
  it('wraps in double quotes and escapes quote and backslash', () => {
    expect(quotePostgrestValue('a"b')).toBe('"a\\"b"');
    expect(quotePostgrestValue('a\\b')).toBe('"a\\\\b"');
  });
  it('keeps reserved characters literal inside the quotes', () => {
    expect(quotePostgrestValue('a,b(c).d:e*')).toBe('"a,b(c).d:e*"');
  });
  it('drops control characters', () => {
    expect(quotePostgrestValue('a\u0000b\nc')).toBe('"abc"');
  });
});

describe('ilikeContains / ilikeAny', () => {
  it('builds a quoted ilike clause', () => {
    expect(ilikeContains('name', 'bob')).toBe('name.ilike."%bob%"');
  });
  it('escapes LIKE wildcards', () => {
    expect(ilikeContains('name', '50%_')).toBe('name.ilike."%50\\\\%\\\\_%"');
  });
  it.each(INJECTIONS)('never adds clauses for %j', (input) => {
    const cols = ['first_name', 'last_name', 'email'];
    const clauses = splitTopLevel(ilikeAny(cols, input));
    expect(clauses).toHaveLength(cols.length);
    clauses.forEach((c, i) => expect(c.startsWith(`${cols[i]}.ilike."%`)).toBe(true));
  });
  it('caps term length', () => {
    const f = ilikeContains('name', 'a'.repeat(MAX_SEARCH_TERM_LENGTH + 50));
    expect(f.length).toBe('name.ilike."%'.length + MAX_SEARCH_TERM_LENGTH + '%"'.length);
  });
  it('rejects non-identifier column names', () => {
    expect(() => ilikeContains('a,b', 'x')).toThrow();
  });
});

describe('eqValue', () => {
  it('quotes the value so injection stays one clause', () => {
    const clauses = splitTopLevel(
      [eqValue('resident_code', 'a,id.neq.0'), ilikeContains('x', 'y')].join(',')
    );
    expect(clauses).toHaveLength(2);
    expect(clauses[0]).toBe('resident_code.eq."a,id.neq.0"');
  });
});

describe('uuidInList', () => {
  const a = '123e4567-e89b-42d3-a456-426614174000';
  const b = '223e4567-e89b-42d3-a456-426614174001';
  it('joins valid uuids in parentheses', () => {
    expect(uuidInList([a, b])).toBe(`(${a},${b})`);
  });
  it('drops anything that is not a uuid, so no syntax can be injected', () => {
    expect(uuidInList([a, '1),id.neq.0,(2', 'x', undefined, `${a},${b}`])).toBe(`(${a})`);
  });
  it('returns null when nothing valid remains', () => {
    expect(uuidInList([])).toBeNull();
    expect(uuidInList(['a,b'])).toBeNull();
  });
});

describe('idOrParentFilter', () => {
  const id = '123e4567-e89b-42d3-a456-426614174000';
  it('builds the filter for a UUID', () => {
    expect(idOrParentFilter('id', 'parent_note_id', id)).toBe(
      `id.eq.${id},parent_note_id.eq.${id}`
    );
  });
  it.each(['', 'abc', `${id},id.neq.0`, `${id})`, 'x),or(y'])('returns null for %j', (bad) => {
    expect(idOrParentFilter('id', 'parent_note_id', bad)).toBeNull();
  });
  it('isUuid rejects non-strings', () => {
    expect(isUuid(undefined)).toBe(false);
    expect(isUuid(id)).toBe(true);
  });
});
