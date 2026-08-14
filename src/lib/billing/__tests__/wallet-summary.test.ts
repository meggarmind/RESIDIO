import { describe, expect, it } from 'vitest';
import {
  calculateOutstandingDebit,
  sumOutstandingDebits,
} from '@/lib/billing/wallet-summary';

describe('wallet outstanding debit summary', () => {
  it('returns a negative annual balance when credits create a surplus', () => {
    expect(calculateOutstandingDebit(55_000, 60_000)).toBe(-5_000);
  });

  it('returns the unpaid annual balance without consuming an opening surplus', () => {
    expect(calculateOutstandingDebit(60_000, 45_000)).toBe(15_000);
  });

  it('returns zero when annual obligations equal annual credits', () => {
    expect(calculateOutstandingDebit(60_000, 60_000)).toBe(0);
  });

  it('nets annual surpluses against later unpaid balances', () => {
    expect(sumOutstandingDebits([-5_000, 15_000, 10_000])).toBe(20_000);
  });
});
