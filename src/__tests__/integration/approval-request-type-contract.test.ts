import { describe, expect, it } from 'vitest';
import { APPROVAL_REQUEST_TYPE_LABELS } from '@/types/database';
import { Constants } from '@/types/database.generated';
import type { ApprovalRequestType } from '@/types/database';
import type { Database } from '@/types/database.generated';

/**
 * `ApprovalRequestType` used to be a hand-written union of thirteen values while
 * the `approval_request_type` Postgres enum held three. The ten phantoms were
 * accepted by the compiler and rejected by Postgres on every insert (#107).
 *
 * These tests fail if the union, the label map and the database enum ever
 * disagree again. `Constants` is emitted by `npm run db:types` straight from the
 * database, so it is the runtime witness for what the enum actually holds.
 */
describe('ApprovalRequestType agrees with the database enum', () => {
  const dbValues = Constants.public.Enums.approval_request_type;

  it('is derived from the generated enum rather than retyped', () => {
    // Fails to compile if the union drifts in either direction: each side is
    // asserted assignable to the other.
    const fromGenerated: ApprovalRequestType =
      null as unknown as Database['public']['Enums']['approval_request_type'];
    const toGenerated: Database['public']['Enums']['approval_request_type'] =
      null as unknown as ApprovalRequestType;

    expect(fromGenerated).toBe(toGenerated);
  });

  it('labels exactly the values the database enum holds', () => {
    expect(Object.keys(APPROVAL_REQUEST_TYPE_LABELS).sort()).toEqual([...dbValues].sort());
  });

  it('holds no phantom value that never existed in a migration', () => {
    const phantoms = [
      'bank_account_create',
      'bank_account_update',
      'bank_account_delete',
      'developer_property_access',
      'developer_resident_removal',
      'owner_property_access',
      'owner_resident_modification',
      'owner_security_code_change',
      'impersonation_request',
      'manual_payment_verification',
    ];

    for (const phantom of phantoms) {
      expect(dbValues as readonly string[]).not.toContain(phantom);
      expect(APPROVAL_REQUEST_TYPE_LABELS).not.toHaveProperty(phantom);
    }
  });
});
