import { beforeEach, describe, expect, it, vi } from 'vitest';

/**
 * #849: changing a resident's phone deactivates the WhatsApp links for the numbers removed from
 * the roster, so the old number's holder stops getting that resident's answers.
 */
const mocks = vi.hoisted(() => ({
  authorizePermission: vi.fn(),
  logAudit: vi.fn(),
  createServerSupabaseClient: vi.fn(),
  createAdminClient: vi.fn(),
  optinUpdate: vi.fn(),
  optinFilters: vi.fn(),
  optinError: null as { message: string } | null,
}));

vi.mock('@/lib/auth/authorize', () => ({ authorizePermission: mocks.authorizePermission }));
vi.mock('@/lib/audit/logger', () => ({ logAudit: mocks.logAudit }));
vi.mock('@/lib/supabase/server', () => ({
  createServerSupabaseClient: mocks.createServerSupabaseClient,
  createAdminClient: mocks.createAdminClient,
}));
vi.mock('next/cache', () => ({ revalidatePath: vi.fn() }));

import { updateResident } from '@/actions/residents/update-resident';
import { PERMISSIONS } from '@/lib/auth/action-roles';
import type { ResidentFormData } from '@/lib/validators/resident';

const CURRENT = {
  email: null,
  phone_primary: '08000000001',
  phone_secondary: '08000000002',
  email_verified_at: null,
  phone_verified_at: null,
  first_name: 'Test',
  last_name: 'Person',
};

const FORM: ResidentFormData = {
  first_name: 'Test',
  last_name: 'Person',
  email: '',
  phone_primary: '08000000001',
  phone_secondary: '08000000002',
  resident_type: 'primary',
};

beforeEach(() => {
  vi.clearAllMocks();
  mocks.optinError = null;
  mocks.authorizePermission.mockResolvedValue({
    authorized: true,
    userId: 'user-1',
    permissions: [PERMISSIONS.RESIDENTS_UPDATE],
    error: null,
  });
  mocks.createServerSupabaseClient.mockResolvedValue({
    from: () => ({
      select: () => ({ eq: () => ({ single: async () => ({ data: CURRENT, error: null }) }) }),
      update: (payload: object) => ({
        eq: () => ({ select: () => ({ single: async () => ({ data: { id: 'res-1', ...payload }, error: null }) }) }),
      }),
    }),
  });
  mocks.createAdminClient.mockReturnValue({
    from: (table: string) => ({
      update: (values: unknown) => {
        mocks.optinUpdate(table, values);
        const filters: unknown[] = [];
        const chain = {
          eq: (...args: unknown[]) => (filters.push(['eq', ...args]), chain),
          in: (...args: unknown[]) => (filters.push(['in', ...args]), chain),
          is: async (...args: unknown[]) => {
            filters.push(['is', ...args]);
            mocks.optinFilters(filters);
            return { error: mocks.optinError };
          },
        };
        return chain;
      },
    }),
  });
});

describe('updateResident: WhatsApp links on a phone change (#849)', () => {
  it('deactivates the links for the removed number only, for this resident', async () => {
    const result = await updateResident('res-1', { ...FORM, phone_primary: '08000000009' });

    expect(result.error).toBeNull();
    expect(mocks.optinUpdate).toHaveBeenCalledWith('whatsapp_optins', { deactivated_at: expect.any(String), link_verified_at: null });
    expect(mocks.optinFilters).toHaveBeenCalledWith([
      ['eq', 'resident_id', 'res-1'],
      ['in', 'phone_number', ['+2348000000001']],
      ['is', 'deactivated_at', null],
    ]);
    expect(mocks.logAudit.mock.calls[0][0].newValues).toMatchObject({
      whatsapp_links_deactivated_for: ['+2348000000001'],
    });
  });

  it('deactivates a removed secondary number', async () => {
    await updateResident('res-1', { ...FORM, phone_secondary: '' });

    expect(mocks.optinFilters.mock.calls[0][0][1]).toEqual(['in', 'phone_number', ['+2348000000002']]);
  });

  it('keeps the links when a number only moves between primary and secondary', async () => {
    await updateResident('res-1', { ...FORM, phone_primary: '08000000002', phone_secondary: '+234 800 000 0001' });

    expect(mocks.optinUpdate).not.toHaveBeenCalled();
    expect(mocks.logAudit.mock.calls[0][0].newValues).not.toHaveProperty('whatsapp_links_deactivated_for');
  });

  it('still saves the resident, and audits the failed deactivation, when the deactivation fails', async () => {
    mocks.optinError = { message: 'db down' };
    const consoleError = vi.spyOn(console, 'error').mockImplementation(() => {});

    const result = await updateResident('res-1', { ...FORM, phone_primary: '08000000009' });

    expect(result.error).toBeNull();
    expect(consoleError).toHaveBeenCalled();
    expect(mocks.logAudit.mock.calls[0][0].newValues).not.toHaveProperty('whatsapp_links_deactivated_for');
    expect(mocks.logAudit.mock.calls[0][0].newValues).toMatchObject({
      whatsapp_links_deactivation_failed_for: ['+2348000000001'],
    });
    consoleError.mockRestore();
  });
});
