/**
 * Roles whose holders are notified when a renter initiates move-out (#626).
 * Kept out of the 'use server' action file, which may only export async functions.
 */
// TODO(slice 3, #824): recipient list, no permission is held by exactly these two roles. Revisit when roles are re-seeded.
export const MOVE_OUT_NOTIFY_ROLES = ['security_officer', 'financial_officer'] as const;
