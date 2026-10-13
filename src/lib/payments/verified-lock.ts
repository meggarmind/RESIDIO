/**
 * #502: once a payment is verified, the figures verification confirmed are frozen.
 * Shared by the updatePayment action (enforcement) and the payment form (disabling).
 */

export const VERIFIED_LOCKED_FIELDS = ['amount', 'resident_id', 'house_id', 'status'] as const;

export type LockedPaymentField = (typeof VERIFIED_LOCKED_FIELDS)[number];

export const VERIFIED_LOCK_MESSAGE =
    'This payment is verified, so its amount, resident, property and status are locked. Un-verify it first to change them.';

/** Fields that may not be edited for this payment (empty when it is not verified). */
export function getLockedPaymentFields(isVerified: boolean | null | undefined): readonly LockedPaymentField[] {
    return isVerified ? VERIFIED_LOCKED_FIELDS : [];
}

type Comparable = Partial<Record<LockedPaymentField, unknown>>;

/** Locked fields whose submitted value differs from the stored one. Absent keys are not changes. */
export function findLockedFieldChanges(
    isVerified: boolean | null | undefined,
    existing: Comparable,
    input: Comparable
): LockedPaymentField[] {
    return getLockedPaymentFields(isVerified).filter((field) => {
        const next = input[field];
        if (next === undefined) return false;
        const prev = existing[field];
        if (field === 'amount') return Number(next) !== Number(prev);
        return (next ?? null) !== (prev ?? null);
    });
}
