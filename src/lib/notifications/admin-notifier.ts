import { createAdminClient } from '@/lib/supabase/server';
import type { Permission } from '@/lib/auth/action-roles';

interface AdminNotificationParams {
    title: string;
    body: string;
    category: 'payment' | 'announcement' | 'security' | 'alert' | 'info' | 'settings' | 'document' | 'resident' | 'house' | 'event' | 'system';
    actionUrl?: string;
    priority?: 'low' | 'normal' | 'high' | 'urgent';
    metadata?: Record<string, unknown>;
    requiredPermission?: Permission;
    fallbackRoles?: string[];
}

/**
 * Notifies all administrative users who have the required permission or belong to fallback roles.
 */
export async function notifyAdmins(params: AdminNotificationParams): Promise<{ success: boolean; count: number; error?: string }> {
    try {
        const adminClient = await createAdminClient();

        let recipientIds: string[] = [];

        if (params.requiredPermission) {
            // 1. Get permission ID
            const { data: permission } = await adminClient
                .from('app_permissions')
                .select('id')
                .eq('name', params.requiredPermission)
                .single();

            if (permission) {
                // 2. Get role IDs with this permission
                const { data: roles } = await adminClient
                    .from('role_permissions')
                    .select('role_id')
                    .eq('permission_id', permission.id);

                if (roles && roles.length > 0) {
                    // 3. Get profile IDs with these roles
                    const { data: profiles } = await adminClient
                        .from('profiles')
                        .select('id')
                        .in('role_id', roles.map(r => r.role_id));

                    if (profiles) {
                        recipientIds = profiles.map(p => p.id);
                    }
                }
            }
        }

        // Fallback if no specific permission recipients found or if roles provided
        if (recipientIds.length === 0 && params.fallbackRoles) {
            const { data: profiles } = await adminClient
                .from('profiles')
                .select('id')
                .in('role', params.fallbackRoles);

            if (profiles) {
                recipientIds = profiles.map(p => p.id);
            }
        }

        // If still no recipients, default to all 'admin' and 'chairman'
        if (recipientIds.length === 0 && !params.requiredPermission && !params.fallbackRoles) {
            const { data: profiles } = await adminClient
                .from('profiles')
                .select('id')
                .in('role', ['admin', 'chairman']);

            if (profiles) {
                recipientIds = profiles.map(p => p.id);
            }
        }

        // Remove duplicates
        recipientIds = [...new Set(recipientIds)];

        if (recipientIds.length === 0) {
            return { success: true, count: 0 };
        }

        // Create notifications in bulk
        const insertData = recipientIds.map(recipientId => ({
            recipient_id: recipientId,
            title: params.title,
            body: params.body,
            category: params.category,
            action_url: params.actionUrl || null,
            priority: params.priority || 'normal',
            is_read: false,
            metadata: {
                ...params.metadata,
                system_notification: true
            },
        }));

        const { error: insertError } = await adminClient
            .from('in_app_notifications')
            .insert(insertData);

        if (insertError) throw insertError;

        return { success: true, count: recipientIds.length };
    } catch (error) {
        console.error('[notifyAdmins] Error:', error);
        return { success: false, count: 0, error: error instanceof Error ? error.message : 'Unknown error' };
    }
}
