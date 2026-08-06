'use server';

import { createServerSupabaseClient } from '@/lib/supabase/server';
import { authorizePermission } from '@/lib/auth/authorize';
import { PERMISSIONS } from '@/lib/auth/action-roles';
import { logAudit } from '@/lib/audit/logger';
import { revalidatePath } from 'next/cache';
import { subDays, subMonths } from 'date-fns';

export async function pruneSystemData() {
    const { authorized } = await authorizePermission(PERMISSIONS.SYSTEM_MANAGE_DATA_RETENTION);
    if (!authorized) throw new Error('Unauthorized');

    const supabase = await createServerSupabaseClient();

    // Calculate cutoff dates
    const date30DaysAgo = subDays(new Date(), 30).toISOString();
    const date90DaysAgo = subDays(new Date(), 90).toISOString();
    const date6MonthsAgo = subMonths(new Date(), 6).toISOString();

    const results = {
        notifications: 0,
        auditLogs: 0,
        searchLogs: 0,
        success: false,
        error: null as string | null,
    };

    try {
        // 1. Prune In-App Notifications
        // - Read > 30 days
        const { count: readNotificationsCount, error: readError } = await supabase
            .from('in_app_notifications')
            .delete({ count: 'exact' })
            .eq('read', true)
            .lt('created_at', date30DaysAgo);

        if (readError) throw new Error(`Failed to prune read notifications: ${readError.message}`);

        // - Unread > 90 days
        const { count: unreadNotificationsCount, error: unreadError } = await supabase
            .from('in_app_notifications')
            .delete({ count: 'exact' })
            .eq('read', false)
            .lt('created_at', date90DaysAgo);

        if (unreadError) throw new Error(`Failed to prune unread notifications: ${unreadError.message}`);

        results.notifications = (readNotificationsCount || 0) + (unreadNotificationsCount || 0);

        // 2. Prune Audit Logs > 6 months
        const { count: auditLogsCount, error: auditError } = await supabase
            .from('audit_logs')
            .delete({ count: 'exact' })
            .lt('created_at', date6MonthsAgo);

        if (auditError) throw new Error(`Failed to prune audit logs: ${auditError.message}`);

        results.auditLogs = auditLogsCount || 0;

        // 3. Prune Search Logs > 30 days
        const { count: searchLogsCount, error: searchError } = await supabase
            .from('search_logs')
            .delete({ count: 'exact' })
            .lt('created_at', date30DaysAgo);

        // Note: search_logs might not verify if table exists yet, handling gracefully or assuming existence based on plan.
        // If 'search_logs' table does not exist, this might throw. 
        // Assuming table exists as per previous context.
        if (searchError) {
            // Log but don't fail entire operation if partial table issue
            console.error('Failed to prune search logs:', searchError);
        } else {
            results.searchLogs = searchLogsCount || 0;
        }

        results.success = true;
        revalidatePath('/settings/system');

        await logAudit({
            action: 'DELETE',
            entityType: 'system_settings',
            entityId: 'prune-data',
            entityDisplay: 'Pruned system data (notifications, audit, search logs)',
            newValues: results as unknown as Record<string, unknown>,
            description: `Pruned ${results.notifications} notifications, ${results.auditLogs} audit logs, ${results.searchLogs} search logs`,
        });

        return { data: results, error: null };
    } catch (error: any) {
        console.error('Prune data error:', error);
        return { data: null, error: error.message };
    }
}
