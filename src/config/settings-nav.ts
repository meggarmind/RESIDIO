import {
    Settings,
    Shield,
    CreditCard,
    Mail,
    Home,
    Activity,
    LucideIcon
} from 'lucide-react';
import { PERMISSIONS, type Permission } from '@/lib/auth/action-roles';

export type SettingsItem = {
    title: string;
    href: string;
    description?: string;
    /**
     * Permissions that reveal this entry; holding any one is enough, matching
     * how `ROUTE_PERMISSIONS` is evaluated in middleware. Omitted means visible
     * to anyone who can see Settings at all.
     *
     * Without this the sidebar linked every admin to every settings page and
     * left the middleware to bounce them, which reads as a broken app rather
     * than as a permission boundary.
     */
    permissions?: Permission[];
    children?: SettingsItem[];
};

export type SettingsGroup = {
    title: string;
    icon: LucideIcon;
    permissions?: Permission[];
    items: SettingsItem[];
};

export const settingsConfig: SettingsGroup[] = [
    {
        title: "General & Preferences",
        icon: Settings,
        items: [
            {
                title: "General",
                href: "/settings",
                children: [
                    { title: "Overview", href: "/settings", description: "Estate information and basics", permissions: [PERMISSIONS.SETTINGS_VIEW] },
                    { title: "Estate Info", href: "/settings/estate-info", description: "Name, address, contact details", permissions: [PERMISSIONS.SETTINGS_MANAGE_GENERAL] },
                    { title: "Branding", href: "/settings/branding", description: "Logo and visual identity", permissions: [PERMISSIONS.SETTINGS_MANAGE_GENERAL] },
                    { title: "Data Management", href: "/settings/data-management", description: "Administrative data tools", permissions: [PERMISSIONS.SETTINGS_MANAGE_GENERAL] },
                ]
            },
            { title: "Appearance", href: "/settings/appearance", description: "Theme and display settings", permissions: [PERMISSIONS.SETTINGS_MANAGE_GENERAL] },
            {
                title: "Notifications",
                href: "/settings/notifications",
                permissions: [PERMISSIONS.NOTIFICATIONS_MANAGE],
                children: [
                    { title: "Overview", href: "/settings/notifications", description: "Notification dashboard", permissions: [PERMISSIONS.NOTIFICATIONS_MANAGE] },
                    { title: "Reminders", href: "/settings/notifications/reminders", description: "Invoice payment reminders", permissions: [PERMISSIONS.NOTIFICATIONS_MANAGE] },
                    { title: "Reminder Schedule", href: "/settings/notifications/reminders/schedule", description: "Configure reminder escalation", permissions: [PERMISSIONS.NOTIFICATIONS_MANAGE] },
                    { title: "Templates", href: "/settings/notifications/templates", description: "Message templates", permissions: [PERMISSIONS.NOTIFICATIONS_MANAGE] },
                    { title: "Schedules", href: "/settings/notifications/schedules", description: "Notification schedules", permissions: [PERMISSIONS.NOTIFICATIONS_MANAGE] },
                    // History moved to /system/notification-history (ADR-0004): it shows
                    // sent-notification state, not configuration.
                ]
            },
            { title: "WhatsApp Operations", href: "/settings/whatsapp", description: "Review consent and pending contacts", permissions: [PERMISSIONS.WHATSAPP_VIEW] },
        ]
    },
    {
        title: "Estate Configuration",
        icon: Home,
        items: [
            { title: "Streets", href: "/settings/streets", description: "Manage estate streets", permissions: [PERMISSIONS.SETTINGS_MANAGE_REFERENCE] },
            { title: "House Types", href: "/settings/house-types", description: "Define property types", permissions: [PERMISSIONS.SETTINGS_MANAGE_REFERENCE] },
            { title: "Document Categories", href: "/settings/document-categories", description: "Organize document types", permissions: [PERMISSIONS.DOCUMENTS_MANAGE_CATEGORIES] },
            { title: "Transaction Tags", href: "/settings/transaction-tags", description: "Financial categorization", permissions: [PERMISSIONS.SETTINGS_MANAGE_REFERENCE] },
        ]
    },
    {
        title: "Access & Security",
        icon: Shield,
        items: [
            { title: "Roles & Permissions", href: "/settings/roles", description: "Create roles and choose what each can do", permissions: [PERMISSIONS.SYSTEM_MANAGE_ROLES, PERMISSIONS.SYSTEM_ASSIGN_ROLES] },
            {
                title: "Security",
                href: "/settings/security",
                permissions: [PERMISSIONS.SETTINGS_MANAGE_SECURITY, PERMISSIONS.SECURITY_MANAGE_CATEGORIES],
                children: [
                    // Titled "Security Settings" rather than "General" so it does not
                    // read as a second copy of the General & Preferences group.
                    { title: "Security Settings", href: "/settings/security", description: "Security protocols and limits", permissions: [PERMISSIONS.SETTINGS_MANAGE_SECURITY] },
                    { title: "Contact Categories", href: "/settings/security/categories", description: "Validity periods and requirements", permissions: [PERMISSIONS.SECURITY_MANAGE_CATEGORIES] },
                ]
            },
        ]
    },
    {
        title: "Billing & Finance",
        icon: CreditCard,
        items: [
            {
                title: "Billing",
                href: "/settings/billing",
                permissions: [PERMISSIONS.SETTINGS_MANAGE_BILLING, PERMISSIONS.BILLING_MANAGE_PROFILES],
                children: [
                    { title: "Billing Settings", href: "/settings/billing", description: "General billing configuration", permissions: [PERMISSIONS.SETTINGS_MANAGE_BILLING] },
                    { title: "Late Fees", href: "/settings/billing/late-fees", description: "Late fee rules and waivers", permissions: [PERMISSIONS.SETTINGS_MANAGE_BILLING] },
                    { title: "Invoice Generation", href: "/settings/billing/invoices", description: "Automated invoice settings", permissions: [PERMISSIONS.SETTINGS_MANAGE_BILLING] },
                    { title: "Development Levies", href: "/settings/billing/development-levies", description: "Development levy profiles", permissions: [PERMISSIONS.SETTINGS_MANAGE_BILLING] },
                    { title: "Billing Profiles", href: "/settings/billing/profiles", description: "Rate cards and pricing", permissions: [PERMISSIONS.BILLING_MANAGE_PROFILES] },
                ]
            },
            { title: "Bank Accounts", href: "/settings/bank-accounts", description: "Estate bank accounts", permissions: [PERMISSIONS.SETTINGS_MANAGE_REFERENCE] },
            {
                title: "Import Integration",
                href: "/settings/email-integration",
                permissions: [PERMISSIONS.EMAIL_IMPORTS_VIEW],
                children: [
                    { title: "Connection", href: "/settings/email-integration", description: "Gmail connection status", permissions: [PERMISSIONS.EMAIL_IMPORTS_VIEW] },
                    { title: "Import Configuration", href: "/settings/email-integration/config", description: "Email import rules", permissions: [PERMISSIONS.EMAIL_IMPORTS_CONFIGURE] },
                ]
            },
        ]
    },
    {
        title: "Communications",
        icon: Mail,
        items: [
            {
                title: "Email",
                href: "/settings/email",
                permissions: [PERMISSIONS.SETTINGS_MANAGE_GENERAL],
                children: [
                    { title: "Configuration", href: "/settings/email", description: "Email notification settings", permissions: [PERMISSIONS.SETTINGS_MANAGE_GENERAL] },
                    { title: "Debug & Testing", href: "/settings/email/debug", description: "Debug mode and test tools", permissions: [PERMISSIONS.SETTINGS_MANAGE_GENERAL] },
                ]
            },
            { title: "Message Templates", href: "/settings/message-templates", description: "Pre-written messages", permissions: [PERMISSIONS.ANNOUNCEMENTS_MANAGE_TEMPLATES] },
            { title: "Announcement Categories", href: "/settings/announcement-categories", description: "Organize announcements", permissions: [PERMISSIONS.ANNOUNCEMENTS_MANAGE_CATEGORIES] },
        ]
    },
    {
        title: "System Health",
        icon: Activity,
        items: [
            {
                title: "System",
                href: "/settings/system",
                permissions: [PERMISSIONS.SYSTEM_VIEW_ALL_SETTINGS],
                children: [
                    { title: "Overview", href: "/settings/system", description: "System health dashboard", permissions: [PERMISSIONS.SYSTEM_VIEW_ALL_SETTINGS] },
                    { title: "Maintenance", href: "/settings/system/maintenance", description: "Maintenance mode and messages", permissions: [PERMISSIONS.SYSTEM_MANAGE_MAINTENANCE] },
                    { title: "Data & Retention", href: "/settings/system/data", description: "Retention policies and pruning", permissions: [PERMISSIONS.SYSTEM_MANAGE_DATA_RETENTION] },
                    { title: "Health", href: "/settings/system/health", description: "Cron jobs and background tasks", permissions: [PERMISSIONS.SYSTEM_MONITOR] },
                ]
            },
            { title: "Cron Status", href: "/settings/cron-status", description: "Scheduled job runs and failures", permissions: [PERMISSIONS.SYSTEM_MONITOR] },
            // Notification Queue moved to /system/notification-queue (ADR-0004): it shows
            // live queue state, not configuration.
        ]
    }
];

/**
 * True when a child entry is its parent's index page — its href is the parent's.
 *
 * These need exact matching. Prefix matching lit them up on every descendant
 * page: on /settings/security/categories both "Security Settings" and "Contact
 * Categories" appeared selected, and "Overview" (/settings) was highlighted on
 * every settings page in the app.
 *
 * Derived from the hrefs rather than declared as a flag, so it cannot drift
 * from the thing it describes.
 */
export function isIndexChild(parent: SettingsItem, child: SettingsItem): boolean {
    return parent.href === child.href;
}
