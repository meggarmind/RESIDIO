import { describe, expect, it } from 'vitest';
import { safeNextPath } from '@/lib/auth/safe-next-path';

const ORIGIN = 'https://residio.example';

describe('safeNextPath (#455 open redirect)', () => {
  it.each([
    '/dashboard',
    '/residents',
    '/payments/abc-123',
    '/settings/roles?tab=1',
    '/a_b-c',
    '/',
  ])('keeps the safe same-origin path %s', (p) => {
    expect(safeNextPath(p, ORIGIN)).toBe(p);
  });

  it.each([
    ['tab after slash (the reported bypass)', '/\t/evil.com'],
    ['newline', '/\n/evil.com'],
    ['carriage return', '/\r/evil.com'],
    ['encoded tab (as a raw query value)', '/%09/evil.com'],
    ['encoded newline', '/%0a/evil.com'],
    ['encoded CR', '/%0d/evil.com'],
    ['double slash', '//evil.com'],
    ['encoded second slash', '/%2F/evil.com'],
    ['double-encoded slash', '/%252F/evil.com'],
    ['slash backslash', '/\\evil.com'],
    ['encoded backslash', '/%5Cevil.com'],
    ['javascript scheme', 'javascript:alert(1)'],
    ['absolute https', 'https://evil.com'],
    ['scheme-relative', '//evil'],
    ['mixed encoding', '/%2f%09/evil.com'],
    ['dot segment second char', '/./evil'],
    ['dot-dot traversal', '/a/../../evil'],
    ['no leading slash', 'dashboard'],
    ['malformed percent', '/%E0%A4%A'],
    ['control char hidden in the path (only visible after decoding)', '/a%0Ab'],
    ['backslash hidden in the path (only visible after decoding)', '/a%5Cb'],
    ['percent-encoded first character is not allowed', '/%41bc'],
    ['NUL byte', '/a\u0000b'],
    ['empty', ''],
  ])('falls back to /dashboard for %s', (_name, input) => {
    expect(safeNextPath(input, ORIGIN)).toBe('/dashboard');
  });

  it('falls back for null and undefined', () => {
    expect(safeNextPath(null, ORIGIN)).toBe('/dashboard');
    expect(safeNextPath(undefined, ORIGIN)).toBe('/dashboard');
  });
});
