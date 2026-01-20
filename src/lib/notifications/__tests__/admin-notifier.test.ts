import { describe, it, expect, vi, beforeEach } from 'vitest';
import { notifyAdmins } from '../admin-notifier';
import { createAdminClient } from '@/lib/supabase/server';

// Mock dependencies
vi.mock('@/lib/supabase/server', () => ({
    createAdminClient: vi.fn(),
}));

describe('Admin Notifier Utility', () => {
    let mockSupabase: any;

    const createMockQuery = (data: any = [], error: any = null) => {
        const query: any = {
            data,
            error,
            select: vi.fn().mockReturnThis(),
            eq: vi.fn().mockReturnThis(),
            in: vi.fn().mockReturnThis(),
            insert: vi.fn().mockReturnThis(),
            single: vi.fn().mockReturnThis(),
            maybeSingle: vi.fn().mockReturnThis(),
            then: vi.fn((onFulfilled) => onFulfilled({ data, error })),
        };
        return query;
    };

    beforeEach(() => {
        vi.clearAllMocks();
        mockSupabase = {
            from: vi.fn().mockImplementation(() => createMockQuery()),
        };
        (createAdminClient as any).mockResolvedValue(mockSupabase);
    });

    it('should notify admins by role if no permission is provided', async () => {
        const mockProfiles = [{ id: 'admin1' }, { id: 'admin2' }];

        mockSupabase.from.mockImplementation((table: string) => {
            if (table === 'profiles') {
                return createMockQuery(mockProfiles);
            }
            return createMockQuery();
        });

        const result = await notifyAdmins({
            title: 'Test Title',
            body: 'Test Body',
            category: 'system',
        });

        expect(result.success).toBe(true);
        expect(result.count).toBe(2);
        expect(mockSupabase.from).toHaveBeenCalledWith('in_app_notifications');
        expect(mockSupabase.from).toHaveBeenCalledWith('profiles');
    });

    it('should notify admins based on permission', async () => {
        const mockPermission = { id: 'perm123' };
        const mockRoles = [{ role_id: 'role1' }];
        const mockProfiles = [{ id: 'user1' }];

        mockSupabase.from.mockImplementation((table: string) => {
            if (table === 'app_permissions') {
                return createMockQuery(mockPermission);
            }
            if (table === 'role_permissions') {
                return createMockQuery(mockRoles);
            }
            if (table === 'profiles') {
                return createMockQuery(mockProfiles);
            }
            return createMockQuery();
        });

        const result = await notifyAdmins({
            title: 'Permission Test',
            body: 'Body',
            category: 'payment',
            requiredPermission: 'email_imports.process' as any,
        });

        expect(result.success).toBe(true);
        expect(result.count).toBe(1);
    });

    it('should handle no recipients gracefully', async () => {
        mockSupabase.from.mockImplementation((table: string) => {
            return createMockQuery([]);
        });

        const result = await notifyAdmins({
            title: 'Nobody',
            body: 'Empty',
            category: 'info',
        });

        expect(result.success).toBe(true);
        expect(result.count).toBe(0);
    });
});
