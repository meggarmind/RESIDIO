import { NextRequest } from 'next/server';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const OWNER_RESIDENT_ID = 'res-own';
const OTHER_RESIDENT_ID = 'res-other';
const USER_ID = 'user-1';

const url = (residentId: string) =>
  `https://residio.test/api/statements?residentId=${residentId}&fromDate=2026-01-01&toDate=2026-03-31`;

interface Options {
  user?: { id: string } | null;
  profile?: { id: string } | null;
  linkedResidentId?: string | null;
  rpc?: { data: unknown; error: { message: string } | null };
}

/** A fake Supabase client: profiles/residents lookups, auth.getUser and the get_my_access RPC. */
function makeSupabase(options: Options) {
  const user = options.user === undefined ? { id: USER_ID } : options.user;
  const profile = options.profile === undefined ? { id: USER_ID } : options.profile;
  const linked = options.linkedResidentId === undefined ? null : options.linkedResidentId;

  const getUser = vi.fn().mockResolvedValue({ data: { user }, error: null });
  const rpc = vi.fn().mockResolvedValue(options.rpc ?? { data: [], error: null });
  const from = vi.fn((table: string) => {
    const result =
      table === 'profiles'
        ? { data: profile, error: null }
        : table === 'residents'
          ? { data: linked ? { id: linked } : null, error: null }
          : { data: null, error: { message: `unexpected table ${table}` } };
    const chain = { select: () => chain, eq: () => chain, single: async () => result };
    return chain;
  });
  return { auth: { getUser }, from, rpc };
}

const accessRows = (...permissions: Array<string | null>) =>
  permissions.map((permission_name) => ({ role_id: 'role-1', role_name: 'treasurer', permission_name }));

async function load(options: Options) {
  const supabase = makeSupabase(options);
  // Authorization is the only thing under test: the statement itself stops at a sentinel 500.
  const getAccountStatement = vi.fn().mockResolvedValue({ data: null, error: 'statement stub' });
  vi.doMock('@/lib/supabase/server', () => ({ createServerSupabaseClient: async () => supabase }));
  vi.doMock('@/actions/billing/get-account-statement', () => ({ getAccountStatement }));
  vi.doMock('@/actions/settings/get-settings', () => ({ getSettingValue: vi.fn() }));
  vi.doMock('@/lib/pdf/account-statement', () => ({ AccountStatementPDF: vi.fn() }));
  vi.doMock('@react-pdf/renderer', () => ({ renderToBuffer: vi.fn() }));
  const { GET } = await import('@/app/api/statements/route');
  return { supabase, getAccountStatement, GET };
}

const FORBIDDEN = { error: 'Forbidden - You do not have access to this statement' };

describe('GET /api/statements authorization', () => {
  let errorSpy: ReturnType<typeof vi.spyOn>;

  beforeEach(() => {
    vi.resetModules();
    errorSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
  });

  afterEach(() => {
    errorSpy.mockRestore();
    vi.doUnmock('@/lib/supabase/server');
    vi.doUnmock('@/actions/billing/get-account-statement');
    vi.doUnmock('@/actions/settings/get-settings');
    vi.doUnmock('@/lib/pdf/account-statement');
    vi.doUnmock('@react-pdf/renderer');
  });

  it('returns 401 when unauthenticated', async () => {
    const h = await load({ user: null });
    const response = await h.GET(new NextRequest(url(OTHER_RESIDENT_ID)));

    expect(response.status).toBe(401);
    await expect(response.json()).resolves.toEqual({ error: 'Unauthorized' });
    expect(h.getAccountStatement).not.toHaveBeenCalled();
  });

  it('returns 404 when the profile is missing', async () => {
    const h = await load({ profile: null });
    const response = await h.GET(new NextRequest(url(OTHER_RESIDENT_ID)));

    expect(response.status).toBe(404);
    await expect(response.json()).resolves.toEqual({ error: 'Profile not found' });
    expect(h.getAccountStatement).not.toHaveBeenCalled();
  });

  it('returns 403 for a non-owner whose access resolves without billing.view', async () => {
    const h = await load({ rpc: { data: accessRows('billing.create', 'residents.view'), error: null } });
    const response = await h.GET(new NextRequest(url(OTHER_RESIDENT_ID)));

    expect(response.status).toBe(403);
    await expect(response.json()).resolves.toEqual(FORBIDDEN);
    expect(h.getAccountStatement).not.toHaveBeenCalled();
  });

  it('fails closed with 403 and logs when the access lookup fails for a non-owner', async () => {
    const h = await load({ rpc: { data: null, error: { message: 'rpc exploded' } } });
    const response = await h.GET(new NextRequest(url(OTHER_RESIDENT_ID)));

    expect(response.status).toBe(403);
    await expect(response.json()).resolves.toEqual(FORBIDDEN);
    expect(h.getAccountStatement).not.toHaveBeenCalled();
    expect(errorSpy).toHaveBeenCalledWith('[statements] access lookup failed', {
      userId: USER_ID,
      error: 'rpc exploded',
    });
  });

  it('returns 403 for a non-owner when the RPC returns no rows (no-access)', async () => {
    const h = await load({ rpc: { data: [], error: null } });
    const response = await h.GET(new NextRequest(url(OTHER_RESIDENT_ID)));

    expect(response.status).toBe(403);
    await expect(response.json()).resolves.toEqual(FORBIDDEN);
    expect(h.getAccountStatement).not.toHaveBeenCalled();
  });

  it('lets a non-owner holding billing.view proceed', async () => {
    const h = await load({ rpc: { data: accessRows('residents.view', 'billing.view'), error: null } });
    const response = await h.GET(new NextRequest(url(OTHER_RESIDENT_ID)));

    expect(response.status).not.toBe(403);
    expect(h.getAccountStatement).toHaveBeenCalledWith(
      expect.objectContaining({ residentId: OTHER_RESIDENT_ID })
    );
  });

  it('lets the owner proceed with no permissions at all', async () => {
    const h = await load({ linkedResidentId: OWNER_RESIDENT_ID, rpc: { data: accessRows(null), error: null } });
    const response = await h.GET(new NextRequest(url(OWNER_RESIDENT_ID)));

    expect(response.status).not.toBe(403);
    expect(h.getAccountStatement).toHaveBeenCalledWith(
      expect.objectContaining({ residentId: OWNER_RESIDENT_ID })
    );
  });

  it('lets the owner proceed even when the access lookup fails', async () => {
    const h = await load({
      linkedResidentId: OWNER_RESIDENT_ID,
      rpc: { data: null, error: { message: 'rpc exploded' } },
    });
    const response = await h.GET(new NextRequest(url(OWNER_RESIDENT_ID)));

    expect(response.status).not.toBe(403);
    expect(h.getAccountStatement).toHaveBeenCalled();
  });

  it('resolves access for the authenticated user without a second auth.getUser()', async () => {
    const h = await load({ rpc: { data: accessRows('billing.view'), error: null } });
    await h.GET(new NextRequest(url(OTHER_RESIDENT_ID)));

    expect(h.supabase.rpc).toHaveBeenCalledTimes(1);
    expect(h.supabase.rpc).toHaveBeenCalledWith('get_my_access');
    expect(h.supabase.auth.getUser).toHaveBeenCalledTimes(1);
  });
});
