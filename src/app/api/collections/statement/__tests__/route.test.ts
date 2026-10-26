import { NextRequest } from 'next/server';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const url = 'https://residio.test/api/collections/statement?payerId=p1&fromDate=2026-10-01&toDate=2026-10-31';

async function load(options: { user?: { id: string } | null; permissions?: string[]; statement?: { data: unknown; error: string | null } }) {
  const user = options.user === undefined ? { id: 'u1' } : options.user;
  const supabase = {
    auth: { getUser: vi.fn().mockResolvedValue({ data: { user }, error: null }) },
    rpc: vi.fn().mockResolvedValue({ data: (options.permissions ?? []).map((permission_name) => ({ role_id: 'r', role_name: 'clerk', permission_name })), error: null }),
  };
  const loadCollectionsStatement = vi.fn().mockResolvedValue(options.statement ?? { data: null, error: 'Payer not found' });
  vi.doMock('@/lib/supabase/server', () => ({ createServerSupabaseClient: async () => supabase }));
  vi.doMock('@/lib/collections/statement-data', () => ({ loadCollectionsStatement }));
  vi.doMock('@/actions/settings/get-settings', () => ({ getSettingValue: vi.fn() }));
  vi.doMock('@/lib/branding/estate-logo-server', () => ({ getEstateLogoUrl: vi.fn() }));
  vi.doMock('@/lib/pdf/account-statement', () => ({ CollectionsStatementPDF: vi.fn() }));
  vi.doMock('@react-pdf/renderer', () => ({ renderToBuffer: vi.fn().mockResolvedValue(Buffer.from('%PDF')) }));
  const { GET } = await import('@/app/api/collections/statement/route');
  return { GET, loadCollectionsStatement };
}

describe('GET /api/collections/statement', { timeout: 15000 }, () => {
  beforeEach(() => vi.resetModules());
  afterEach(() => {
    for (const m of ['@/lib/supabase/server', '@/lib/collections/statement-data', '@/actions/settings/get-settings', '@/lib/branding/estate-logo-server', '@/lib/pdf/account-statement', '@react-pdf/renderer']) vi.doUnmock(m);
  });

  it('returns 401 when unauthenticated', async () => {
    const h = await load({ user: null });
    expect((await h.GET(new NextRequest(url))).status).toBe(401);
    expect(h.loadCollectionsStatement).not.toHaveBeenCalled();
  });

  it('returns 403 without collections.view, even with billing.view', async () => {
    const h = await load({ permissions: ['billing.view'] });
    expect((await h.GET(new NextRequest(url))).status).toBe(403);
    expect(h.loadCollectionsStatement).not.toHaveBeenCalled();
  });

  it('requires the payer and both dates', async () => {
    const h = await load({ permissions: ['collections.view'] });
    expect((await h.GET(new NextRequest('https://residio.test/api/collections/statement?fromDate=2026-10-01&toDate=2026-10-31'))).status).toBe(400);
    expect((await h.GET(new NextRequest('https://residio.test/api/collections/statement?payerId=p1'))).status).toBe(400);
  });

  it('returns 404 for an unknown payer', async () => {
    const h = await load({ permissions: ['collections.view'] });
    expect((await h.GET(new NextRequest(url))).status).toBe(404);
  });

  it('returns the PDF for a collections.view user', async () => {
    const h = await load({
      permissions: ['collections.view'],
      statement: { data: { payer: { id: 'p1abcdef12', name: 'Chidi' }, period: {}, collections: { lines: [], total: 0 }, generatedAt: '' }, error: null },
    });
    const response = await h.GET(new NextRequest(url));
    expect(response.status).toBe(200);
    expect(response.headers.get('Content-Type')).toBe('application/pdf');
    expect(response.headers.get('Content-Disposition')).toContain('Collections_20261001-20261031_p1abcdef');
  });
});
