import { describe, expect, it } from 'vitest';
import { renderToBuffer } from '@react-pdf/renderer';
import { InvoiceReceiptPDF } from '@/lib/pdf/invoice-receipt';
import type { InvoiceWithDetails } from '@/types/database';

const invoice = {
  invoice_number: 'INV-1001',
  status: 'paid',
  amount_due: 50000,
  amount_paid: 50000,
  created_at: '2026-10-01T00:00:00Z',
  due_date: '2026-10-31',
  resident: { first_name: 'Ada', last_name: 'Example', resident_code: 'RES001' },
  invoice_items: [],
} as unknown as InvoiceWithDetails;

describe('InvoiceReceiptPDF', () => {
  it('shows the estate address in the footer only when given (#1200)', async () => {
    const withAddress = await renderToBuffer(InvoiceReceiptPDF({ invoice, estateAddress: '1 Palm Avenue, Lekki, Lagos' }));
    const empty = await renderToBuffer(InvoiceReceiptPDF({ invoice, estateAddress: '' }));
    const omitted = await renderToBuffer(InvoiceReceiptPDF({ invoice }));

    expect(withAddress.length).toBeGreaterThan(empty.length);
    expect(empty.length).toBe(omitted.length);
  });
});
