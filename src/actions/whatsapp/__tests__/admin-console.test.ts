import { beforeEach, describe, expect, it, vi } from 'vitest';
import { authorizePermission } from '@/lib/auth/authorize';
import { createAdminClient } from '@/lib/supabase/server';
import { getWhatsAppDisclosureLogs, getWhatsAppHealth, getWhatsAppSessions } from '../admin-console';
import { filterDisclosureLogs, filterOptIns } from '@/app/(dashboard)/settings/whatsapp/operations-console';

vi.mock('@/lib/auth/authorize', () => ({ authorizePermission: vi.fn() }));
vi.mock('@/lib/supabase/server', () => ({ createAdminClient: vi.fn() }));
vi.mock('@/lib/auth/action-roles', () => ({ PERMISSIONS: { WHATSAPP_VIEW: 'whatsapp.view' } }));

const authMock = vi.mocked(authorizePermission);
const clientMock = vi.mocked(createAdminClient);
const authorized = { authorized: true, userId: 'admin-1', role: null, roleName: null, roleId: null, permissions: [], error: null };
const unauthorized = { authorized: false, userId: null, role: null, roleName: null, roleId: null, permissions: [], error: 'Forbidden' };

type QueryResult = { data: unknown; error: unknown; count?: number };

function chain(result: QueryResult) {
  const value: QueryResult = { ...result };
  const query = {} as Record<string, ReturnType<typeof vi.fn>>;
  for (const method of ['select', 'eq', 'gte', 'order', 'limit', 'ilike', 'or']) query[method] = vi.fn().mockReturnValue(query);
  query.then = vi.fn((resolve: (result: QueryResult) => unknown) => Promise.resolve(resolve(value)));
  return query;
}

describe('WhatsApp operations console actions', () => {
  beforeEach(() => vi.clearAllMocks());

  it('fails closed before creating a client for protected reads', async () => {
    authMock.mockResolvedValue(unauthorized);
    expect((await getWhatsAppSessions()).error).toBe('Forbidden');
    expect((await getWhatsAppDisclosureLogs()).error).toBe('Forbidden');
    expect((await getWhatsAppHealth()).error).toBe('Forbidden');
    expect(clientMock).not.toHaveBeenCalled();
  });

  it('returns session and disclosure projections without financial fields', async () => {
    authMock.mockResolvedValue(authorized);
    const session = chain({ data: [{ phone_number: '+2348000000000', current_node: 'menu' }], error: null });
    const disclosure = chain({ data: [{ phone_number: '+2348000000000', menu_item: 'balance' }], error: null });
    clientMock.mockReturnValue({ from: vi.fn().mockReturnValueOnce(session).mockReturnValueOnce(disclosure) } as never);
    const sessions = await getWhatsAppSessions();
    const disclosures = await getWhatsAppDisclosureLogs();
    expect(sessions.data?.[0]).not.toHaveProperty('amount');
    expect(disclosures.data?.[0]).toEqual(expect.objectContaining({ menu_item: 'balance' }));
    expect(disclosures.data?.[0]).not.toHaveProperty('amount');
  });

  it('aggregates health counters from existing WhatsApp records', async () => {
    authMock.mockResolvedValue(authorized);
    const counts = [4, 6, 1, 2, 3, 5].map((count) => chain({ data: null, error: null, count }));
    clientMock.mockReturnValue({ from: vi.fn().mockImplementation(() => counts.shift()) } as never);
    const result = await getWhatsAppHealth();
    expect(result.data).toEqual({ inboundToday: 4, outboundToday: 6, deliveryFailuresToday: 1, templateErrorsToday: 3, capLimitEventsToday: 5 });
  });

  it('filters opt-ins and disclosures by admin-visible fields', () => {
    const person = { first_name: 'Ada', last_name: 'Okoro', resident_code: 'RES001' };
    const optIns = [{ phone_number: '+2348000000000', opted_in: true, source: 'admin', opted_in_at: null, opted_out_at: null, updated_at: '2026-08-24T00:00:00Z', resident: person }];
    const disclosures = [{ phone_number: '+2348000000000', menu_item: 'balance', pin_authenticated: true, created_at: '2026-08-24T10:00:00Z', resident: person, house: null }];
    expect(filterOptIns(optIns, 'res001', 'opted_in')).toHaveLength(1);
    expect(filterOptIns(optIns, 'res001', 'opted_out')).toHaveLength(0);
    expect(filterDisclosureLogs(disclosures, 'balance', '2026-08-24')).toHaveLength(1);
    expect(filterDisclosureLogs(disclosures, 'balance', '2026-08-23')).toHaveLength(0);
  });
});
