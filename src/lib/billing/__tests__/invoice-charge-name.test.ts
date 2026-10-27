import { describe, expect, it } from 'vitest';
import { invoiceChargeName } from '@/lib/billing/invoice-charge-name';

describe('invoiceChargeName (#1253)', () => {
  it('uses the rate snapshot item name, not the profile named for today\'s rate', () => {
    expect(invoiceChargeName({
      rate_snapshot: { items: [{ name: 'Security Levy', amount: 5000 }] },
      billing_profile: { name: '10k per month' },
    })).toBe('Security Levy');
  });

  it('joins distinct item names', () => {
    expect(invoiceChargeName({
      rate_snapshot: { items: [{ name: 'Security Levy' }, { name: 'Waste' }, { name: 'Security Levy' }] },
      billing_profile: [{ name: 'Mixed' }],
    })).toBe('Security Levy + Waste');
  });

  it('falls back to the profile name, then to null', () => {
    expect(invoiceChargeName({ rate_snapshot: null, billing_profile: [{ name: ' 5k per month ' }] })).toBe('5k per month');
    expect(invoiceChargeName({ rate_snapshot: { items: [{ name: '' }] }, billing_profile: null })).toBeNull();
  });
});
