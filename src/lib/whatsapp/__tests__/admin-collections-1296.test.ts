import { describe, expect, it, vi } from 'vitest';

vi.mock('@/lib/supabase/server', () => ({ createAdminClient: vi.fn() }));

import { PERMISSIONS } from '@/lib/auth/action-roles';
import { WHATSAPP_ADMIN_ACTIONS, WHATSAPP_ADMIN_MENU, adminMenuText, type WhatsAppAdminAccount } from '@/lib/whatsapp/admin';
import {
  CLEARANCE_QUEUE_MAX,
  collectionDays,
  composeClearanceQueueAnswer,
  composeCollectionsAnswer,
  loadPendingClearanceRequests,
  loadVerifiedPayments,
  type ClearanceRequest,
} from '@/lib/whatsapp/admin-collections';

// 23:30 UTC on 31 Oct is 00:30 on 1 Nov in Lagos (UTC+1): the day and the month both turn over.
const AFTER_LAGOS_MIDNIGHT = new Date('2026-10-31T23:30:00Z');
// 22:30 UTC on 31 Oct is 23:30 on 31 Oct in Lagos.
const BEFORE_LAGOS_MIDNIGHT = new Date('2026-10-31T22:30:00Z');

describe('collectionDays (#1296)', () => {
  it('uses the Lagos day, not the UTC day', () => {
    expect(collectionDays(BEFORE_LAGOS_MIDNIGHT)).toEqual({ today: '2026-10-31', monthStart: '2026-10-01', monthEnd: '2026-10-31' });
    expect(collectionDays(AFTER_LAGOS_MIDNIGHT)).toEqual({ today: '2026-11-01', monthStart: '2026-11-01', monthEnd: '2026-11-30' });
  });
});

describe('composeCollectionsAnswer (#1296)', () => {
  const payments = [
    { amount: 5000, paymentDate: '2026-10-31', street: 'Palm Street' },
    { amount: 2500.5, paymentDate: '2026-10-31', street: 'Palm Street' },
    { amount: 10000, paymentDate: '2026-10-31', street: 'Acacia Close' },
    { amount: 7000, paymentDate: '2026-10-12', street: 'Palm Street' },
  ];

  it('totals today and the month, with a line per street', () => {
    const text = composeCollectionsAnswer(payments, BEFORE_LAGOS_MIDNIGHT);
    expect(text).toContain('*Collections, 31 Oct 2026*\n\nToday:');
    expect(text).toContain('Today: ₦17,500.50 (3 payments)');
    expect(text).toContain('This month so far: ₦24,500.50 (4 payments)');
    expect(text).toContain('Acacia Close: ₦10,000.00 (1 payment)');
    expect(text).toContain('Palm Street: ₦7,500.50 (2 payments)');
  });

  it('counts a payment dated the Lagos day as today just after midnight Lagos (a UTC day would not)', () => {
    const text = composeCollectionsAnswer([{ amount: 900, paymentDate: '2026-11-01', street: null }], AFTER_LAGOS_MIDNIGHT);
    expect(text).toContain('*Collections, 1 Nov 2026*');
    expect(text).toContain('Today: ₦900.00 (1 payment)');
    expect(text).toContain('No house on record: ₦900.00 (1 payment)');
  });

  it('shows nil and no street list when nothing came in today', () => {
    const text = composeCollectionsAnswer([], BEFORE_LAGOS_MIDNIGHT);
    expect(text).toContain('Today: ₦0.00 (0 payments)');
    expect(text).not.toContain('Today by street');
  });
});

describe('loadVerifiedPayments (#1296)', () => {
  function fakeClient(pages: unknown[][]) {
    const calls: Record<string, unknown[]> = {};
    let page = 0;
    const query: Record<string, unknown> = {};
    for (const name of ['select', 'eq', 'or', 'gte', 'lte', 'order']) {
      query[name] = (...args: unknown[]) => {
        calls[name] = args;
        return query;
      };
    }
    query.range = (...args: unknown[]) => {
      calls.range = args;
      return Promise.resolve({ data: pages[page++] ?? [], error: null });
    };
    return { client: { from: (table: string) => ((calls.from = [table]), query) } as never, calls };
  }

  it('asks for paid, verified payments in the date range, using the dashboard verified rule', async () => {
    const { client, calls } = fakeClient([[{ id: '1', amount: '1500', payment_date: '2026-10-31', house: { street: { name: 'Palm Street' } } }]]);
    const rows = await loadVerifiedPayments('2026-10-01', '2026-10-31', client);
    expect(rows).toEqual([{ amount: 1500, paymentDate: '2026-10-31', street: 'Palm Street' }]);
    expect(calls.from).toEqual(['payment_records']);
    expect(calls.eq).toEqual(['status', 'paid']);
    expect(calls.or).toEqual(['is_verified.eq.true,import_id.not.is.null,email_import_id.not.is.null']);
    expect(calls.gte).toEqual(['payment_date', '2026-10-01']);
    expect(calls.lte).toEqual(['payment_date', '2026-10-31']);
  });

  it('reads every page, not only the first 1000 rows', async () => {
    const full = Array.from({ length: 1000 }, (_, i) => ({ id: String(i), amount: 1, payment_date: '2026-10-01', house: null }));
    const { client } = fakeClient([full, [{ id: 'x', amount: 1, payment_date: '2026-10-02', house: null }]]);
    expect(await loadVerifiedPayments('2026-10-01', '2026-10-31', client)).toHaveLength(1001);
  });
});

describe('clearance queue (#1296)', () => {
  const row = (i: number): ClearanceRequest => ({ createdAt: `2026-10-${String(i).padStart(2, '0')}T09:00:00Z`, property: `House ${i}`, resident: `Resident ${i}` });

  it('lists the rows, then "and N more", and links to approvals', () => {
    const rows = Array.from({ length: CLEARANCE_QUEUE_MAX }, (_, i) => row(i + 1));
    const text = composeClearanceQueueAnswer(rows, 14, 'https://estate.test/approvals');
    expect(text).toContain('*Clearance requests waiting (14)*');
    expect(text).toContain('1. House 1, Resident 1, asked 1 Oct 2026');
    expect(text).toContain('and 4 more');
    expect(text).toContain('https://estate.test/approvals');
  });

  it('has no "more" line when everything fits, and says so when the queue is empty', () => {
    expect(composeClearanceQueueAnswer([row(1)], 1, null)).not.toContain('more');
    expect(composeClearanceQueueAnswer([], 0, 'https://estate.test/approvals')).toBe('No clearance certificate requests are waiting.');
  });

  it('reads only pending clearance requests, newest first, capped at 10', async () => {
    const calls: Record<string, unknown[]> = {};
    const query: Record<string, unknown> = {};
    for (const name of ['select', 'eq', 'order']) {
      query[name] = (...args: unknown[]) => {
        (calls[name] ??= []).push(args);
        return query;
      };
    }
    query.limit = (n: number) => {
      calls.limit = [n];
      return Promise.resolve({ data: [{ created_at: '2026-10-30T09:00:00Z', requested_changes: { property: 'KOA-18A', resident: 'Ada' } }], count: 12, error: null });
    };
    const result = await loadPendingClearanceRequests({ from: () => query } as never);
    expect(calls.eq).toEqual([['request_type', 'clearance_certificate_request'], ['status', 'pending']]);
    expect(calls.order).toEqual([['created_at', { ascending: false }]]);
    expect(calls.limit).toEqual([CLEARANCE_QUEUE_MAX]);
    expect(result).toEqual({ rows: [{ createdAt: '2026-10-30T09:00:00Z', property: 'KOA-18A', resident: 'Ada' }], total: 12 });
  });
});

describe('menu wiring (#1296)', () => {
  const account = (permissions: string[]): WhatsAppAdminAccount => ({
    profileId: 'p', fullName: 'Ada', email: null, approvalStatus: 'active', roleId: 'r', roleName: 'chairman',
    roleDisplayName: 'Chairman', roleCategory: 'exco', permissions, totpSecret: null,
  });

  it('gives each item its own permission', () => {
    expect(WHATSAPP_ADMIN_ACTIONS[WHATSAPP_ADMIN_MENU['3']].permission).toBe(PERMISSIONS.WHATSAPP_ADMIN_COLLECTIONS);
    expect(WHATSAPP_ADMIN_ACTIONS[WHATSAPP_ADMIN_MENU['4']].permission).toBe(PERMISSIONS.WHATSAPP_ADMIN_CLEARANCE_QUEUE);
  });

  it('hides the items from a role without the permission', () => {
    const without = adminMenuText(account([PERMISSIONS.WHATSAPP_ADMIN_QUERY, PERMISSIONS.WHATSAPP_ADMIN_RESIDENT_STATUS]), null);
    expect(without).not.toContain("Today's collections");
    expect(without).not.toContain('Clearance requests waiting');
    const withBoth = adminMenuText(account([PERMISSIONS.WHATSAPP_ADMIN_COLLECTIONS, PERMISSIONS.WHATSAPP_ADMIN_CLEARANCE_QUEUE]), null);
    expect(withBoth).toContain("3. 📊 Today's collections");
    expect(withBoth).toContain('4. 📋 Clearance requests waiting');
  });
});
