import { NextRequest } from 'next/server';
import { beforeEach, describe, expect, it, vi } from 'vitest';

/**
 * Maintenance mode must engage when it is turned on from the settings UI (#808).
 *
 * updateMaintenanceMode writes through updateSetting, which stores booleans as
 * the strings 'true' / 'false'. The middleware used to check `value === true`,
 * so a switch flipped in the UI never locked anyone out. This test runs the real
 * action and the real middleware against one shared in-memory system_settings
 * row, so it fails if the writer and the reader ever disagree again.
 */

const state = vi.hoisted(() => ({
    settings: {} as Record<string, { id: string; key: string; value: unknown }>,
    roleName: 'manager',
}));

/** The system_settings slice both clients share: select/update by key. */
function settingsTable() {
    let key = '';
    let patch: { value: unknown } | null = null;
    const builder = {
        select: () => builder,
        update: (values: { value: unknown }) => {
            patch = values;
            return builder;
        },
        eq: (_column: string, value: string) => {
            key = value;
            return builder;
        },
        in: async (_column: string, keys: string[]) => ({
            data: keys.flatMap((k) => (state.settings[k] ? [{ ...state.settings[k] }] : [])),
            error: null,
        }),
        single: async () => {
            const row = state.settings[key];
            if (!row) return { data: null, error: { code: 'PGRST116' } };
            if (patch) row.value = patch.value;
            return { data: { ...row }, error: null };
        },
    };
    return builder;
}

vi.mock('@/lib/supabase/server', () => ({
    createServerSupabaseClient: async () => ({
        auth: { getUser: async () => ({ data: { user: { id: 'admin-1' } } }) },
        from: () => settingsTable(),
    }),
}));

vi.mock('@supabase/ssr', () => ({
    createServerClient: () => ({
        auth: {
            getUser: async () => ({ data: { user: { id: 'user-1' } }, error: null }),
            signOut: async () => ({ error: null }),
        },
        rpc: async () => ({
            data: [{ role_id: 'role-1', role_name: state.roleName, permission_name: 'view_dashboard' }],
            error: null,
        }),
        from: (table: string) => {
            if (table === 'system_settings') return settingsTable();
            const builder = {
                select: () => builder,
                eq: () => builder,
                single: async () => ({
                    data: {
                        role_id: 'role-1',
                        resident_id: null,
                        approval_status: 'active',
                        app_roles: { name: state.roleName, category: 'admin' },
                    },
                    error: null,
                }),
            };
            return builder;
        },
    }),
}));

vi.mock('@/lib/auth/authorize', () => ({
    authorizePermission: async () => ({ authorized: true, roleName: 'super_admin' }),
}));
vi.mock('@/lib/audit/logger', () => ({ logAudit: async () => {} }));
vi.mock('next/cache', () => ({ revalidatePath: () => {} }));

const { updateMaintenanceMode } = await import('@/actions/settings/update-maintenance-mode');
const { middleware } = await import('@/middleware');

const request = (pathname: string) => new NextRequest(new URL(`http://localhost:3000${pathname}`));

function redirectsToMaintenance(response: Response): boolean {
    const location = response.headers.get('location');
    return !!location && new URL(location).pathname === '/maintenance';
}

describe('maintenance mode set from the settings action (#808)', () => {
    beforeEach(() => {
        state.settings = { maintenance_mode: { id: 'setting-1', key: 'maintenance_mode', value: false } };
        state.roleName = 'manager';
    });

    it('locks a non-super-admin out once turned on', async () => {
        expect(redirectsToMaintenance(await middleware(request('/dashboard')))).toBe(false);

        expect(await updateMaintenanceMode(true)).toEqual({ success: true });

        expect(redirectsToMaintenance(await middleware(request('/dashboard')))).toBe(true);
    });

    it('lets the user back in once turned off again', async () => {
        await updateMaintenanceMode(true);
        await updateMaintenanceMode(false);

        expect(redirectsToMaintenance(await middleware(request('/dashboard')))).toBe(false);
    });

    it('still honours a row that holds a real boolean', async () => {
        state.settings.maintenance_mode.value = true;
        expect(redirectsToMaintenance(await middleware(request('/dashboard')))).toBe(true);
    });

    it('does not lock out a super admin', async () => {
        state.roleName = 'super_admin';
        await updateMaintenanceMode(true);
        expect(redirectsToMaintenance(await middleware(request('/dashboard')))).toBe(false);
    });
});

describe('admin banner state cookie (#789)', () => {
    const opsCookie = (response: Response) =>
        (response as import('next/server').NextResponse).cookies.get('residio_ops_status')?.value;

    beforeEach(() => {
        state.settings = { maintenance_mode: { id: 'setting-1', key: 'maintenance_mode', value: false } };
        state.roleName = 'super_admin';
    });

    it('carries maintenance mode from the same settings read the lockout uses', async () => {
        expect(opsCookie(await middleware(request('/dashboard')))?.[0]).toBe('0');
        await updateMaintenanceMode(true);
        expect(opsCookie(await middleware(request('/dashboard')))?.[0]).toBe('1');
    });

    it('carries the override switch read in that same query', async () => {
        state.settings.comms_override_enabled = { id: 'setting-2', key: 'comms_override_enabled', value: 'true' };
        expect(opsCookie(await middleware(request('/dashboard')))?.[1]).toBe('1');
    });

    it('does not rewrite a cookie that already matches', async () => {
        const first = opsCookie(await middleware(request('/dashboard')));
        const again = new NextRequest(new URL('http://localhost:3000/dashboard'), {
            headers: { cookie: `residio_ops_status=${first}` },
        });
        expect(opsCookie(await middleware(again))).toBeUndefined();
    });
});

