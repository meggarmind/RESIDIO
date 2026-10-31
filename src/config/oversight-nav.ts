import { Activity, BarChart3, LayoutDashboard, MessageSquare } from 'lucide-react';
import { PERMISSIONS } from '@/lib/auth/action-roles';
import type { SettingsGroup } from '@/config/settings-nav';

/**
 * The Oversight left menu (#1272): reports and live system state, the pages that show
 * rather than change. Same shape as `settingsConfig`, so `activeSettingsHref` and
 * `flattenSettingsNav` work on it unchanged. Web addresses are the old ones (owner decision,
 * #1270); only the menu is new.
 *
 * Generate reports is not here: it has its own Reports entry in the main menu (#1373).
 *
 * Each entry's permissions are its route guard in `ROUTE_PERMISSIONS`, so the menu never
 * links a page the middleware would bounce (`oversight-nav-coverage.test.ts`).
 */
export const oversightConfig: SettingsGroup[] = [
    {
        // Pages that show live charts and counts; Reports below holds the report page (owner, 30 Oct 2026, #1347).
        title: 'Dashboard',
        icon: LayoutDashboard,
        items: [
            {
                title: 'Oversight overview',
                href: '/system',
                description: 'Is anything wrong? Scheduled jobs, message queue, audit activity and account approvals at a glance',
                permissions: [PERMISSIONS.SYSTEM_VIEW_ALL_SETTINGS],
            },
            {
                title: 'Collections dashboard',
                href: '/analytics',
                description: 'Revenue, collections, invoices, debt status by street and estate portfolio health',
                permissions: [
                    PERMISSIONS.REPORTS_VIEW_FINANCIAL,
                    PERMISSIONS.REPORTS_VIEW_OCCUPANCY,
                    PERMISSIONS.REPORTS_VIEW_SECURITY,
                ],
            },
            {
                // The middleware guards this under /analytics, so it takes that guard's permissions;
                // the page itself also asks for ANNOUNCEMENTS_VIEW.
                title: 'Announcement engagement',
                href: '/analytics/announcements',
                description: 'Who opened and read announcements',
                permissions: [
                    PERMISSIONS.REPORTS_VIEW_FINANCIAL,
                    PERMISSIONS.REPORTS_VIEW_OCCUPANCY,
                    PERMISSIONS.REPORTS_VIEW_SECURITY,
                ],
            },
        ],
    },
    {
        title: 'Reports',
        icon: BarChart3,
        items: [
            {
                title: 'Income & expenses',
                href: '/reports/financial-overview',
                description: 'Income and expenses by category, from imported bank statements',
                permissions: [PERMISSIONS.REPORTS_VIEW_FINANCIAL],
            },
        ],
    },
    {
        title: 'Messages',
        icon: MessageSquare,
        items: [
            {
                title: 'Notification queue',
                href: '/system/notification-queue',
                description: 'Messages waiting to be sent',
                permissions: [PERMISSIONS.NOTIFICATIONS_MANAGE],
            },
            {
                title: 'Notification history',
                href: '/system/notification-history',
                description: 'Messages already sent',
                permissions: [PERMISSIONS.NOTIFICATIONS_MANAGE],
            },
            {
                title: 'WhatsApp activity',
                href: '/system/whatsapp-monitoring',
                description: 'WhatsApp sends, opt-ins, sessions and disclosures',
                permissions: [PERMISSIONS.WHATSAPP_VIEW],
            },
            {
                title: 'WhatsApp bot health',
                href: '/system/whatsapp-bot-health',
                description: 'Bot counts today, resident feedback, undelivered messages and statements waiting for an email',
                permissions: [PERMISSIONS.WHATSAPP_VIEW],
            },
        ],
    },
    {
        title: 'System',
        icon: Activity,
        items: [
            {
                title: 'Scheduled jobs',
                href: '/system/cron-status',
                description: 'Whether the scheduled jobs are running',
                permissions: [PERMISSIONS.SYSTEM_MONITOR],
            },
            {
                title: 'Audit logs',
                href: '/system/audit-logs',
                description: 'Who changed what, and when',
                permissions: [PERMISSIONS.SETTINGS_VIEW_AUDIT_LOGS],
            },
            {
                title: 'Action log',
                href: '/system/action-log',
                description: 'What scheduled jobs and webhooks did',
                permissions: [PERMISSIONS.SYSTEM_VIEW_SYSTEM_LOG],
            },
        ],
    },
];
