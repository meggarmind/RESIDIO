import { describe, expect, it } from 'vitest';
import { renderToBuffer } from '@react-pdf/renderer';
import { PaymentReceiptPDF, type PaymentReceiptData } from '@/lib/pdf/payment-receipt';

const receipt: PaymentReceiptData = {
  receiptNumber: 'RCP-1A2B3C4D',
  residentName: 'Ada Example',
  residentCode: 'RES001',
  propertyLabel: '12 Palm Close',
  amount: 50000,
  paymentDate: '2026-10-12T11:00:00+00:00',
  method: 'bank_transfer',
  reference: 'GTB TRF FROM ADA',
  verifiedAt: '2026-10-13T09:00:00+00:00',
};

describe('PaymentReceiptPDF', () => {
  it('renders a PDF with and without the optional lines', async () => {
    const full = await renderToBuffer(PaymentReceiptPDF({ receipt, estateName: 'Palm Estate' }));
    const bare = await renderToBuffer(PaymentReceiptPDF({ receipt: { ...receipt, method: null, reference: null, verifiedAt: null } }));

    expect(full.subarray(0, 5).toString()).toBe('%PDF-');
    expect(bare.subarray(0, 5).toString()).toBe('%PDF-');
    expect(full.length).toBeGreaterThan(bare.length);
  });
});
