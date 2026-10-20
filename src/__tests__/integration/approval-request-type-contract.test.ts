import fs from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import { APPROVAL_REQUEST_TYPE_LABELS } from '@/types/database';
import { Constants } from '@/types/database.generated';

/**
 * `ApprovalRequestType` used to be a hand-written union of thirteen values while
 * the `approval_request_type` Postgres enum held three. The ten phantoms were
 * accepted by the compiler and rejected by Postgres on every insert (#107).
 *
 * These tests fail if the union, the label map and the database enum ever
 * disagree again. `Constants` is emitted by `npm run db:types` straight from the
 * database, so it is the runtime witness for what the enum actually holds.
 *
 * #816 adds two values in migration 20261022000000. Until it is applied and
 * `npm run db:types` is re-run, `Constants` lacks them, so they are pinned below
 * with the migration that declares them; each pending value must be added by a
 * migration in this repository, never only in TypeScript.
 */
describe('ApprovalRequestType agrees with the database enum', () => {
  const dbValues = Constants.public.Enums.approval_request_type;

  // The members the Postgres enum holds, pinned literally. Anything that
  // adds, removes or renames one has to change this line, which is the point.
  const ENUM_MEMBERS = [
    'billing_profile_effective_date',
    'house_plots_change',
    'late_fee_waiver',
    'whatsapp_payment_report',
    'clearance_certificate_request',
  ];

  // Declared by a migration but not yet in the generated types; remove an entry once db:types carries it.
  const PENDING_IN_GENERATED = ['whatsapp_payment_report', 'clearance_certificate_request'];

  it('is derived from the generated enum rather than retyped', () => {
    // A type alias leaves nothing behind at runtime, so an assignability
    // assertion between `ApprovalRequestType` and the generated enum reduces to
    // `expect(null).toBe(null)` under vitest and fails only under `tsc` -- which
    // no workflow in this repo runs. Read the declaration instead: that is
    // observable at runtime, and it goes red the moment anyone retypes the
    // alias as a hand-written union again.
    const source = fs.readFileSync(
      path.join(process.cwd(), 'src/types/database.ts'),
      'utf-8'
    );

    expect(source).toContain("| GeneratedDatabase['public']['Enums']['approval_request_type']");
  });

  it('holds exactly the members the database enum declares, counting the migration not yet in the generated types', () => {
    expect([...dbValues, ...PENDING_IN_GENERATED.filter((value) => !(dbValues as readonly string[]).includes(value))].sort()).toEqual([...ENUM_MEMBERS].sort());
    expect(Object.keys(APPROVAL_REQUEST_TYPE_LABELS).sort()).toEqual(
      [...ENUM_MEMBERS].sort()
    );
  });

  it('labels every value the database enum holds', () => {
    for (const value of dbValues) expect(APPROVAL_REQUEST_TYPE_LABELS).toHaveProperty(value);
  });

  it('adds each pending value in a migration', () => {
    const sql = fs.readFileSync(path.join(process.cwd(), 'supabase/migrations/20261022000000_whatsapp_account_actions.sql'), 'utf-8');
    for (const value of PENDING_IN_GENERATED) {
      expect(sql).toContain(`ALTER TYPE public.approval_request_type ADD VALUE IF NOT EXISTS '${value}';`);
    }
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
