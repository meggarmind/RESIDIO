import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  createAdminClient: vi.fn(),
  createMatcher: vi.fn(),
  extractPdfText: vi.fn(),
  parseFirstBankPdf: vi.fn(),
  getAttachmentBuffer: vi.fn(),
}));

vi.mock('@/lib/supabase/server', () => ({ createAdminClient: mocks.createAdminClient }));
vi.mock('@/lib/matching/resident-matcher', () => ({ createMatcher: mocks.createMatcher }));
vi.mock('@/lib/expenses/category-matcher', () => ({ findMatchingExpenseCategory: vi.fn() }));
vi.mock('@/lib/email-imports/import-records', () => ({ writeEmailImportStatus: vi.fn() }));
vi.mock('@/lib/audit/logger', () => ({ logAudit: vi.fn() }));
vi.mock('@/lib/email-imports/parsers/first-bank-alert', () => ({
  parseFirstBankAlert: vi.fn(),
  isFirstBankAlert: vi.fn(() => false),
}));
vi.mock('@/lib/email-imports/parsers/first-bank-pdf', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/lib/email-imports/parsers/first-bank-pdf')>()),
  extractPdfText: mocks.extractPdfText,
  parseFirstBankPdf: mocks.parseFirstBankPdf,
}));

import { matchEmailTransactions } from '@/lib/email-imports/process-email-matching';

type Call = { table: string; select?: string; eq: Array<[string, unknown]> };

function makeClient(calls: Call[]) {
  return {
    from(table: string) {
      const call: Call = { table, eq: [] };
      calls.push(call);
      const result = () => {
        if (table === 'email_transactions')
          return { data: [{ id: 't1', transaction_type: 'credit', amount: 1 }], error: null };
        if (table === 'residents')
          return {
            data: [{ id: 'r1', first_name: 'A', last_name: 'B', resident_code: 'R1', phone_primary: '0803', email: null }],
            error: null,
          };
        return { data: [], error: null };
      };
      const chain: Record<string, unknown> = {
        select: (s: string) => ((call.select = s), chain),
        eq: (c: string, v: unknown) => (call.eq.push([c, v]), chain),
        order: () => chain,
        update: () => chain,
        then: (res: (v: unknown) => unknown) => Promise.resolve(result()).then(res),
      };
      return chain;
    },
  };
}

describe('email matching resident query (#1038)', () => {
  beforeEach(() => vi.clearAllMocks());

  it('selects phone_primary, filters on account_status and hands the matcher a phone', async () => {
    const calls: Call[] = [];
    mocks.createAdminClient.mockResolvedValue(makeClient(calls));
    mocks.createMatcher.mockReturnValue({
      match: () => ({ resident_id: null, confidence: 'none', method: null, all_matches: [] }),
    });

    await matchEmailTransactions('imp1');

    const residentsCall = calls.find((c) => c.table === 'residents')!;
    expect(residentsCall.select).toContain('phone_primary');
    expect(residentsCall.select).not.toMatch(/\bphone\b(?!_)/);
    expect(residentsCall.eq).toContainEqual(['account_status', 'active']);
    expect(residentsCall.eq.map(([c]) => c)).not.toContain('is_active');

    const [residents] = mocks.createMatcher.mock.calls[0];
    expect(residents).toEqual([
      { id: 'r1', first_name: 'A', last_name: 'B', resident_code: 'R1', email: null, phone: '0803' },
    ]);
  });
});

describe('email PDF account number (#1038)', () => {
  beforeEach(() => vi.clearAllMocks());

  function pdfClient() {
    const message = {
      id: 'm1',
      email_type: 'statement_attachment',
      email_import_id: 'i1',
      attachments: [{ name: 'a.pdf', path: 'a.pdf', size: 1, mimeType: 'application/pdf' }],
    };
    const chain: Record<string, unknown> = {
      select: () => chain,
      eq: () => chain,
      update: () => chain,
      single: () => Promise.resolve({ data: message, error: null }),
      then: (res: (v: unknown) => unknown) => Promise.resolve({ data: null, error: null }).then(res),
    };
    return {
      from: () => chain,
      storage: {
        from: () => ({
          download: () => Promise.resolve({ data: { arrayBuffer: async () => new ArrayBuffer(4) }, error: null }),
        }),
      },
    };
  }

  it('passes the last 4 account digits from extractPdfText to the PDF parser', async () => {
    const { parseEmailMessage } = await import('@/lib/email-imports/parse-email');
    mocks.createAdminClient.mockResolvedValue(pdfClient());
    mocks.extractPdfText.mockResolvedValue('[10,20]Account [30,20]Number: [50,20]0123456789');
    mocks.parseFirstBankPdf.mockResolvedValue({ transactions: [], error: null });

    await parseEmailMessage('m1');

    expect(mocks.parseFirstBankPdf).toHaveBeenCalledWith(
      expect.any(Buffer),
      expect.objectContaining({ accountLast4: '6789' })
    );
  });

  it('logs a text-read failure instead of swallowing it, and still parses', async () => {
    const { parseEmailMessage } = await import('@/lib/email-imports/parse-email');
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    mocks.createAdminClient.mockResolvedValue(pdfClient());
    mocks.extractPdfText.mockRejectedValue(new Error('No password given'));
    mocks.parseFirstBankPdf.mockResolvedValue({ transactions: [], error: null });

    await parseEmailMessage('m1');

    expect(warn).toHaveBeenCalledWith(expect.stringContaining('a.pdf'), expect.any(Error));
    expect(mocks.parseFirstBankPdf).toHaveBeenCalledWith(
      expect.any(Buffer),
      expect.objectContaining({ accountLast4: undefined })
    );
  });
});
