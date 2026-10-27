import { describe, expect, it } from 'vitest';
import { renderToBuffer } from '@react-pdf/renderer';
import { AccountStatementPDF } from '@/lib/pdf/account-statement';
import type { AccountStatementData } from '@/actions/billing/get-account-statement';

const data: AccountStatementData = {
  resident: { id: 'r1', name: 'Ada Example', resident_code: 'RES001', email: null, phone: null, entity_type: 'individual', company_name: null },
  house: { id: 'h1', address: '12 Palm Close', short_name: null },
  period: { from: '2026-10-01', to: '2026-10-31' },
  openingBalance: 0,
  closingBalance: 0,
  summary: { totalInvoiced: 0, totalPaid: 0, totalCredits: 0, totalDebits: 0, netChange: 0 },
  transactions: [],
  categories: [],
  generatedAt: '2026-10-26T10:00:00Z',
  generatedBy: null,
};

describe('AccountStatementPDF', () => {
  it('shows the estate address in the footer only when given (#1200)', async () => {
    const withAddress = await renderToBuffer(AccountStatementPDF({ data, estateAddress: '1 Palm Avenue, Lekki, Lagos' }));
    const empty = await renderToBuffer(AccountStatementPDF({ data, estateAddress: '' }));
    const omitted = await renderToBuffer(AccountStatementPDF({ data }));

    expect(withAddress.length).toBeGreaterThan(empty.length);
    expect(empty.length).toBe(omitted.length);
  });
});
