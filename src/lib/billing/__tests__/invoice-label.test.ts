import { describe, expect, it } from 'vitest';
import { invoiceLabel } from '@/lib/billing/invoice-label';

const dues = { invoice_type: 'SERVICE_CHARGE', profileName: '10k per month', periodStart: '2021-04-01' };

describe('invoiceLabel (#1253)', () => {
  it('names the invoice from its rate snapshot items, not the current profile name', () => {
    expect(invoiceLabel({ ...dues, rate_snapshot: { items: [{ name: 'Security Levy', amount: 5000 }] } })).toBe('Security Levy, APR 2021');
  });

  it('joins distinct item names and ignores blank ones', () => {
    const rate_snapshot = { items: [{ name: 'Security Levy' }, { name: ' Waste ' }, { name: 'Security Levy' }, { name: '  ' }, {}] };
    expect(invoiceLabel({ ...dues, rate_snapshot })).toBe('Security Levy + Waste, APR 2021');
  });

  it('falls back to the profile name, then the invoice type, when the snapshot has no names', () => {
    expect(invoiceLabel({ ...dues, rate_snapshot: null })).toBe('10k per month, APR 2021');
    expect(invoiceLabel({ ...dues, rate_snapshot: { items: [] } })).toBe('10k per month, APR 2021');
    expect(invoiceLabel({ ...dues, rate_snapshot: { items: 'bad' } })).toBe('10k per month, APR 2021');
    expect(invoiceLabel({ invoice_type: 'LEVY', profileName: null, periodStart: null })).toBe('Levy');
  });
});
