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

/**
 * Coverage for issue #115:
 *
 * - the payments segment only ever matched `reference_number`, so searching
 *   a resident's NAME (what the QA report actually tried -- "Stella",
 *   "Akintunde", "Kayode") returned nothing even though that resident had
 *   payments;
 * - the houses segment never queried `short_name` (the "House ID" rendered
 *   on /houses), so a value like "IBB-1" never matched, while `house_number`
 *   ("18A") and street-name search kept working.
 *
 * The fix widens the payments query with a second pass keyed on resident_id
 * (mirroring the existing streets-widen-houses pattern), gated by
 * `canViewPayments` alone -- NOT `canViewResidents`. A caller holding only
 * payments.view already sees resident first/last name today on the payment
 * detail page (`src/actions/payments/get-payment.ts` joins `residents`
 * unconditionally, gated only by the page-level payments.view check), so
 * this widening query grants no new visibility and needs no new permission.
 */
describe('GET /api/search payments-by-resident and house short_name (#115)', () => {
  beforeEach(() => {
    getCurrentUserPermissions.mockReset();
    createServerSupabaseClient.mockReset();
  });

  it('matches a payment by its resident\'s name, gated by payments.view alone (no residents.view)', async () => {
    getCurrentUserPermissions.mockResolvedValue({
      userId: 'user-1',
      // payments.view ONLY -- proves the resident-name widening query needs
      // no residents.view permission.
      permissions: [PERMISSIONS.PAYMENTS_VIEW],
    });

    const residentsWidenBuilder = makeBuilder({
      data: [{ id: 'resident-1', first_name: 'Stella', last_name: 'Akintunde' }],
      error: null,
    });
    // First call to payment_records is the reference_number pass (no match);
    // second is the resident_id-widened pass (the actual match).
    const paymentsByReferenceBuilder = makeBuilder({ data: [], error: null });
    const paymentsByResidentBuilder = makeBuilder({
      data: [{ id: 'payment-1', reference_number: 'REF-9', amount: 15000, resident_id: 'resident-1' }],
      error: null,
    });
    const searchLogsBuilder = makeBuilder();

    let paymentRecordsCalls = 0;
    const from = vi.fn((table: string) => {
      if (table === 'residents') return residentsWidenBuilder;
      if (table === 'payment_records') {
        paymentRecordsCalls += 1;
        return paymentRecordsCalls === 1 ? paymentsByReferenceBuilder : paymentsByResidentBuilder;
      }
      if (table === 'search_logs') return searchLogsBuilder;
      throw new Error(`Unexpected query against '${table}' for a caller with only payments.view`);
    });
    createServerSupabaseClient.mockResolvedValue({ from });

    const response = await GET(request('Stella'));
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body.payments).toHaveLength(1);
    expect(body.payments[0]).toMatchObject({
      id: 'payment-1',
      reference_number: 'REF-9',
      amount: 15000,
    });
    expect(body.payments[0]._score).toBeGreaterThan(0);
    // resident_id was selected only to score/match -- it must not leak into
    // the response the client renders.
    expect(body.payments[0]).not.toHaveProperty('resident_id');

    // residents.view was never granted, so the (permission-scoped)
    // top-level residents result stays empty even though the widening query
    // against 'residents' did run.
    expect(body.residents).toEqual([]);
  });

  it('still matches a payment by reference_number (the pre-existing behaviour)', async () => {
    getCurrentUserPermissions.mockResolvedValue({
      userId: 'user-1',
      permissions: [PERMISSIONS.PAYMENTS_VIEW],
    });

    const residentsWidenBuilder = makeBuilder({ data: [], error: null }); // no resident-name match
    const paymentsByReferenceBuilder = makeBuilder({
      data: [{ id: 'payment-2', reference_number: 'PSK-REF-42', amount: 7500, resident_id: 'resident-9' }],
      error: null,
    });
    const searchLogsBuilder = makeBuilder();

    const from = vi.fn((table: string) => {
      if (table === 'residents') return residentsWidenBuilder;
      // With no matching resident ids, the resident-widened pass is never
      // issued -- payment_records is called exactly once.
      if (table === 'payment_records') return paymentsByReferenceBuilder;
      if (table === 'search_logs') return searchLogsBuilder;
      throw new Error(`Unexpected query against '${table}'`);
    });
    createServerSupabaseClient.mockResolvedValue({ from });

    const response = await GET(request('PSK-REF-42'));
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body.payments).toHaveLength(1);
    expect(body.payments[0]).toMatchObject({
      id: 'payment-2',
      reference_number: 'PSK-REF-42',
      amount: 7500,
    });
  });

  it('matches a house by short_name, alongside the existing house_number and street matches', async () => {
    getCurrentUserPermissions.mockResolvedValue({
      userId: 'user-1',
      permissions: [PERMISSIONS.HOUSES_VIEW],
    });

    const housesByNumberBuilder = makeBuilder({
      data: [{ id: 'house-1', house_number: '18A', short_name: 'IBB-1', street_id: 'street-1', streets: { name: 'Ibadan Street' } }],
      error: null,
    });
    const streetsBuilder = makeBuilder({ data: [], error: null }); // no street-name match
    const searchLogsBuilder = makeBuilder();

    const from = vi.fn((table: string) => {
      if (table === 'houses') return housesByNumberBuilder;
      if (table === 'streets') return streetsBuilder;
      if (table === 'search_logs') return searchLogsBuilder;
      throw new Error(`Unexpected query against '${table}' for a caller with only houses.view`);
    });
    createServerSupabaseClient.mockResolvedValue({ from });

    const response = await GET(request('IBB-1'));
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body.houses).toHaveLength(1);
    expect(body.houses[0]).toMatchObject({
      id: 'house-1',
      house_number: '18A',
      street_name: 'Ibadan Street',
    });
    expect(body.houses[0]._score).toBeGreaterThan(0);

    // Confirms the query itself now filters on short_name, not just
    // house_number -- the previous `.ilike('house_number', ...)` call is
    // gone in favour of an `.or()` covering both columns.
    expect(housesByNumberBuilder.or).toHaveBeenCalledWith(
      expect.stringContaining('short_name.ilike.%IBB-1%')
    );
  });

  it('a caller lacking payments.view gets an empty payments array and payment_records is never queried', async () => {
    getCurrentUserPermissions.mockResolvedValue({
      userId: 'user-1',
      // No payments.view -- and no residents.view either, so the
      // resident-name widening query (gated on payments.view) must not run.
      permissions: [PERMISSIONS.HOUSES_VIEW],
    });

    const housesByNumberBuilder = makeBuilder({ data: [], error: null });
    const streetsBuilder = makeBuilder({ data: [], error: null });
    const searchLogsBuilder = makeBuilder();

    const from = vi.fn((table: string) => {
      if (table === 'houses') return housesByNumberBuilder;
      if (table === 'streets') return streetsBuilder;
      if (table === 'search_logs') return searchLogsBuilder;
      // 'payment_records' and 'residents' must never be queried for a
      // caller without payments.view -- this is the bug this test guards
      // against.
      throw new Error(`Unexpected query against '${table}' for a caller without payments.view`);
    });
    createServerSupabaseClient.mockResolvedValue({ from });

    const response = await GET(request('anything'));
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body.payments).toEqual([]);
    expect(from).not.toHaveBeenCalledWith('payment_records');
    expect(from).not.toHaveBeenCalledWith('residents');
  });
});
