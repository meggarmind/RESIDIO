import { describe, it, expect } from 'vitest';
import { getLockedPaymentFields, findLockedFieldChanges } from '@/lib/payments/verified-lock';

describe('getLockedPaymentFields (#502)', () => {
  it('locks amount, resident, house and status for a verified payment', () => {
    expect([...getLockedPaymentFields(true)].sort()).toEqual(['amount', 'house_id', 'resident_id', 'status']);
  });
  it('locks nothing for an unverified or unknown payment', () => {
    expect(getLockedPaymentFields(false)).toEqual([]);
    expect(getLockedPaymentFields(null)).toEqual([]);
  });
  it('never locks notes or reference_number', () => {
    expect(getLockedPaymentFields(true)).not.toContain('notes');
    expect(getLockedPaymentFields(true)).not.toContain('reference_number');
  });
});

describe('findLockedFieldChanges', () => {
  const old = { amount: '5000.00', resident_id: 'r', house_id: null, status: 'paid' };
  it('ignores unchanged and absent values (numeric string vs number, null vs undefined)', () => {
    expect(findLockedFieldChanges(true, old, { amount: 5000, house_id: undefined, status: 'paid' })).toEqual([]);
  });
  it('reports real changes only when verified', () => {
    expect(findLockedFieldChanges(true, old, { amount: 1 })).toEqual(['amount']);
    expect(findLockedFieldChanges(false, old, { amount: 1 })).toEqual([]);
  });
});
