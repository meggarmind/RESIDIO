'use server';

import { createServerSupabaseClient, createAdminClient } from '@/lib/supabase/server';
import { authorizePermission } from '@/lib/auth/authorize';
import { PERMISSIONS } from '@/lib/auth/action-roles';
import { logAudit } from '@/lib/audit/logger';
import { revalidatePath } from 'next/cache';
import { subDays } from 'date-fns';
import { readSetting } from '@/lib/settings/service';
import {
    AUDIT_LOG_RETENTION_DEFAULT_DAYS,
    AUDIT_LOG_RETENTION_KEY,
    AUDIT_LOG_RETENTION_MAX_DAYS,
    AUDIT_LOG_RETENTION_MIN_DAYS,
    isValidAuditLogRetentionDays,
} from '@/lib/validators/setting-value';

type ServerClient = Awaited<ReturnType<typeof createServerSupabaseClient>>;

/**
 * The ages pruneSystemData deletes by. Audit logs go by the saved audit_log_retention_days
 * setting (#815), 365 when it was never saved; an unreadable or out-of-range value is an error,
 * so nothing is deleted rather than the audit trail being cut by a bad value.
 */
async function pruneCutoffs(supabase: ServerClient) {
    const setting = await readSetting(supabase, AUDIT_LOG_RETENTION_KEY);
    if (setting.status === 'error') {
        return { cutoffs: null, error: `Failed to read the audit log retention setting: ${setting.message}` };
    }
    const auditLogRetentionDays = setting.status === 'absent' ? AUDIT_LOG_RETENTION_DEFAULT_DAYS : setting.value;
    if (!isValidAuditLogRetentionDays(auditLogRetentionDays)) {
        return {
            cutoffs: null,
            error: `Audit log retention must be a whole number of days from ${AUDIT_LOG_RETENTION_MIN_DAYS} to ${AUDIT_LOG_RETENTION_MAX_DAYS}; it is ${JSON.stringify(auditLogRetentionDays)}. Nothing was deleted.`,
        };
    }
    const now = new Date();
    return {
        cutoffs: {
            date30DaysAgo: subDays(now, 30).toISOString(),
            date90DaysAgo: subDays(now, 90).toISOString(),
            auditLogCutoff: subDays(now, auditLogRetentionDays).toISOString(),
            auditLogRetentionDays,
        },
        error: null,
    };
}

/**
 * Counts what pruneSystemData would delete right now, for its confirmation dialog (#790).
 * Reads only, with the same filters and clients as the delete.
 */
export async function previewPruneSystemData() {
    const { authorized, error: authError } = await authorizePermission(PERMISSIONS.SYSTEM_MANAGE_DATA_RETENTION);
    if (!authorized) return { data: null, error: authError || 'Unauthorized' };

    const supabase = await createServerSupabaseClient();
    const { cutoffs, error: cutoffError } = await pruneCutoffs(supabase);
    if (!cutoffs) return { data: null, error: cutoffError };
    const { date30DaysAgo, date90DaysAgo, auditLogCutoff, auditLogRetentionDays } = cutoffs;
    type UntypedCount = {
        from: (table: string) => {
            select: (columns: string, opts: { count: 'exact'; head: true }) => {
                lt: (column: string, value: string) => PromiseLike<{ count: number | null; error: { message: string } | null }>;
            };
        };
    };

    const [readNotifications, unreadNotifications, auditLogs, searchLogs, systemActionLogs] = await Promise.all([
        supabase.from('in_app_notifications').select('id', { count: 'exact', head: true }).eq('is_read', true).lt('created_at', date30DaysAgo),
        supabase.from('in_app_notifications').select('id', { count: 'exact', head: true }).eq('is_read', false).lt('created_at', date90DaysAgo),
        // Counted with the admin client the delete uses, so the preview matches what is deleted.
        createAdminClient().from('audit_logs').select('id', { count: 'exact', head: true }).lt('created_at', auditLogCutoff),
        supabase.from('search_logs').select('id', { count: 'exact', head: true }).lt('created_at', date30DaysAgo),
        (createAdminClient() as unknown as UntypedCount).from('system_action_log').select('id', { count: 'exact', head: true }).lt('occurred_at', date90DaysAgo),
    ]);

    // search_logs is optional in pruneSystemData too, so its error is not fatal here.
    const failed = [readNotifications, unreadNotifications, auditLogs, systemActionLogs].find((r) => r.error);
    if (failed?.error) return { data: null, error: failed.error.message };

    return {
        data: {
            notifications: (readNotifications.count || 0) + (unreadNotifications.count || 0),
            auditLogs: auditLogs.count || 0,
            auditLogRetentionDays,
            searchLogs: searchLogs.error ? 0 : searchLogs.count || 0,
            systemActionLogs: systemActionLogs.count || 0,
        },
        error: null,
    };
}

export async function pruneSystemData() {
    const { authorized } = await authorizePermission(PERMISSIONS.SYSTEM_MANAGE_DATA_RETENTION);
    if (!authorized) throw new Error('Unauthorized');

    const supabase = await createServerSupabaseClient();

    const { cutoffs, error: cutoffError } = await pruneCutoffs(supabase);
    if (!cutoffs) return { data: null, error: cutoffError };
    const { date30DaysAgo, date90DaysAgo, auditLogCutoff, auditLogRetentionDays } = cutoffs;

    const results = {
        notifications: 0,
        auditLogs: 0,
        auditLogRetentionDays,
        searchLogs: 0,
        systemActionLogs: 0,
        success: false,
        error: null as string | null,
    };

    try {
        // 1. Prune In-App Notifications
        // - Read > 30 days
        const { count: readNotificationsCount, error: readError } = await supabase
            .from('in_app_notifications')
            .delete({ count: 'exact' })
            .eq('is_read', true)
            .lt('created_at', date30DaysAgo);

        if (readError) throw new Error(`Failed to prune read notifications: ${readError.message}`);

        // - Unread > 90 days
        const { count: unreadNotificationsCount, error: unreadError } = await supabase
            .from('in_app_notifications')
            .delete({ count: 'exact' })
            .eq('is_read', false)
            .lt('created_at', date90DaysAgo);

        if (unreadError) throw new Error(`Failed to prune unread notifications: ${unreadError.message}`);

        results.notifications = (readNotificationsCount || 0) + (unreadNotificationsCount || 0);

        // 2. Prune Audit Logs older than the retention setting (#815). audit_logs has no DELETE
        // policy (immutable to users), so a user-scoped delete matches nothing: use the admin client.
        const { count: auditLogsCount, error: auditError } = await createAdminClient()
            .from('audit_logs')
            .delete({ count: 'exact' })
            .lt('created_at', auditLogCutoff);

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

        // 4. Prune System Action Log > 90 days (#538). The table grants no DELETE to
        // authenticated users (service-role write only), so this uses the admin client. The table
        // is not in database.generated.ts yet, hence the cast (as in src/actions/system/action-log.ts).
        type UntypedDelete = {
            from: (table: string) => {
                delete: (opts: { count: 'exact' }) => {
                    lt: (column: string, value: string) => PromiseLike<{ count: number | null; error: { message: string } | null }>;
                };
            };
        };
        const { count: systemActionLogsCount, error: systemActionLogError } = await (createAdminClient() as unknown as UntypedDelete)
            .from('system_action_log')
            .delete({ count: 'exact' })
            .lt('occurred_at', date90DaysAgo);

        if (systemActionLogError) throw new Error(`Failed to prune system action log: ${systemActionLogError.message}`);

        results.systemActionLogs = systemActionLogsCount || 0;

        results.success = true;
        revalidatePath('/settings/data-retention');

        // Nothing pruned means nothing changed, so nothing to audit. The prune touches no single
        // row, so a fresh run uuid identifies this run (audit_logs.entity_id is a uuid) (#594).
        if (results.notifications + results.auditLogs + results.searchLogs + results.systemActionLogs > 0) {
            await logAudit({
                action: 'DELETE',
                entityType: 'system_settings',
                entityId: globalThis.crypto.randomUUID(),
                entityDisplay: 'Pruned system data (notifications, audit, search, system action logs)',
                newValues: { ...results, batch: 'prune-data' } as unknown as Record<string, unknown>,
                description: `Pruned ${results.notifications} notifications, ${results.auditLogs} audit logs, ${results.searchLogs} search logs, ${results.systemActionLogs} system action log entries`,
            });
        }

        return { data: results, error: null };
    } catch (error) {
        console.error('Prune data error:', error);
        return { data: null, error: error instanceof Error ? error.message : String(error) };
    }
}
