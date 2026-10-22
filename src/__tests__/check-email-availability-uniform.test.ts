import { readFileSync } from 'node:fs';
import { describe, expect, it, vi } from 'vitest';

/**
 * The pre-sign-in email check (#1063) must not reveal whether an address is
 * registered, and must not run a pattern match where `_` and `%` act as
 * wildcards. Any database lookup would hand an anonymous caller a lookup oracle.
 */

const lookups = vi.hoisted(() => ({ calls: 0 }));

vi.mock('@/lib/supabase/server', () => ({
  createAdminClient: () => {
    lookups.calls += 1;
    throw new Error('the email check must not query the database');
  },
}));

import { checkEmailAvailability } from '@/actions/auth/check-email-availability';

describe('checkEmailAvailability', () => {
  it('gives the same answer for a registered and an unregistered address', async () => {
    const registered = await checkEmailAvailability('admin@residio.test');
    const unknown = await checkEmailAvailability('nobody-here@residio.test');
    const wildcard = await checkEmailAvailability('a_b@residio.test');
    expect(registered).toEqual({ available: true });
    expect(unknown).toEqual(registered);
    expect(wildcard).toEqual(registered);
    expect(lookups.calls).toBe(0);
  });

  it('still rejects a malformed address', async () => {
    expect((await checkEmailAvailability('not-an-email')).available).toBe(false);
  });

  it('carries no ilike pattern match on email', () => {
    const src = readFileSync(new URL('../actions/auth/check-email-availability.ts', import.meta.url), 'utf8');
    expect(src).not.toMatch(/\.ilike\(/);
  });
});
