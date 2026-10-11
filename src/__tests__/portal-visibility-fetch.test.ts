// #423: the AuthProvider reads the portal visibility inputs in separate,
// fail-closed queries so a missing migration can never break login.

import { describe, expect, it } from 'vitest';
import type { SupabaseClient } from '@supabase/supabase-js';
import { fetchPortalAccessOverride, fetchResidentPortalEnabled } from '@/lib/auth/portal-visibility-fetch';

function clientReturning(result: unknown): SupabaseClient {
  const chain = { select: () => chain, eq: () => chain, maybeSingle: async () => result };
  return { from: () => chain } as unknown as SupabaseClient;
}

function throwingClient(): SupabaseClient {
  const chain = {
    select: () => chain,
    eq: () => chain,
    maybeSingle: async () => {
      throw new Error('network');
    },
  };
  return { from: () => chain } as unknown as SupabaseClient;
}

describe('fetchPortalAccessOverride', () => {
  it('returns null (inherit) when the column is missing and the query errors', async () => {
    const client = clientReturning({
      data: null,
      error: { message: 'column profiles.portal_access_override does not exist' },
    });
    expect(await fetchPortalAccessOverride(client, 'u1')).toBeNull();
  });

  it('returns null when the query throws', async () => {
    expect(await fetchPortalAccessOverride(throwingClient(), 'u1')).toBeNull();
  });

  it('returns the stored override and ignores junk values', async () => {
    expect(
      await fetchPortalAccessOverride(clientReturning({ data: { portal_access_override: 'enabled' }, error: null }), 'u1')
    ).toBe('enabled');
    expect(
      await fetchPortalAccessOverride(clientReturning({ data: { portal_access_override: 'disabled' }, error: null }), 'u1')
    ).toBe('disabled');
    expect(
      await fetchPortalAccessOverride(clientReturning({ data: { portal_access_override: 'bogus' }, error: null }), 'u1')
    ).toBeNull();
  });
});

describe('fetchResidentPortalEnabled', () => {
  it('fails closed on error, missing row or throw', async () => {
    expect(await fetchResidentPortalEnabled(clientReturning({ data: null, error: { message: 'denied' } }))).toBe(false);
    expect(await fetchResidentPortalEnabled(clientReturning({ data: null, error: null }))).toBe(false);
    expect(await fetchResidentPortalEnabled(throwingClient())).toBe(false);
  });

  it('reads a JSON boolean true and the string "true"', async () => {
    expect(await fetchResidentPortalEnabled(clientReturning({ data: { value: true }, error: null }))).toBe(true);
    expect(await fetchResidentPortalEnabled(clientReturning({ data: { value: 'true' }, error: null }))).toBe(true);
    expect(await fetchResidentPortalEnabled(clientReturning({ data: { value: false }, error: null }))).toBe(false);
    expect(await fetchResidentPortalEnabled(clientReturning({ data: { value: 'false' }, error: null }))).toBe(false);
  });
});
