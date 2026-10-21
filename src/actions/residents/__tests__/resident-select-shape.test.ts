import { beforeEach, describe, expect, it, vi } from 'vitest';

/**
 * #716, CORE.md section 13 (schema sync, payload symmetry): the reads and writes that feed the resident
 * form must return the stored use_override_comms. The fake database returns only the columns the select
 * string asks for (`*` and an argument-less select() mean all), so a select that drops the column
 * returns a row without it and these tests fail.
 */
const mocks = vi.hoisted(() => ({
  createServerSupabaseClient: vi.fn(),
  authorizePermission: vi.fn(),
  createAdminClient: vi.fn(),
}));

vi.mock('@/lib/supabase/server', () => ({
  createServerSupabaseClient: mocks.createServerSupabaseClient,
  createAdminClient: mocks.createAdminClient,
}));
vi.mock('@/lib/auth/authorize', () => ({ authorizePermission: mocks.authorizePermission }));
vi.mock('@/lib/audit/logger', () => ({ logAudit: vi.fn() }));
vi.mock('next/cache', () => ({ revalidatePath: vi.fn() }));
vi.mock('@/lib/residents/find-duplicates', () => ({ loadDuplicateMatches: async () => ({ matches: [], error: null }) }));
vi.mock('@/actions/email/send-welcome-email', () => ({ sendWelcomeEmail: vi.fn(async () => ({})) }));
vi.mock('@/actions/verification/send-verification', () => ({
  sendEmailVerification: vi.fn(async () => ({})),
  sendPhoneVerification: vi.fn(async () => ({})),
}));
vi.mock('@/actions/residents/validation', () => ({ validateHouseAssignment: vi.fn() }));

import { getResident } from '@/actions/residents/get-resident';
import { updateResident } from '@/actions/residents/update-resident';
import { createResident } from '@/actions/residents/create-resident';
import { PERMISSIONS } from '@/lib/auth/action-roles';

const STORED = {
  id: 'res-1',
  first_name: 'Ada',
  last_name: 'Obi',
  email: 'ada@example.test',
  phone_primary: '08000000000',
  email_verified_at: null,
  phone_verified_at: null,
  resident_code: 'R-1',
  use_override_comms: true,
};

/** Picks the top-level columns named in a select string; `*` or no argument means every column. */
function project(columns?: string): Record<string, unknown> {
  // Drop embedded relations (innermost first) so a `*` inside an embed is not mistaken for a top-level one.
  let flat = columns ?? '';
  while (/\([^()]*\)/.test(flat)) flat = flat.replace(/\([^()]*\)/g, '');
  if (!columns || /(^|[\s,])\*/.test(flat)) return { ...STORED };
  const top = flat.split(',').map((c) => c.trim().split(/\s|:|!/)[0]);
  return Object.fromEntries(top.filter((c) => c in STORED).map((c) => [c, (STORED as Record<string, unknown>)[c]]));
}

/** A client whose reads, update().select() and insert().select() all honour the select string. */
function client() {
  return {
    auth: { getUser: async () => ({ data: { user: { id: 'user-1' } } }) },
    from: () => ({
      select: (columns?: string) => ({
        eq: () => ({ single: async () => ({ data: project(columns), error: null }) }),
      }),
      update: () => ({
        eq: () => ({ select: (columns?: string) => ({ single: async () => ({ data: project(columns), error: null }) }) }),
      }),
      insert: () => ({ select: (columns?: string) => ({ single: async () => ({ data: project(columns), error: null }) }) }),
    }),
  };
}

const FORM = {
  first_name: 'Ada',
  last_name: 'Obi',
  email: 'ada@example.test',
  phone_primary: '08000000000',
  resident_type: 'primary' as const,
};

beforeEach(() => {
  vi.clearAllMocks();
  mocks.createServerSupabaseClient.mockResolvedValue(client());
  mocks.authorizePermission.mockResolvedValue({
    authorized: true,
    userId: 'user-1',
    permissions: [PERMISSIONS.SETTINGS_MANAGE_GENERAL],
    error: null,
  });
  // The flag-only lookup used by updateResident when the field is submitted.
  mocks.createAdminClient.mockReturnValue({
    from: () => ({ select: () => ({ in: async () => ({ data: [{ id: 'res-1', use_override_comms: null }], error: null }) }) }),
  });
});

describe('the selects that feed the resident form return use_override_comms (#716)', () => {
  it('getResident returns the stored value', async () => {
    const result = await getResident('res-1');
    expect(result.data).toHaveProperty('use_override_comms', true);
  });

  it('updateResident returns the same shape as getResident', async () => {
    const result = await updateResident('res-1', FORM);
    expect(result.data).toHaveProperty('use_override_comms', true);
  });

  it('createResident returns the same shape as getResident', async () => {
    const result = await createResident(FORM);
    expect(result.data).toHaveProperty('use_override_comms', true);
  });

  it('the fake database really drops a column a select string leaves out', () => {
    expect(project('id, first_name')).not.toHaveProperty('use_override_comms');
    expect(project('*, resident_houses!resident_id(*)')).toHaveProperty('use_override_comms', true);
    expect(project('id, use_override_comms')).toHaveProperty('use_override_comms', true);
    // A `*` that only appears inside an embedded relation does not select the parent's columns.
    expect(project('id, first_name, house:houses(*, street:streets(*))')).not.toHaveProperty('use_override_comms');
  });
});
