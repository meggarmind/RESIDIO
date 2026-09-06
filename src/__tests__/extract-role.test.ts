import { describe, expect, it } from 'vitest';
import { extractRole, extractRoleName } from '@/lib/auth/action-roles';

/**
 * `extractRole()` and `extractRoleName()` (`src/lib/auth/action-roles.ts`)
 * normalise what PostgREST hands back for an
 * `app_roles!profiles_role_id_fkey (name, category)` embed -- either a plain
 * object or a single-element array, depending on how PostgREST infers the
 * relation. #193 made them newly load-bearing: the audit log table and its
 * CSV export now read the actor's role through `extractRoleName()` instead of
 * a flat `.role` column, and until this file existed neither function had a
 * single caller under `src/__tests__` -- a mutation collapsing the array
 * branch to `undefined` left the whole suite green.
 */

describe('extractRole()', () => {
  it('reads a plain object shape', () => {
    expect(extractRole({ name: 'super_admin', category: 'management' })).toEqual({
      name: 'super_admin',
      category: 'management',
    });
  });

  it('reads a single-element array -- the shape the surviving mutation broke', () => {
    expect(extractRole([{ name: 'super_admin', category: 'management' }])).toEqual({
      name: 'super_admin',
      category: 'management',
    });
  });

  it('takes the first element of a multi-element array', () => {
    // PostgREST should never actually return more than one row for a
    // to-one embed, but the implementation reads joined[0] unconditionally --
    // pin that literal behaviour rather than assuming it.
    expect(
      extractRole([
        { name: 'super_admin', category: 'management' },
        { name: 'resident', category: 'resident' },
      ])
    ).toEqual({ name: 'super_admin', category: 'management' });
  });

  it('defaults category to null when the caller selected only (name)', () => {
    expect(extractRole({ name: 'secretary' })).toEqual({ name: 'secretary', category: null });
  });

  it('returns null for null', () => {
    expect(extractRole(null)).toBeNull();
  });

  it('returns null for undefined', () => {
    expect(extractRole(undefined)).toBeNull();
  });

  it('returns null for an empty array', () => {
    expect(extractRole([])).toBeNull();
  });

  it('returns null for an object with no name field', () => {
    expect(extractRole({})).toBeNull();
  });

  it('returns null for an object with a non-string name', () => {
    expect(extractRole({ name: 123 })).toBeNull();
  });

  it('returns null for an array whose single element has a non-string name', () => {
    expect(extractRole([{ name: 123 }])).toBeNull();
  });

  it('returns null for a bare primitive', () => {
    expect(extractRole('super_admin')).toBeNull();
    expect(extractRole(42)).toBeNull();
  });
});

describe('extractRoleName()', () => {
  it('returns the plain name string, not the joined object, for an object shape', () => {
    const result = extractRoleName({ name: 'chairman', category: 'management' });
    expect(result).toBe('chairman');
    expect(typeof result).toBe('string');
  });

  it('returns the plain name string for a single-element array shape', () => {
    expect(extractRoleName([{ name: 'chairman', category: 'management' }])).toBe('chairman');
  });

  it('returns null, not undefined, when there is nothing to extract', () => {
    expect(extractRoleName(null)).toBeNull();
    expect(extractRoleName(null)).not.toBeUndefined();

    expect(extractRoleName(undefined)).toBeNull();
    expect(extractRoleName(undefined)).not.toBeUndefined();

    expect(extractRoleName([])).toBeNull();
    expect(extractRoleName([])).not.toBeUndefined();
  });

  it('returns null for malformed shapes', () => {
    expect(extractRoleName({})).toBeNull();
    expect(extractRoleName({ name: 123 })).toBeNull();
  });
});
