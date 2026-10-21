import { describe, expect, it } from 'vitest';
import { findMatches, matchReasons, type ExistingResidentRow } from '../duplicate-match';

const EXISTING: ExistingResidentRow = {
  id: 'r1',
  resident_code: '884772',
  first_name: 'Ubah',
  last_name: 'Karl Chinedu',
  email: 'Ubah@Example.test',
  phone_primary: '0803 000 1111',
  phone_secondary: null,
  company_name: null,
  account_status: 'active',
};

const NOBODY = { first_name: 'Someone', last_name: 'Else' };

describe('matchReasons (#820)', () => {
  const NAME = { first_name: 'Ubah', last_name: 'Karl Chinedu' };

  it('matches phone plus name across phone formats, normalised', () => {
    expect(matchReasons({ ...NAME, phone_primary: '+234 803 000 1111' }, EXISTING)).toEqual(['phone', 'name']);
    expect(matchReasons({ ...NAME, phone_primary: '2348030001111' }, EXISTING)).toEqual(['phone', 'name']);
  });

  it('matches a secondary phone against the existing primary when the name matches', () => {
    expect(matchReasons({ ...NAME, phone_primary: '08099999999', phone_secondary: '08030001111' }, EXISTING)).toEqual(['phone', 'name']);
  });

  it('does not match on phone alone (a family sharing a phone)', () => {
    expect(matchReasons({ ...NOBODY, phone_primary: '+234 803 000 1111' }, EXISTING)).toEqual([]);
  });

  it('does not match on name alone', () => {
    expect(matchReasons({ first_name: ' UBAH ', last_name: 'karl chinedu' }, EXISTING)).toEqual([]);
    expect(matchReasons({ ...NAME, phone_primary: '08099999999' }, EXISTING)).toEqual([]);
  });

  it('matches on email alone, trimmed and case-insensitive', () => {
    expect(matchReasons({ ...NOBODY, email: '  ubah@example.TEST ' }, EXISTING)).toEqual(['email']);
  });

  it('reports every key that matches', () => {
    const reasons = matchReasons(
      { first_name: 'Ubah', last_name: 'Karl Chinedu', email: 'ubah@example.test', phone_primary: '08030001111' },
      EXISTING
    );
    expect(reasons).toEqual(['phone', 'email', 'name']);
  });

  it('does not match a partial name, a near name or a different first name', () => {
    expect(matchReasons({ first_name: 'Ubah', last_name: 'Karl' }, EXISTING)).toEqual([]);
    expect(matchReasons({ first_name: 'Ubah', last_name: 'Karl Chinedu Jr' }, EXISTING)).toEqual([]);
    expect(matchReasons({ first_name: 'Uba', last_name: 'Karl Chinedu' }, EXISTING)).toEqual([]);
  });

  it('never matches on empty phone or email', () => {
    const blank = { ...EXISTING, email: null, phone_primary: '', phone_secondary: '' };
    expect(matchReasons({ ...NOBODY, email: '', phone_primary: '', phone_secondary: '' }, blank)).toEqual([]);
  });

  it('matches a company by company name, trimmed and case-insensitive', () => {
    const company = { ...EXISTING, first_name: 'Warehouse', last_name: 'Rental', company_name: 'WAREHOUSE RENTAL SERVICE' };
    expect(matchReasons({ ...NOBODY, company_name: ' warehouse rental service ', phone_primary: '08030001111' }, company)).toEqual(['phone', 'name']);
    expect(matchReasons({ ...NOBODY, company_name: 'Warehouse Rental' }, company)).toEqual([]);
  });
});

describe('findMatches', () => {
  it('returns only the matching rows', () => {
    const other = { ...EXISTING, id: 'r2', first_name: 'Zed', email: null, phone_primary: '08111111111' };
    const found = findMatches({ first_name: 'Ubah', last_name: 'Karl Chinedu', email: 'ubah@example.test' }, [EXISTING, other]);
    expect(found.map((m) => m.row.id)).toEqual(['r1']);
  });
});
