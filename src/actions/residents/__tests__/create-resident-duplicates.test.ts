import { beforeEach, describe, expect, it, vi } from 'vitest';

/**
 * #820: createResident looks for an existing resident before inserting, offers to link the house
 * to them, and only inserts a second record on the deliberate "create anyway" path.
 */
const mocks = vi.hoisted(() => ({
  authorizePermission: vi.fn(),
  logAudit: vi.fn(),
  createServerSupabaseClient: vi.fn(),
  createAdminClient: vi.fn(),
  loadDuplicateMatches: vi.fn(),
  assignHouse: vi.fn(),
  insertResident: vi.fn(),
}));

vi.mock('@/lib/auth/authorize', () => ({ authorizePermission: mocks.authorizePermission }));
vi.mock('@/lib/audit/logger', () => ({ logAudit: mocks.logAudit }));
vi.mock('@/lib/supabase/server', () => ({
  createServerSupabaseClient: mocks.createServerSupabaseClient,
  createAdminClient: mocks.createAdminClient,
}));
vi.mock('next/cache', () => ({ revalidatePath: vi.fn() }));
vi.mock('@/actions/email/send-welcome-email', () => ({ sendWelcomeEmail: vi.fn().mockResolvedValue(undefined) }));
vi.mock('@/actions/verification/send-verification', () => ({
  sendEmailVerification: vi.fn().mockResolvedValue(undefined),
  sendPhoneVerification: vi.fn().mockResolvedValue(undefined),
}));
vi.mock('@/actions/residents/validation', () => ({ validateHouseAssignment: vi.fn().mockResolvedValue({ valid: true }) }));
vi.mock('@/lib/residents/find-duplicates', () => ({ loadDuplicateMatches: mocks.loadDuplicateMatches }));
vi.mock('@/actions/residents/assign-house', () => ({ assignHouse: mocks.assignHouse }));

import { createResident } from '@/actions/residents/create-resident';
import type { CreateResidentData } from '@/lib/validators/resident';

const HOUSE_ID = '11111111-1111-4111-8111-111111111111';

const FORM: CreateResidentData = {
  first_name: 'Ubah',
  last_name: 'Karl Chinedu',
  email: '',
  phone_primary: '08030001111',
  resident_type: 'primary',
  house_id: HOUSE_ID,
  resident_role: 'non_resident_landlord',
};

const MATCH = {
  resident_id: 'res-existing',
  resident_code: '576993',
  name: 'Ubah Karl Chinedu',
  account_status: 'active',
  reasons: ['phone', 'name'] as const,
  houses: ['IBB-29B'],
};

const EXISTING_ROW = { id: 'res-existing', first_name: 'Ubah', last_name: 'Karl Chinedu', resident_code: '576993' };

beforeEach(() => {
  vi.clearAllMocks();
  mocks.insertResident.mockReset();
  mocks.authorizePermission.mockResolvedValue({ authorized: true, userId: 'user-1', permissions: [], error: null });
  mocks.loadDuplicateMatches.mockResolvedValue({ matches: [], error: null });
  mocks.assignHouse.mockResolvedValue({ data: { id: 'rh-1' }, error: null });
  mocks.createServerSupabaseClient.mockResolvedValue({
    auth: { getUser: async () => ({ data: { user: { id: 'user-1' } } }) },
    from: (table: string) => {
      if (table === 'residents') {
        return {
          insert: (payload: unknown) => {
            mocks.insertResident(payload);
            return { select: () => ({ single: async () => ({ data: { id: 'res-new', resident_code: '1', first_name: 'Ubah', last_name: 'Karl Chinedu', email: null, phone_primary: '08030001111' }, error: null }) }) };
          },
        };
      }
      return { insert: async () => ({ error: null }) };
    },
  });
  mocks.createAdminClient.mockReturnValue({
    from: () => ({ select: () => ({ eq: () => ({ single: async () => ({ data: EXISTING_ROW, error: null }) }) }) }),
  });
});

describe('createResident duplicate handling (#820)', () => {
  it('returns the matches and inserts nothing when an existing resident matches', async () => {
    mocks.loadDuplicateMatches.mockResolvedValue({ matches: [MATCH], error: null });

    const result = await createResident(FORM);

    expect(result.data).toBeNull();
    expect(result.error).toBeNull();
    expect(result.duplicates).toEqual([MATCH]);
    expect(mocks.insertResident).not.toHaveBeenCalled();
    expect(mocks.assignHouse).not.toHaveBeenCalled();
  });

  it('looks up by the submitted phone, email and name, using company name only for corporate', async () => {
    await createResident({ ...FORM, email: 'a@example.test', phone_secondary: '08099999999', company_name: 'Acme', entity_type: 'individual' });
    expect(mocks.loadDuplicateMatches).toHaveBeenCalledWith({
      first_name: 'Ubah',
      last_name: 'Karl Chinedu',
      email: 'a@example.test',
      phone_primary: '08030001111',
      phone_secondary: '08099999999',
      company_name: null,
    });

    await createResident({ ...FORM, company_name: 'Acme', entity_type: 'corporate' });
    expect(mocks.loadDuplicateMatches).toHaveBeenLastCalledWith(expect.objectContaining({ company_name: 'Acme' }));
  });

  it('inserts normally when nothing matches', async () => {
    const result = await createResident(FORM);

    expect(result.error).toBeNull();
    expect(result.duplicates).toBeUndefined();
    expect(mocks.insertResident).toHaveBeenCalledTimes(1);
  });

  it('links the house to the existing resident and inserts no second resident', async () => {
    mocks.loadDuplicateMatches.mockResolvedValue({ matches: [MATCH], error: null });

    const result = await createResident(FORM, { linkToResidentId: 'res-existing' });

    expect(mocks.assignHouse).toHaveBeenCalledWith('res-existing', {
      house_id: HOUSE_ID,
      resident_role: 'non_resident_landlord',
      move_in_date: undefined,
      sponsor_resident_id: undefined,
    });
    expect(mocks.insertResident).not.toHaveBeenCalled();
    expect(mocks.loadDuplicateMatches).not.toHaveBeenCalled();
    expect(result).toEqual({ data: EXISTING_ROW, error: null });
  });

  it('refuses to link without a house and role', async () => {
    const result = await createResident({ ...FORM, house_id: undefined, resident_role: undefined }, { linkToResidentId: 'res-existing' });

    expect(result.data).toBeNull();
    expect(result.error).toMatch(/house and role/i);
    expect(mocks.assignHouse).not.toHaveBeenCalled();
  });

  it('surfaces an assignHouse failure instead of inserting', async () => {
    mocks.assignHouse.mockResolvedValue({ data: null, error: 'Resident is already assigned to this house' });

    const result = await createResident(FORM, { linkToResidentId: 'res-existing' });

    expect(result).toEqual({ data: null, error: 'Resident is already assigned to this house' });
    expect(mocks.insertResident).not.toHaveBeenCalled();
  });

  it('inserts a new resident on the deliberate "create anyway" path, skipping the lookup', async () => {
    mocks.loadDuplicateMatches.mockResolvedValue({ matches: [MATCH], error: null });

    const result = await createResident(FORM, { createAnyway: true });

    expect(result.error).toBeNull();
    expect(mocks.loadDuplicateMatches).not.toHaveBeenCalled();
    expect(mocks.insertResident).toHaveBeenCalledTimes(1);
  });

  it('fails closed when the roster lookup fails', async () => {
    mocks.loadDuplicateMatches.mockResolvedValue({ matches: [], error: 'db down' });

    const result = await createResident(FORM);

    expect(result.data).toBeNull();
    expect(result.error).toContain('db down');
    expect(mocks.insertResident).not.toHaveBeenCalled();
  });

  it('still requires residents.create before looking anything up', async () => {
    mocks.authorizePermission.mockResolvedValue({ authorized: false, error: 'nope' });

    const result = await createResident(FORM, { linkToResidentId: 'res-existing' });

    expect(result.error).toBe('nope');
    expect(mocks.assignHouse).not.toHaveBeenCalled();
    expect(mocks.loadDuplicateMatches).not.toHaveBeenCalled();
  });
});
