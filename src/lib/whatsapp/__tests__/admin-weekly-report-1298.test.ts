import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({ tables: {} as Record<string, unknown[]>, sendEmail: vi.fn(), ranges: [] as Array<[string, string, string]> }));

vi.mock('@/lib/supabase/server', () => ({
  createAdminClient: () => ({
    from: (table: string) => {
      const query: Record<string, unknown> = {};
      const chain = () => query;
      for (const method of ['select', 'eq', 'in']) query[method] = chain;
      query.gte = (column: string, value: string) => {
        mocks.ranges.push([table, 'gte', value]);
        return query;
      };
      query.lt = (column: string, value: string) => {
        mocks.ranges.push([table, 'lt', value]);
        return query;
      };
      query.then = (resolve: (value: unknown) => void) => resolve({ data: mocks.tables[table] ?? [], error: null });
      return query;
    },
  }),
}));
vi.mock('@/lib/email/send-email', () => ({
  sendEmail: mocks.sendEmail,
  getEstateEmailSettings: vi.fn().mockResolvedValue({ estateName: 'Estate' }),
}));

import { buildWeeklyRows, runWeeklyAdminReport, weeklyWindow } from '@/lib/whatsapp/admin-weekly-report';

describe('weeklyWindow', () => {
  it('covers the 7 whole Lagos days before today', () => {
    // 28 Oct 2026 07:00 Lagos = 06:00 UTC.
    const { from, to } = weeklyWindow(new Date('2026-10-28T06:00:00Z'));
    expect(from.toISOString()).toBe('2026-10-20T23:00:00.000Z'); // 21 Oct 00:00 Lagos
    expect(to.toISOString()).toBe('2026-10-27T23:00:00.000Z'); // 28 Oct 00:00 Lagos
  });

  it('puts 23:30 UTC on the next Lagos day', () => {
    // 23:30 UTC on 27 Oct is 00:30 on 28 Oct in Lagos, so today is already the 28th.
    const { to } = weeklyWindow(new Date('2026-10-27T23:30:00Z'));
    expect(to.toISOString()).toBe('2026-10-27T23:00:00.000Z');
  });
});

describe('buildWeeklyRows', () => {
  const names = new Map([['p1', 'Ada Admin'], ['p2', 'Bola Officer']]);

  it('lists house lookups from disclosures and other actions from requests, oldest first, with Lagos dates', () => {
    const rows = buildWeeklyRows(
      [
        { action: 'owes', profileId: 'p1', completedAt: '2026-10-22T10:00:00Z' },
        { action: 'debt', profileId: 'p2', completedAt: '2026-10-23T10:00:00Z' },
      ],
      [{ createdAt: '2026-10-21T23:30:00Z', adminProfileId: 'p1', house: '4, Palm Street', resident: 'Chi Okoro' }],
      names
    );
    expect(rows).toHaveLength(2);
    // 23:30 UTC on 21 Oct is 22 Oct in Lagos.
    expect(rows[0]).toMatchObject({ date: '22 Oct 2026', admin: 'Ada Admin', target: '4, Palm Street, Chi Okoro' });
    expect(rows[1]).toMatchObject({ date: '23 Oct 2026', admin: 'Bola Officer', outcome: 'Done' });
  });

  it('names an unknown admin instead of leaving a blank', () => {
    const rows = buildWeeklyRows([{ action: 'debt', profileId: 'gone', completedAt: '2026-10-23T10:00:00Z' }], [], names);
    expect(rows[0].admin).toBe('Unknown admin');
  });
});

describe('runWeeklyAdminReport', () => {
  beforeEach(() => {
    mocks.tables = {};
    mocks.ranges = [];
    mocks.sendEmail.mockReset().mockResolvedValue({ success: true });
  });

  it('emails an empty week to every active Chairman with an address', async () => {
    mocks.tables.profiles = [
      { id: 'c1', full_name: 'Chi Chair', email: 'chair@example.com' },
      { id: 'c2', full_name: 'No Mail', email: null },
    ];
    const result = await runWeeklyAdminReport(new Date('2026-10-28T06:00:00Z'));
    expect(result).toEqual({ recipients: 1, rows: 0, sent: true });
    expect(mocks.sendEmail).toHaveBeenCalledTimes(1);
    expect(mocks.sendEmail.mock.calls[0][0].to).toEqual({ email: 'chair@example.com', name: 'Chi Chair' });
    expect(mocks.sendEmail.mock.calls[0][0].subject).toContain('21 Oct 2026 to 27 Oct 2026');
  });

  it('reads both tables inside the 7-day window', async () => {
    mocks.tables.profiles = [{ id: 'c1', full_name: 'Chi Chair', email: 'chair@example.com' }];
    await runWeeklyAdminReport(new Date('2026-10-28T06:00:00Z'));
    for (const table of ['whatsapp_admin_requests', 'whatsapp_disclosure_logs']) {
      expect(mocks.ranges).toContainEqual([table, 'gte', '2026-10-20T23:00:00.000Z']);
      expect(mocks.ranges).toContainEqual([table, 'lt', '2026-10-27T23:00:00.000Z']);
    }
  });

  it('sends nothing and reports no recipients when there is no Chairman', async () => {
    const result = await runWeeklyAdminReport(new Date('2026-10-28T06:00:00Z'));
    expect(result).toEqual({ recipients: 0, rows: 0, sent: false });
    expect(mocks.sendEmail).not.toHaveBeenCalled();
  });

  it('throws when the email fails so the cron run is logged as a failure', async () => {
    mocks.tables.profiles = [{ id: 'c1', full_name: 'Chi Chair', email: 'chair@example.com' }];
    mocks.sendEmail.mockResolvedValue({ success: false, error: 'smtp down' });
    await expect(runWeeklyAdminReport(new Date('2026-10-28T06:00:00Z'))).rejects.toThrow('smtp down');
  });
});
