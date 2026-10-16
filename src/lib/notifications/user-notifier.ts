import { createAdminClient } from '@/lib/supabase/server';

export interface UserNotificationParams {
    /** profiles.id of the single recipient. */
    recipientId: string;
    title: string;
    body: string;
    category: 'payment' | 'announcement' | 'security' | 'alert' | 'info' | 'settings' | 'document' | 'resident' | 'house' | 'event' | 'system';
    actionUrl?: string;
    priority?: 'low' | 'normal' | 'high' | 'urgent';
    metadata?: Record<string, unknown>;
}

/**
 * Sends one in-app notification to a single profile. Sibling of notifyAdmins; never throws.
 * Deliberately not a 'use server' module, so it cannot be called from the client.
 */
export async function notifyUser(params: UserNotificationParams): Promise<{ success: boolean; error?: string }> {
    try {
        const adminClient = await createAdminClient();

        const { error: insertError } = await adminClient.from('in_app_notifications').insert({
            recipient_id: params.recipientId,
            title: params.title,
            body: params.body,
            category: params.category,
            action_url: params.actionUrl || null,
            priority: params.priority || 'normal',
            is_read: false,
            metadata: {
                ...params.metadata,
                system_notification: true,
            },
        });

        if (insertError) throw insertError;

        return { success: true };
    } catch (error) {
        console.error(`[notifyUser] Error notifying profile ${params.recipientId}:`, error);
        return { success: false, error: error instanceof Error ? error.message : 'Unknown error' };
    }
}
