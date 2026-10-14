import { describe, expect, it } from 'vitest';
import { isStuckApproval, STUCK_APPROVAL_MINUTES } from '@/lib/approvals/stuck';

const now = new Date('2026-10-14T12:00:00.000Z');
const minutesAgo = (m: number) => new Date(now.getTime() - m * 60_000).toISOString();

describe('isStuckApproval (#557)', () => {
  it('is true for an approved, unapplied request reviewed longer ago than the window', () => {
    expect(
      isStuckApproval({ status: 'approved', applied_at: null, reviewed_at: minutesAgo(30) }, now),
    ).toBe(true);
    expect(
      isStuckApproval({ status: 'approved', reviewed_at: minutesAgo(30) }, now),
    ).toBe(true);
  });

  it('is false while the approval is still inside the window, including exactly at it', () => {
    expect(
      isStuckApproval({ status: 'approved', applied_at: null, reviewed_at: minutesAgo(1) }, now),
    ).toBe(false);
    expect(
      isStuckApproval(
        { status: 'approved', applied_at: null, reviewed_at: minutesAgo(STUCK_APPROVAL_MINUTES) },
        now,
      ),
    ).toBe(false);
  });

  it('is false once applied', () => {
    expect(
      isStuckApproval(
        { status: 'approved', applied_at: minutesAgo(20), reviewed_at: minutesAgo(30) },
        now,
      ),
    ).toBe(false);
  });

  it('is false for pending and rejected requests', () => {
    expect(
      isStuckApproval({ status: 'pending', applied_at: null, reviewed_at: minutesAgo(30) }, now),
    ).toBe(false);
    expect(
      isStuckApproval({ status: 'rejected', applied_at: null, reviewed_at: minutesAgo(30) }, now),
    ).toBe(false);
  });

  it('is false when reviewed_at is missing or unparseable', () => {
    expect(isStuckApproval({ status: 'approved', applied_at: null, reviewed_at: null }, now)).toBe(
      false,
    );
    expect(
      isStuckApproval({ status: 'approved', applied_at: null, reviewed_at: 'garbage' }, now),
    ).toBe(false);
  });
});
