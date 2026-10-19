import { describe, expect, it } from 'vitest';
import { formatPdfCurrency } from '@/lib/pdf/format-currency';

describe('formatPdfCurrency', () => {
  it('prints the ISO code, never the naira sign Helvetica cannot draw', () => {
    expect(formatPdfCurrency(5000, 0)).toBe('NGN 5,000');
    expect(formatPdfCurrency(720000)).not.toContain('₦');
  });

  it('keeps two decimals by default, as the currency style did', () => {
    expect(formatPdfCurrency(1234.5)).toBe('NGN 1,234.50');
  });

  it('puts the sign before the code', () => {
    expect(formatPdfCurrency(-2500, 0)).toBe('-NGN 2,500');
  });
});
