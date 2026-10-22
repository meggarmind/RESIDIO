import { beforeEach, describe, expect, it, vi } from 'vitest';

/**
 * #988: the merge actions gate on residents.merge, validate input before touching the database,
 * check the typed code against the kept record as stored, and write one audit entry per record.
 */
const mocks = vi.hoisted(() => ({
  authorizePermission: vi.fn(),
  logAudit: vi.fn(),
  createServerSupabaseClient: vi.fn(),
  createAdminClient: vi.fn(),
  rpc: vi.fn(),
  rows: [] as Array<Record<string, string>>,
}));

vi.mock('@/lib/auth/authorize', () => ({ authorizePermission: mocks.authorizePermission }));
vi.mock('@/lib/audit/logger', () => ({ logAudit: mocks.logAudit }));
vi.mock('@/lib/supabase/server', () => ({
  createServerSupabaseClient: mocks.createServerSupabaseClient,
  createAdminClient: mocks.createAdminClient,
}));
vi.mock('next/cache', () => ({ revalidatePath: vi.fn() }));

import { mergeResidents, previewResidentMerge } from '@/actions/residents/merge-residents';
import { PERMISSIONS } from '@/lib/auth/action-roles';

const KEPT = '11111111-1111-4111-8111-111111111111';
const DUP = '22222222-2222-4222-8222-222222222222';

const MERGE_RESULT = {
  merge_id: '33333333-3333-4333-8333-333333333333',
  kept_resident_id: KEPT,
  merged_resident_id: DUP,
  moved: { 'payment_records.resident_id': 2 },
  folded: {},
  replaced_kept_rows: { resident_houses: 0 },
  contact: { email: 'kept' },
  wallet: { combined: true, kept_balance_before: 0, duplicate_balance_before: 0, kept_balance_after: 0 },
  account_balance: { kept_closing_before: 0, duplicate_closing_before: 0, kept_closing_after: 0 },
  whatsapp_pin_cleared: false,
  kept_has_whatsapp_pin: false,
};

beforeEach(() => {
  vi.clearAllMocks();
  mocks.authorizePermission.mockResolvedValue({ authorized: true, userId: 'user-1', error: null });
  mocks.rows = [
    { id: KEPT, first_name: 'Ada', last_name: 'Obi', resident_code: '123456', account_status: 'active' },
    { id: DUP, first_name: 'Ada', last_name: 'Obi', resident_code: '654321', account_status: 'inactive' },
  ];
  mocks.rpc.mockResolvedValue({ data: MERGE_RESULT, error: null });
  mocks.createServerSupabaseClient.mockResolvedValue({
    from: () => ({ select: () => ({ in: async () => ({ data: mocks.rows, error: null }) }) }),
    rpc: mocks.rpc,
  });
});

const validInput = { keptId: KEPT, duplicateId: DUP, confirmationCode: '123456' };

describe('previewResidentMerge', () => {
  it('checks residents.merge and stops before any database access when it is refused', async () => {
    mocks.authorizePermission.mockResolvedValue({ authorized: false, error: 'Unauthorized' });

    const result = await previewResidentMerge(KEPT, DUP);

    expect(mocks.authorizePermission).toHaveBeenCalledWith(PERMISSIONS.RESIDENTS_MERGE);
    expect(result).toEqual({ data: null, error: 'Unauthorized' });
    expect(mocks.createServerSupabaseClient).not.toHaveBeenCalled();
    expect(mocks.createAdminClient).not.toHaveBeenCalled();
  });

  it('refuses ids that are not uuids, or the same record twice, without calling the database', async () => {
    expect((await previewResidentMerge('not-a-uuid', DUP)).error).toMatch(/valid record to keep/);
    expect((await previewResidentMerge(KEPT, KEPT)).error).toBe('Choose two different residents');
    expect(mocks.rpc).not.toHaveBeenCalled();
  });

  it('calls preview_resident_merge with the session client and returns its JSON', async () => {
    const preview = { kept_resident_id: KEPT, duplicate_resident_id: DUP, can_merge: true, blockers: [] };
    mocks.rpc.mockResolvedValue({ data: preview, error: null });

    const result = await previewResidentMerge(KEPT, DUP);

    expect(mocks.rpc).toHaveBeenCalledWith('preview_resident_merge', { p_kept: KEPT, p_duplicate: DUP });
    expect(mocks.createAdminClient).not.toHaveBeenCalled();
    expect(result).toEqual({ data: preview, error: null });
  });

  it('turns a database permission refusal into a plain message', async () => {
    mocks.rpc.mockResolvedValue({ data: null, error: { code: '42501', message: 'Not authorized to merge residents' } });
    expect((await previewResidentMerge(KEPT, DUP)).error).toBe('You do not have permission to merge residents');
  });
});

describe('mergeResidents', () => {
  it('checks residents.merge and stops before any database access when it is refused', async () => {
    mocks.authorizePermission.mockResolvedValue({ authorized: false, error: 'Unauthorized' });

    const result = await mergeResidents(validInput);

    expect(mocks.authorizePermission).toHaveBeenCalledWith(PERMISSIONS.RESIDENTS_MERGE);
    expect(result).toEqual({ data: null, error: 'Unauthorized' });
    expect(mocks.createServerSupabaseClient).not.toHaveBeenCalled();
    expect(mocks.logAudit).not.toHaveBeenCalled();
  });

  it.each([
    ['a bad uuid', { ...validInput, keptId: 'x' }, /valid record to keep/],
    ['the same record twice', { ...validInput, duplicateId: KEPT }, /two different residents/],
    ['an empty confirmation', { ...validInput, confirmationCode: '  ' }, /Type the kept record/],
    ['an unknown contact field', { ...validInput, contactChoices: { first_name: 'duplicate' } }, /Unrecognized key/],
    ['an unknown contact value', { ...validInput, contactChoices: { email: 'both' } }, /Invalid/],
  ])('refuses %s without calling the database', async (_name, input, message) => {
    const result = await mergeResidents(input as never);

    expect(result.data).toBeNull();
    expect(result.error).toMatch(message);
    expect(mocks.createServerSupabaseClient).not.toHaveBeenCalled();
  });

  it('refuses when the typed code is not the stored code of the record to keep', async () => {
    // The duplicate's code, as a client that swapped the two ids would send it.
    const result = await mergeResidents({ ...validInput, confirmationCode: '654321' });

    expect(result.error).toMatch(/Type 123456/);
    expect(mocks.rpc).not.toHaveBeenCalled();
    expect(mocks.logAudit).not.toHaveBeenCalled();
  });

  it('refuses when either record does not exist', async () => {
    mocks.rows = mocks.rows.slice(0, 1);
    expect((await mergeResidents(validInput)).error).toBe('One or both residents do not exist');
    expect(mocks.rpc).not.toHaveBeenCalled();
  });

  it('calls merge_residents with the contact choices and writes one UPDATE audit entry per record', async () => {
    const result = await mergeResidents({ ...validInput, contactChoices: { phone_secondary: 'duplicate_phone_primary' } });

    expect(result).toEqual({ data: MERGE_RESULT, error: null });
    expect(mocks.rpc).toHaveBeenCalledWith('merge_residents', {
      p_kept: KEPT,
      p_duplicate: DUP,
      p_contact_choices: { phone_secondary: 'duplicate_phone_primary' },
    });
    expect(mocks.logAudit).toHaveBeenCalledTimes(2);
    expect(mocks.logAudit).toHaveBeenCalledWith(expect.objectContaining({
      action: 'UPDATE',
      entityType: 'residents',
      entityId: KEPT,
      newValues: expect.objectContaining({ merge_id: MERGE_RESULT.merge_id, merged_resident_id: DUP, moved: MERGE_RESULT.moved }),
    }));
    expect(mocks.logAudit).toHaveBeenCalledWith(expect.objectContaining({
      action: 'UPDATE',
      entityType: 'residents',
      entityId: DUP,
      oldValues: { account_status: 'inactive', merged_into_resident_id: null },
      newValues: { account_status: 'archived', merged_into_resident_id: KEPT, merge_id: MERGE_RESULT.merge_id },
    }));
  });

  it('returns the blocker message and writes no audit entry when the merge is refused', async () => {
    mocks.rpc.mockResolvedValue({
      data: null,
      error: { code: 'P0001', message: 'Resident merge blocked: same_house', details: '[]' },
    });

    const result = await mergeResidents(validInput);

    expect(result).toEqual({ data: null, error: 'Resident merge blocked: same_house' });
    expect(mocks.logAudit).not.toHaveBeenCalled();
  });

  it('reports a failed invariant as a safety stop that changed nothing', async () => {
    mocks.rpc.mockResolvedValue({ data: null, error: { code: 'P0001', message: 'Resident merge invariant failed: wallet' } });

    expect((await mergeResidents(validInput)).error).toMatch(/safety check and nothing was changed/);
    expect(mocks.logAudit).not.toHaveBeenCalled();
  });
});
