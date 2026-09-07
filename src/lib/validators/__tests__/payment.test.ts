import { describe, expect, it } from 'vitest';
import { paymentStatusEnum } from '@/lib/validators/payment';

describe('paymentStatusEnum', () => {
  it('accepts every status the payment_status DB enum actually admits', () => {
    // Verified live against Supabase (pg_type/pg_enum for `payment_status`):
    // {pending, paid, overdue, failed}. Issue #114 asked to remove 'overdue'
    // on the assumption the DB enum only allows 'paid' | 'pending' | 'failed',
    // but that assumption was the actual drift -- the hand-written type in
    // src/types/database.ts was stale, not this validator. Fixed there instead
    // (src/types/database.ts:764) so the validator and the DB agree on the
    // union that is really storable.
    for (const status of ['pending', 'paid', 'overdue', 'failed']) {
      expect(paymentStatusEnum.safeParse(status).success).toBe(true);
    }
  });

  it('rejects a status the DB enum does not admit', () => {
    expect(paymentStatusEnum.safeParse('cancelled').success).toBe(false);
  });
});
