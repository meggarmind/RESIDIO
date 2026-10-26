import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { createElement } from 'react';
import { render } from '@react-email/components';
import { renderToBuffer } from '@react-pdf/renderer';

const getRawSettingsAsService = vi.fn();

vi.mock('@/lib/settings/service', () => ({
  getRawSettingsAsService: (...a: unknown[]) => getRawSettingsAsService(...a),
  getSettingValueAsService: vi.fn(),
}));
vi.mock('@/lib/supabase/server', () => ({ createAdminClient: vi.fn() }));
// No network in Vitest: the PDF image fetch is replaced by a 1x1 PNG data URI below.
const PIXEL = 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNkYPhfDwAChwGA60e6kgAAAABJRU5ErkJggg==';

import { usableEstateLogoUrl, estateLogoDataUri } from '@/lib/branding/estate-logo';
import { getEstateLogoUrl } from '@/lib/branding/estate-logo-server';
import { getEstateEmailSettings } from '@/lib/email/send-email';
import { EmailLayout } from '@/emails/components/email-layout';
import { TestEmail } from '@/emails/test-email';
import { AccountStatementPDF } from '@/lib/pdf/account-statement';
import { InvoiceReceiptPDF } from '@/lib/pdf/invoice-receipt';
import { PaymentReceiptPDF } from '@/lib/pdf/payment-receipt';
import { ClearanceCertificatePDF } from '@/lib/pdf/clearance-certificate';

describe('usableEstateLogoUrl (#1202)', () => {
  it.each([
    [undefined, undefined],
    [null, undefined],
    ['', undefined],
    ['   ', undefined],
    ['https://x/logos/a.webp', undefined],
    ['https://x/logos/a.WEBP?v=2', undefined],
    ['https://x/logos/a.png', 'https://x/logos/a.png'],
    [' https://x/logos/a.jpg ', 'https://x/logos/a.jpg'],
  ])('%j -> %j', (raw, expected) => {
    expect(usableEstateLogoUrl(raw)).toBe(expected);
  });
});

describe('estate logo loaders', () => {
  beforeEach(() => vi.clearAllMocks());

  it('getEstateEmailSettings reads estate_logo_url and drops a WebP one', async () => {
    getRawSettingsAsService.mockResolvedValue({
      status: 'ok',
      values: new Map([['estate_name', 'Palm Court'], ['estate_logo_url', 'https://x/logos/a.png']]),
    });
    await expect(getEstateEmailSettings()).resolves.toMatchObject({ estateLogoUrl: 'https://x/logos/a.png' });
    expect(getRawSettingsAsService).toHaveBeenCalledWith(expect.arrayContaining(['estate_logo_url']));

    getRawSettingsAsService.mockResolvedValue({ status: 'ok', values: new Map([['estate_logo_url', 'https://x/a.webp']]) });
    expect((await getEstateEmailSettings()).estateLogoUrl).toBeUndefined();
    getRawSettingsAsService.mockResolvedValue({ status: 'ok', values: new Map([['estate_logo_url', '']]) });
    expect((await getEstateEmailSettings()).estateLogoUrl).toBeUndefined();
  });

  it('getEstateLogoUrl is undefined when the read fails', async () => {
    getRawSettingsAsService.mockResolvedValue({ status: 'error', message: 'boom' });
    await expect(getEstateLogoUrl()).resolves.toBeUndefined();
    getRawSettingsAsService.mockResolvedValue({ status: 'ok', values: new Map([['estate_logo_url', 'https://x/a.jpg']]) });
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(new Response(new Uint8Array([0xff, 0xd8, 0xff, 0xe0]))));
    await expect(getEstateLogoUrl()).resolves.toMatch(/^data:image\/jpeg;base64,/);
    vi.unstubAllGlobals();
  });
});

describe('email header logo', () => {
  const html = (logo?: string) =>
    render(<EmailLayout preview="p" estateName="Palm Court" estateLogoUrl={logo}>body</EmailLayout>);

  it('renders an img with the URL and estate name as alt when given', async () => {
    const out = await html('https://x/logos/a.png');
    expect(out).toMatch(/<img[^>]*src="https:\/\/x\/logos\/a\.png"/);
    expect(out).toMatch(/alt="Palm Court"/);
  });

  it.each([undefined, '', 'https://x/logos/a.webp'])('renders no img for %j', async (logo) => {
    expect(await html(logo)).not.toMatch(/<img/);
  });

  it('a template passes the logo through to the layout', async () => {
    const out = await render(createElement(TestEmail, { recipientEmail: 'a@b.test', estateName: 'Palm Court', estateLogoUrl: 'https://x/logos/a.png' }));
    expect(out).toMatch(/src="https:\/\/x\/logos\/a\.png"/);
  });
});

describe('PDF logo', () => {
  const statement = {
    resident: { name: 'A B', resident_code: 'R1' },
    house: null,
    period: { from: '2026-01-01', to: '2026-01-31' },
    openingBalance: 0,
    closingBalance: 0,
    transactions: [],
    categories: [],
    summary: { totalInvoiced: 0, totalPaid: 0 },
  } as never;
  const receipt = { receiptNumber: 'R-1', paymentDate: '2026-01-02T00:00:00Z', amount: 100, method: 'cash', reference: null, residentName: 'A B', verifiedAt: null } as never;
  const certificate = {
    id: 'c1', residentId: 'r1', residentName: 'A B', residentCode: 'R1', houseId: 'h1', houseAddress: '1 Palm Rd',
    clearanceDate: '2026-01-02', validUntil: '2026-02-01', validityDays: 30, destination: 'leaving_estate',
    certificateNumber: 'C-1', status: 'confirmed', createdBy: 'u1', createdAt: '2026-01-02T00:00:00Z',
  } as never;
  const invoice = { invoice_number: 'INV-1', amount_due: 100, amount_paid: 100, status: 'paid', due_date: '2026-01-02', invoice_items: [], payments: [] } as never;

  const cases: Array<[string, (logo?: string) => Parameters<typeof renderToBuffer>[0]]> = [
    ['statement', (logo) => AccountStatementPDF({ data: statement, estateLogoUrl: logo })],
    ['payment receipt', (logo) => createElement(PaymentReceiptPDF, { receipt, estateLogoUrl: logo }) as never],
    ['invoice receipt', (logo) => InvoiceReceiptPDF({ invoice, estateLogoUrl: logo })],
    ['clearance certificate', (logo) => createElement(ClearanceCertificatePDF, { certificate, estateLogoUrl: logo }) as never],
  ];

  it.each(cases)('%s renders with a logo, without one, and with a WebP one', async (_n, make) => {
    const withLogo = await renderToBuffer(make(PIXEL));
    const without = await renderToBuffer(make(undefined));
    const webp = await renderToBuffer(make('https://x/logos/a.webp'));
    expect(withLogo.length).toBeGreaterThan(without.length);
    expect(Math.abs(webp.length - without.length)).toBeLessThan(200);
  }, 30_000);
});

describe('estateLogoDataUri (#1202)', () => {
  const png = Uint8Array.from([0x89, 0x50, 0x4e, 0x47, 1, 2]);
  afterEach(() => vi.unstubAllGlobals());

  it('returns a PNG data URI for a fetched PNG', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(new Response(png)));
    expect(await estateLogoDataUri('https://x/a.png')).toBe(`data:image/png;base64,${btoa(String.fromCharCode(...png))}`);
  });

  it.each([
    ['a failed fetch', () => Promise.reject(new Error('down'))],
    ['a 404', () => Promise.resolve(new Response('no', { status: 404 }))],
    ['a non-PNG/JPEG body', () => Promise.resolve(new Response('<svg/>'))],
  ])('returns undefined on %s', async (_n, impl) => {
    vi.stubGlobal('fetch', vi.fn(impl));
    expect(await estateLogoDataUri('https://x/a.png')).toBeUndefined();
  });
});
