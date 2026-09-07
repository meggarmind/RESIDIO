import { beforeEach, describe, expect, it, vi } from 'vitest';

import { generateInvoicesPreview } from '../generate-invoices-preview';
import { authorizePermission } from '@/lib/auth/authorize';
import { getSystemSetting } from '@/lib/settings/get-system-setting';
import { createServerSupabaseClient } from '@/lib/supabase/server';

/**
 * #242 AC4: a period priced by the earliest-version fallback must be visible in
 * the preview -- the run that backfills the estate is authorized off this
 * screen, and the invoice numbers it mints are permanent.
 */

vi.mock('@/lib/supabase/server', () => ({
    createAdminClient: vi.fn(),
    createServerSupabaseClient: vi.fn(),
}));

vi.mock('@/lib/auth/authorize', () => ({
    authorizePermission: vi.fn(),
}));

vi.mock('@/lib/settings/get-system-setting', () => ({
    getSystemSetting: vi.fn(),
}));

interface MockResult { data: unknown; error: unknown }

/** Resolves each `.from(table)` chain from a per-table result, in any call order. */
const createTableMockClient = (tables: Record<string, MockResult>) => ({
    from: vi.fn((table: string) => {
        const result = tables[table] ?? { data: [], error: null };
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const chain: any = {};
        const fluent = vi.fn(() => chain);
        chain.select = fluent;
        chain.eq = fluent;
        chain.in = fluent;
        chain.order = fluent;
        chain.limit = fluent;
        chain.single = vi.fn(async () => result);
        chain.maybeSingle = chain.single;
        chain.then = (onFulfilled: (value: MockResult) => unknown, onRejected?: (reason: unknown) => unknown) =>
            Promise.resolve(result).then(onFulfilled, onRejected);
        return chain;
    }),
});

const authorizeMock = vi.mocked(authorizePermission);
const serverClientMock = vi.mocked(createServerSupabaseClient);
const settingMock = vi.mocked(getSystemSetting);

const houseRow = {
    id: 'house-1',
    house_number: 'A1',
    street_id: 'street-1',
    house_type_id: null,
    billing_profile_id: 'profile-1',
    property_status: 'occupied',
    is_active: true,
    street: { name: 'Palm Avenue' },
    resident_houses: [{
        id: 'link-1',
        resident_id: 'resident-1',
        resident_role: 'tenant',
        move_in_date: null,
        is_active: true,
        resident: { id: 'resident-1', first_name: 'Ada', last_name: 'Obi', resident_code: 'R-001', account_status: 'active' },
    }],
};

const profileRow = {
    id: 'profile-1',
    name: 'Standard 3-Bed Rate',
    target_type: 'house',
    applicable_roles: null,
    is_one_time: false,
};

const versionRow = (effectiveFrom: string) => ({
    id: 'version-1',
    billing_profile_id: 'profile-1',
    effective_from: effectiveFrom,
    billing_profile_version_items: [
        { id: 'item-1', name: 'Security Dues', amount: 10000, frequency: 'monthly', is_mandatory: true },
    ],
});

const mockTables = (effectiveFrom: string) => createTableMockClient({
    houses: { data: [houseRow], error: null },
    billing_profiles: { data: [profileRow], error: null },
    billing_profile_versions: { data: [versionRow(effectiveFrom)], error: null },
    invoices: { data: null, error: null },
    resident_wallets: { data: null, error: null },
});

beforeEach(() => {
    vi.clearAllMocks();
    authorizeMock.mockResolvedValue({
        authorized: true,
        userId: 'user-1',
        roleName: 'super_admin',
        roleId: 'role-1',
        permissions: ['billing.create_invoice'],
        error: null,
    });
    settingMock.mockResolvedValue(null as never);
});

describe('generateInvoicesPreview version fallback warnings', () => {
    it('warns when the requested month is priced by a version that was not yet effective', async () => {
        serverClientMock.mockResolvedValue(mockTables('2026-08-01') as never);

        // May 2026 predates the only version (effective 2026-08-01).
        const result = await generateInvoicesPreview(new Date(2026, 4, 15));

        expect(result.error).toBeNull();
        expect(result.preview).toHaveLength(1);
        expect(result.versionFallbacks).toHaveLength(1);
        expect(result.versionFallbacks[0]).toMatchObject({ house: 'A1', periodStart: '2026-05-01', effectiveFrom: '2026-08-01' });
        expect(result.summary.warnings.some((warning) => /no version was in effect/i.test(warning))).toBe(true);
    });

    it('does not warn when a version is genuinely effective for the month', async () => {
        serverClientMock.mockResolvedValue(mockTables('2026-01-01') as never);

        const result = await generateInvoicesPreview(new Date(2026, 4, 15));

        expect(result.error).toBeNull();
        expect(result.preview).toHaveLength(1);
        expect(result.versionFallbacks).toEqual([]);
        expect(result.summary.warnings.some((warning) => /no version was in effect/i.test(warning))).toBe(false);
    });
});
