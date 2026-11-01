import { describe, expect, it } from 'vitest';
import {
  findSuggestions,
  normalisePhone,
  searchResidents,
  type MergeCandidateRow,
} from '@/lib/residents/merge-candidates';

let n = 0;
function row(overrides: Partial<MergeCandidateRow> = {}): MergeCandidateRow {
  n += 1;
  return {
    id: `id-${n}`,
    first_name: `First${n}`,
    last_name: `Last${n}`,
    resident_code: String(100000 + n),
    phone_primary: null,
    phone_secondary: null,
    account_status: 'active',
    merged_into_resident_id: null,
    houses: [],
    ...overrides,
  };
}

const current = row({
  id: 'me',
  first_name: 'Ada',
  last_name: 'Obi',
  phone_primary: '+2348023158172',
  houses: [{ id: 'h1', label: 'Close 1 No 4' }],
});

describe('normalisePhone', () => {
  it('treats +234 and leading 0 forms as the same number', () => {
    expect(normalisePhone('+2348023158172')).toBe(normalisePhone('08023158172'));
    expect(normalisePhone('0802 315 8172')).toBe('8023158172');
  });
  it('returns null for empty or too-short values', () => {
    expect(normalisePhone(null)).toBeNull();
    expect(normalisePhone('123')).toBeNull();
  });
});

describe('findSuggestions', () => {
  it('orders same phone, then same house, then similar name, with joined reasons', () => {
    const byName = row({ id: 'name', first_name: 'Adaeze', last_name: 'Obi' });
    const byHouse = row({ id: 'house', houses: [{ id: 'h1', label: 'Close 1 No 4' }] });
    const byPhone = row({ id: 'phone', phone_secondary: '08023158172' });
    const both = row({ id: 'both', first_name: 'Ada', last_name: 'Nwosu', houses: [{ id: 'h1', label: 'x' }] });
    const none = row({ id: 'none' });

    const out = findSuggestions(current, [byName, none, byHouse, both, byPhone]);

    expect(out.map((c) => c.id)).toEqual(['phone', 'both', 'house', 'name']);
    expect(out.find((c) => c.id === 'both')?.reason).toBe('Same house, Similar name');
    expect(out[0].reason).toBe('Same phone');
  });

  it('ignores shared name words shorter than 3 letters', () => {
    const al = row({ first_name: 'Al', last_name: 'Zed' });
    const me = row({ id: 'me2', first_name: 'Al', last_name: 'Yak' });
    expect(findSuggestions(me, [al])).toEqual([]);
  });

  it('excludes the resident itself, archived and merged rows', () => {
    const out = findSuggestions(current, [
      current,
      row({ phone_primary: '08023158172', account_status: 'archived' }),
      row({ phone_primary: '08023158172', merged_into_resident_id: 'x' }),
    ]);
    expect(out).toEqual([]);
  });

  it('caps at 6', () => {
    const many = Array.from({ length: 10 }, () => row({ phone_primary: '08023158172' }));
    expect(findSuggestions(current, many)).toHaveLength(6);
  });
});

describe('searchResidents', () => {
  const house = row({ id: 'hs', houses: [{ id: 'h9', label: 'Close 9 No 2' }] });
  const phone = row({ id: 'ph', phone_primary: '+2348011112222' });
  const code = row({ id: 'cd', resident_code: '445566' });
  const rows = [house, phone, code, row({ id: 'nm', first_name: 'Chika', last_name: 'Eze' })];

  it('needs two characters after trimming', () => {
    expect(searchResidents(current, rows, ' c ')).toEqual([]);
    expect(searchResidents(current, rows)).toEqual([]);
  });
  it('matches name, house label, code and phone digits', () => {
    expect(searchResidents(current, rows, 'chika').map((c) => c.id)).toEqual(['nm']);
    expect(searchResidents(current, rows, 'close 9').map((c) => c.id)).toEqual(['hs']);
    expect(searchResidents(current, rows, '4455').map((c) => c.id)).toEqual(['cd']);
    expect(searchResidents(current, rows, '8011112222').map((c) => c.id)).toEqual(['ph']);
  });
  it('finds a +234 phone from a 0-prefixed query, and the reverse, including spaced input', () => {
    expect(searchResidents(current, rows, '08011112222').map((c) => c.id)).toEqual(['ph']);
    expect(searchResidents(current, rows, '0801 111 2222').map((c) => c.id)).toEqual(['ph']);
    const local = row({ id: 'local', phone_secondary: '08033334444' });
    expect(searchResidents(current, [local], '+2348033334444').map((c) => c.id)).toEqual(['local']);
  });
  it('does not match code or phone on a 2-digit query', () => {
    expect(searchResidents(current, [code, phone], '44')).toEqual([]);
    expect(searchResidents(current, [code, phone], '80')).toEqual([]);
  });
  it('excludes self and archived, and caps at 6', () => {
    const many = Array.from({ length: 9 }, () => row({ first_name: 'Zed' }));
    expect(searchResidents(current, [current, ...many], 'zed')).toHaveLength(6);
    expect(searchResidents(current, [row({ first_name: 'Zed', account_status: 'archived' })], 'zed')).toEqual([]);
  });
});
