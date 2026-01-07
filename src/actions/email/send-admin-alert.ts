'use server';

import { sendEmail, getEstateEmailSettings } from '@/lib/email/send-email';
import { createAdminClient } from '@/lib/supabase/server';
import { AdminAlertEmail } from '@/emails/admin-alert';

export type AlertSeverity = 'info' | 'warning' | 'critical';

export interface AdminAlertOptions {
    title: string;
    severity: AlertSeverity;
    message: string;
    details?: Record<string, string | number | boolean>;
    actionUrl?: string;
    actionLabel?: string;
}

/**
 * Get admin emails for alerts
 * Returns emails of super_admin, chairman, and financial_officer roles
 */
async function getAdminEmails(): Promise<Array<{ email: string; name: string }>> {
    const supabase = createAdminClient();

    // Get admin role IDs
    const { data: roles } = await supabase
        .from('app_roles')
        .select('id, name')
        .in('name', ['super_admin', 'chairman', 'financial_officer']);

    if (!roles || roles.length === 0) return [];

    const roleIds = roles.map(r => r.id);

    // Get profiles with admin roles
    const { data: profiles } = await supabase
        .from('profiles')
        .select(`
            id,
            email,
            full_name,
            role_id
        `)
        .in('role_id', roleIds);

    if (!profiles) return [];

    return profiles
        .filter(p => p.email)
        .map(p => ({
            email: p.email!,
            name: p.full_name || 'Admin',
        }));
}

/**
 * Send alert email to all admins
 */
export async function sendAdminAlert(options: AdminAlertOptions): Promise<{ success: boolean; error?: string }> {
    try {
        const admins = await getAdminEmails();

        if (admins.length === 0) {
            console.warn('[AdminAlert] No admin emails found, skipping alert');
            return { success: true }; // Don't fail if no admins configured
        }

        const estateSettings = await getEstateEmailSettings();

        const severityEmoji = {
            info: 'ℹ️',
            warning: '⚠️',
            critical: '🚨',
        };

        const result = await sendEmail({
            to: admins.map(admin => ({
                email: admin.email,
                name: admin.name,
            })),
            subject: `${severityEmoji[options.severity]} [${options.severity.toUpperCase()}] ${options.title}`,
            emailType: 'admin_alert',
            react: AdminAlertEmail({
                estateName: estateSettings.estateName,
                title: options.title,
                severity: options.severity,
                message: options.message,
                details: options.details,
                actionUrl: options.actionUrl,
                actionLabel: options.actionLabel,
                timestamp: new Date().toISOString(),
            }),
            metadata: {
                alertType: 'admin_alert',
                severity: options.severity,
                title: options.title,
            },
        });

        return result;
    } catch (error) {
        console.error('[AdminAlert] Failed to send alert:', error);
        return {
            success: false,
            error: error instanceof Error ? error.message : 'Unknown error',
        };
    }
}

/**
 * Send invoice generation failure alert
 */
export async function sendInvoiceGenerationAlert(
    generatedCount: number,
    skippedCount: number,
    errorCount: number,
    errors: string[],
    triggerType: 'manual' | 'cron' | 'api'
): Promise<void> {
    if (errorCount === 0) return; // Only alert on failures

    const severity: AlertSeverity = errorCount > 5 ? 'critical' : 'warning';

    await sendAdminAlert({
        title: 'Invoice Generation Completed with Errors',
        severity,
        message: `The ${triggerType} invoice generation completed but encountered ${errorCount} error${errorCount !== 1 ? 's' : ''}.`,
        details: {
            'Trigger Type': triggerType,
            'Invoices Generated': generatedCount,
            'Houses Skipped': skippedCount,
            'Errors': errorCount,
            'First Error': errors[0] || 'Unknown',
        },
        actionUrl: '/billing',
        actionLabel: 'View Billing Dashboard',
    });
}

/**
 * Send cron job failure alert
 */
export async function sendCronFailureAlert(
    jobName: string,
    errorMessage: string,
    details?: Record<string, string | number | boolean>
): Promise<void> {
    await sendAdminAlert({
        title: `Cron Job Failed: ${jobName}`,
        severity: 'critical',
        message: `The scheduled ${jobName} job failed to execute. Please investigate immediately.`,
        details: {
            'Job Name': jobName,
            'Error': errorMessage,
            'Timestamp': new Date().toISOString(),
            ...details,
        },
        actionUrl: '/settings/system',
        actionLabel: 'View System Settings',
    });
}
