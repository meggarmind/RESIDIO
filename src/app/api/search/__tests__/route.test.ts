/**
 * Coverage for issue #164: the global search API previously queried and
 * returned residents, houses, payments, security contacts and documents to
 * ANY authenticated caller, with no permission scoping and no requirement
 * that the caller even be authenticated (the only auth touch was an optional
 * `getUser()` used solely to attach a user_id to the search_logs insert).
 *
 * These tests assert:
 * - an unauthenticated caller gets 401 and the database is never touched;
 * - each result category is skipped at the query level (not just filtered
 *   out of the response) when the caller lacks the permission that gates
 *   the page it lives on;
 * - the five-key response shape stays stable (empty arrays, not missing
 *   keys) however permissions cut the query down -- the client concatenates
 *   all five keys unconditionally and must not break.
 */

import { NextRequest } from 'next/server';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { GET } from '@/app/api/search/route';
import { PERMISSIONS } from '@/lib/auth/action-roles';

const { getCurrentUserPermissions, createServerSupabaseClient } = vi.hoisted(() => ({
  getCurrentUserPermissions: vi.fn(),
  createServerSupabaseClient: vi.fn(),
}));

vi.mock('@/lib/auth/authorize', () => ({ getCurrentUserPermissions }));
vi.mock('@/lib/supabase/server', () => ({ createServerSupabaseClient }));

function makeBuilder(result: { data: unknown[] | null; error: unknown } = { data: [], error: null }) {
  const builder = {
    select: vi.fn(() => builder),
    or: vi.fn(() => builder),
    ilike: vi.fn(() => builder),
    in: vi.fn(() => builder),
    eq: vi.fn(() => builder),
    limit: vi.fn(() => Promise.resolve(result)),
    insert: vi.fn(() => Promise.resolve({ data: null, error: null })),
  };
  return builder;
}

function request(query: string) {
  return new NextRequest(`https://residio.test/api/search?q=${encodeURIComponent(query)}`);
}

describe('GET /api/search authorization and permission scoping', () => {
  beforeEach(() => {
    getCurrentUserPermissions.mockReset();
    createServerSupabaseClient.mockReset();
  });

  it('rejects an unauthenticated caller before touching the database', async () => {
    getCurrentUserPermissions.mockResolvedValue({ userId: null, permissions: [] });

    const response = await GET(request('smith'));

    expect(response.status).toBe(401);
    expect(await response.json()).toEqual({ error: 'Unauthorized' });
    expect(createServerSupabaseClient).not.toHaveBeenCalled();
  });

  it('requires auth even for a too-short query, before any short-circuit', async () => {
    getCurrentUserPermissions.mockResolvedValue({ userId: null, permissions: [] });

    const response = await GET(request('a'));

    expect(response.status).toBe(401);
  });

  it('returns the empty five-key shape for a too-short query without querying the database', async () => {
    getCurrentUserPermissions.mockResolvedValue({
      userId: 'user-1',
      permissions: [PERMISSIONS.RESIDENTS_VIEW],
    });

    const response = await GET(request('a'));

    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({
      residents: [],
      houses: [],
      payments: [],
      contacts: [],
      documents: [],
    });
    expect(createServerSupabaseClient).not.toHaveBeenCalled();
  });

  it('skips categories the caller lacks permission for, at the query level', async () => {
    getCurrentUserPermissions.mockResolvedValue({
      userId: 'user-1',
      // Only residents -- no houses/payments/security/documents permission.
      permissions: [PERMISSIONS.RESIDENTS_VIEW],
    });

    const residentsBuilder = makeBuilder({
      data: [{ id: 'r1', first_name: 'Jane', last_name: 'Smith', phone_primary: '123', email: 'j@x.com' }],
      error: null,
    });
    const searchLogsBuilder = makeBuilder();
    const from = vi.fn((table: string) => {
      if (table === 'residents') return residentsBuilder;
      if (table === 'search_logs') return searchLogsBuilder;
      // Any other table being queried at all is the bug this test guards
      // against -- fail loudly rather than silently returning empty data.
      throw new Error(`Unexpected query against '${table}' for a caller without its view permission`);
    });
    createServerSupabaseClient.mockResolvedValue({ from });

    const response = await GET(request('smith'));
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body.residents).toHaveLength(1);
    expect(body.houses).toEqual([]);
    expect(body.payments).toEqual([]);
    expect(body.contacts).toEqual([]);
    expect(body.documents).toEqual([]);

    expect(from).toHaveBeenCalledWith('residents');
    expect(from).not.toHaveBeenCalledWith('houses');
    expect(from).not.toHaveBeenCalledWith('streets');
    expect(from).not.toHaveBeenCalledWith('payment_records');
    expect(from).not.toHaveBeenCalledWith('security_contacts');
    expect(from).not.toHaveBeenCalledWith('documents');

    // The search is still logged, keyed off the userId resolved by the
    // permission check -- no second auth.getUser() round trip needed.
    expect(searchLogsBuilder.insert).toHaveBeenCalledWith(
      expect.objectContaining({ query_text: 'smith', user_id: 'user-1', results_count: 1 })
    );
  });

  it('keeps the five-key shape stable when every category is filtered away', async () => {
    getCurrentUserPermissions.mockResolvedValue({ userId: 'user-1', permissions: [] });

    const searchLogsBuilder = makeBuilder();
    const from = vi.fn((table: string) => {
      if (table === 'search_logs') return searchLogsBuilder;
      throw new Error(`Unexpected query against '${table}' for a caller with no view permissions`);
    });
    createServerSupabaseClient.mockResolvedValue({ from });

    const response = await GET(request('smith'));
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body).toEqual({
      residents: [],
      houses: [],
      payments: [],
      contacts: [],
      documents: [],
    });
    expect(searchLogsBuilder.insert).toHaveBeenCalledWith(
      expect.objectContaining({ results_count: 0 })
    );
  });

  it('queries every category for a caller holding all five view permissions', async () => {
    getCurrentUserPermissions.mockResolvedValue({
      userId: 'user-1',
      permissions: [
        PERMISSIONS.RESIDENTS_VIEW,
        PERMISSIONS.HOUSES_VIEW,
        PERMISSIONS.PAYMENTS_VIEW,
        PERMISSIONS.SECURITY_VIEW,
        PERMISSIONS.DOCUMENTS_VIEW,
      ],
    });

    const empty = makeBuilder();
    const from = vi.fn(() => empty);
    createServerSupabaseClient.mockResolvedValue({ from });

    const response = await GET(request('smith'));

    expect(response.status).toBe(200);
    expect(from).toHaveBeenCalledWith('residents');
    expect(from).toHaveBeenCalledWith('houses');
    expect(from).toHaveBeenCalledWith('streets');
    expect(from).toHaveBeenCalledWith('payment_records');
    expect(from).toHaveBeenCalledWith('security_contacts');
    expect(from).toHaveBeenCalledWith('documents');
  });
});
