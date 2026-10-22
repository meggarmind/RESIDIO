import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  houses: [] as unknown[],
  getDebtStatuses: vi.fn(),
  renderToBuffer: vi.fn(),
  addToQueue: vi.fn(),
  rowsError: null as { message: string } | null,
  pdfComponent: vi.fn(() => 'pdf-element'),
}));

vi.mock('@/lib/supabase/server', () => ({
  createAdminClient: () => ({
    from: () => ({
      select: () => ({ eq: () => ({ range: async () => ({ data: mocks.houses, error: mocks.rowsError }) }) }),
    }),
  }),
}));
vi.mock('@/lib/settings/service', () => ({
  getRawSettingsAsService: async () => ({ status: 'ok', values: new Map([['estate_name', 'Test Estate']]) }),
}));
vi.mock('@/lib/billing/debt-status', () => ({
  getDebtStatuses: mocks.getDebtStatuses,
  readDebtStatusSettings: async () => ({ reportFootnote: 'Contact the Financial Secretary.' }),
}));
vi.mock('@/lib/notifications/queue', () => ({ addToQueue: mocks.addToQueue, PRIORITY: { NORMAL: 5 } }));
vi.mock('@/lib/pdf/reports/debt-status-pdf', () => ({ DebtStatusPdf: mocks.pdfComponent }));
vi.mock('@react-pdf/renderer', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@react-pdf/renderer')>()),
  renderToBuffer: mocks.renderToBuffer,
}));

import {
  deliveryFor,
  isReportableHouse,
  loadReportableHouses,
  parseStreetChoice,
  queueDebtReportEmail,
  renderDebtStatusReport,
  streetOptions,
} from '@/lib/whatsapp/debt-report';

const link = { is_active: true, is_primary: true };
function house(id: string, street: string, number: string, overrides: Record<string, unknown> = {}) {
  return {
    id,
    house_number: number,
    short_name: null,
    identifier_unverified: false,
    property_status: 'occupied',
    is_active: true,
    street: { id: `s-${street}`, name: street },
    resident_houses: [link],
    ...overrides,
  };
}

beforeEach(() => {
  vi.clearAllMocks();
  mocks.rowsError = null;
  mocks.houses = [
    house('h1', 'Bravo Street', '2'),
    house('h2', 'Alpha Street', '10'),
    house('h3', 'Alpha Street', '9'),
    house('h4', 'Alpha Street', '11', { identifier_unverified: true }),
    house('h5', 'Alpha Street', '12', { property_status: 'vacant' }),
    house('h6', 'Alpha Street', '13', { property_status: 'under_renovation' }),
    house('h7', 'Alpha Street', '14', { property_status: 'under_construction' }),
    house('h8', 'Alpha Street', '15', { resident_houses: [] }),
    house('h9', 'Alpha Street', '16', { resident_houses: [{ is_active: false, is_primary: true }] }),
    house('h10', 'Alpha Street', '17', { resident_houses: [{ is_active: true, is_primary: false }] }),
  ];
  mocks.getDebtStatuses.mockImplementation(async (_c: unknown, p: { houseIds: string[] }) =>
    p.houseIds.map((houseId) => ({ houseId, label: 'Arrears', status: 'arrears' })));
  mocks.renderToBuffer.mockResolvedValue(Buffer.from('%PDF'));
});

describe('which houses are reported', () => {
  it.each([
    ['identifier_unverified', { identifier_unverified: true }],
    ['vacant', { property_status: 'vacant' }],
    ['under_renovation', { property_status: 'under_renovation' }],
    ['under_construction', { property_status: 'under_construction' }],
    ['no resident link', { resident_houses: [] }],
    ['inactive primary resident', { resident_houses: [{ is_active: false, is_primary: true }] }],
    ['active non-primary resident only', { resident_houses: [{ is_active: true, is_primary: false }] }],
    ['inactive house', { is_active: false }],
  ])('excludes a house with %s', (_label, overrides) => {
    expect(isReportableHouse(house('x', 'A', '1', overrides) as never)).toBe(false);
  });

  it('keeps an occupied, verified house with an active primary resident', () => {
    expect(isReportableHouse(house('x', 'A', '1') as never)).toBe(true);
  });

  it('loads only reportable houses, ordered by street then natural house number', async () => {
    const houses = await loadReportableHouses();
    expect(houses.map((h) => h.id)).toEqual(['h3', 'h2', 'h1']);
  });

  it('throws when the houses cannot be read', async () => {
    mocks.rowsError = { message: 'db down' };
    await expect(loadReportableHouses()).rejects.toThrow('db down');
  });
});

describe('street choice', () => {
  it('numbers streets in name order with their reportable house counts', async () => {
    expect(streetOptions(await loadReportableHouses())).toEqual([
      { number: 1, id: 's-Alpha Street', name: 'Alpha Street', houseCount: 2 },
      { number: 2, id: 's-Bravo Street', name: 'Bravo Street', houseCount: 1 },
    ]);
  });

  it('parses ALL, one number and several numbers; rejects anything else', () => {
    expect(parseStreetChoice(' all ')).toEqual({ all: true });
    expect(parseStreetChoice('2')).toEqual({ all: false, numbers: [2] });
    expect(parseStreetChoice('2,3')).toEqual({ all: false, numbers: [2, 3] });
    expect(parseStreetChoice('2 3, 2')).toEqual({ all: false, numbers: [2, 3] });
    expect(parseStreetChoice('hello')).toBeNull();
    expect(parseStreetChoice('2,')).toBeNull();
    expect(parseStreetChoice('')).toBeNull();
  });
});

describe('size rule', () => {
  it('keeps the limit itself in chat and sends one house more by email', () => {
    expect(deliveryFor(40, 40)).toBe('chat');
    expect(deliveryFor(41, 40)).toBe('email');
    expect(deliveryFor(43, 40)).toBe('email');
  });
});

describe('renderDebtStatusReport', () => {
  it('ALL reports every reportable house', async () => {
    const report = await renderDebtStatusReport({ all: true, streetIds: [] });
    expect(mocks.getDebtStatuses.mock.calls[0][1].houseIds).toEqual(['h3', 'h2', 'h1']);
    expect(report).toMatchObject({ houseCount: 3, scopeLabel: 'Whole estate' });
  });

  it('a street choice reports only the chosen streets', async () => {
    const report = await renderDebtStatusReport({ all: false, streetIds: ['s-Bravo Street'] });
    expect(mocks.getDebtStatuses.mock.calls[0][1].houseIds).toEqual(['h1']);
    expect(report).toMatchObject({ houseCount: 1, scopeLabel: 'Bravo Street' });
  });

  it('several streets are all included', async () => {
    const report = await renderDebtStatusReport({ all: false, streetIds: ['s-Alpha Street', 's-Bravo Street'] });
    expect(report).toMatchObject({ houseCount: 3, scopeLabel: 'Alpha Street, Bravo Street' });
  });

  it('draws only street, house and status, with the footnote from Settings', async () => {
    await renderDebtStatusReport({ all: true, streetIds: [] });
    const data = (mocks.pdfComponent.mock.calls[0] as unknown as [{ data: { footnote: string; rows: unknown[] } }])[0].data;
    expect(data.footnote).toBe('Contact the Financial Secretary.');
    expect(data.rows[0]).toEqual({ street: 'Alpha Street', house: '9', status: 'Arrears' });
  });

  it('lets a PDF failure through so the caller can refuse', async () => {
    mocks.renderToBuffer.mockRejectedValue(new Error('pdf broke'));
    await expect(renderDebtStatusReport({ all: true, streetIds: [] })).rejects.toThrow('pdf broke');
  });
});

describe('queueDebtReportEmail', () => {
  it('queues a recipient-less email carrying the admin profile and the scope', async () => {
    mocks.addToQueue.mockResolvedValue({ success: true, queueId: 'q1' });
    await queueDebtReportEmail({ profileId: 'admin-1', email: 'ada@example.test', fullName: 'Ada Admin', scope: { all: false, streetIds: ['s1'] }, scopeLabel: 'S1' });
    expect(mocks.addToQueue).toHaveBeenCalledWith(expect.objectContaining({
      recipient_id: null,
      recipient_email: 'ada@example.test',
      channel: 'email',
      metadata: expect.objectContaining({ admin_profile_id: 'admin-1', whatsapp_debt_report: { all: false, streetIds: ['s1'], scopeLabel: 'S1' } }),
    }));
  });

  it('throws when the queue refuses the row', async () => {
    mocks.addToQueue.mockResolvedValue({ success: false, error: 'nope' });
    await expect(queueDebtReportEmail({ profileId: 'a', email: 'e@x.test', fullName: 'A', scope: { all: true, streetIds: [] }, scopeLabel: 'x' })).rejects.toThrow('nope');
  });
});
