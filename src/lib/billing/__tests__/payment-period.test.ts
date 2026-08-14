import { describe, expect, it } from 'vitest';
import {
  deriveCoveredPeriod,
  formatCoveredPeriod,
  summarizeReceiptAllocations,
  type PaymentReceiptAllocation,
} from '@/lib/billing/payment-period';

function allocation(overrides: Partial<PaymentReceiptAllocation>): PaymentReceiptAllocation {
  return {
    invoiceId: 'invoice-id',
    invoiceNumber: 'INV-001',
    periodStart: '2025-09-01',
    periodEnd: '2025-09-30',
    amountAllocated: 50000,
    invoiceAmountDue: 50000,
    amountPaidBefore: 0,
    amountPaidAfter: 50000,
    balanceAfter: 0,
    statusAfter: 'paid',
    ...overrides,
  };
}

describe('payment coverage periods', () => {
  it('collapses a same-month range to one month', () => {
    expect(formatCoveredPeriod('2025-09-01', '2025-09-30')).toBe('Sep 2025');
  });

  it('formats a true multi-month range', () => {
    expect(formatCoveredPeriod('2024-11-01', '2025-09-30')).toBe('Nov 2024 - Sep 2025');
  });

  it('derives the outer range from invoice periods', () => {
    expect(deriveCoveredPeriod([
      { period_start: '2025-09-01', period_end: '2025-09-30' },
      { period_start: '2024-11-01', period_end: '2024-11-30' },
    ])).toEqual({ start: '2024-11-01', end: '2025-09-30' });
  });

  it('ignores invalid or incomplete periods', () => {
    expect(deriveCoveredPeriod([
      { period_start: null, period_end: '2025-09-30' },
      { period_start: 'not-a-date', period_end: '2025-09-30' },
    ])).toBeNull();
    expect(formatCoveredPeriod('2025-10-01', '2025-09-30')).toBeNull();
  });

  it('excludes a partial later invoice from the fully covered period', () => {
    const summary = summarizeReceiptAllocations([
      allocation({ invoiceId: 'sep', invoiceNumber: 'INV-SEP' }),
      allocation({
        invoiceId: 'oct',
        invoiceNumber: 'INV-OCT',
        periodStart: '2025-10-01',
        periodEnd: '2025-10-31',
        amountAllocated: 20000,
        invoiceAmountDue: 40000,
        amountPaidAfter: 20000,
        balanceAfter: 20000,
        statusAfter: 'partially_paid',
      }),
    ]);

    expect(summary.fullyCoveredPeriod).toEqual({ start: '2025-09-01', end: '2025-09-30' });
    expect(summary.partialAllocations).toHaveLength(1);
    expect(formatCoveredPeriod(summary.fullyCoveredPeriod?.start, summary.fullyCoveredPeriod?.end)).toBe('Sep 2025');
  });

  it('returns no fully covered period for a partial-only allocation', () => {
    const summary = summarizeReceiptAllocations([
      allocation({
        periodStart: '2025-10-01',
        periodEnd: '2025-10-31',
        amountAllocated: 20000,
        invoiceAmountDue: 40000,
        amountPaidAfter: 20000,
        balanceAfter: 20000,
        statusAfter: 'partially_paid',
      }),
    ]);

    expect(summary.fullyCoveredPeriod).toBeNull();
    expect(summary.partialAllocations[0].balanceAfter).toBe(20000);
  });

  it('keeps a full multi-month range when every allocation is paid', () => {
    const summary = summarizeReceiptAllocations([
      allocation({ invoiceId: 'sep' }),
      allocation({
        invoiceId: 'oct',
        periodStart: '2025-10-01',
        periodEnd: '2025-10-31',
      }),
    ]);

    expect(formatCoveredPeriod(summary.fullyCoveredPeriod?.start, summary.fullyCoveredPeriod?.end)).toBe('Sep 2025 - Oct 2025');
    expect(summary.partialAllocations).toHaveLength(0);
  });

  it('treats a previously partial invoice as fully covered when this allocation closes it', () => {
    const summary = summarizeReceiptAllocations([
      allocation({
        amountAllocated: 20000,
        invoiceAmountDue: 40000,
        amountPaidBefore: 20000,
        amountPaidAfter: 40000,
        balanceAfter: 0,
        statusAfter: 'paid',
      }),
    ]);

    expect(formatCoveredPeriod(summary.fullyCoveredPeriod?.start, summary.fullyCoveredPeriod?.end)).toBe('Sep 2025');
    expect(summary.partialAllocations).toHaveLength(0);
  });
});
