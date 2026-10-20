import {
    ListChecks,
    Home,
    CreditCard,
    Mail,
    FileText,
    Shield,
    Plug,
    Wrench,
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

/**
 * Eight groups named for what an admin is trying to do (#786, owner decision
 * 2026-10-20), still by subject as ADR-0004/0005 set out. Connections is the
 * stated exception: WhatsApp and Gmail import sit together because they are
 * external services, even though the subjects they touch (messages, billing
 * imports) belong to other groups.
 *
 * Every page keeps its own route and its own entry; labels changed, URLs did
 * not. A parent item with `children` only groups related pages under one
 * label; which entry is highlighted is decided by `activeSettingsHref` below,
 * by longest match.
 */
export const settingsConfig: SettingsGroup[] = [
    {
        title: "Setup",
        icon: ListChecks,
        items: [
            { title: "Overview", href: "/settings", description: "Setup checklist and every settings page", permissions: [PERMISSIONS.SETTINGS_VIEW] },
        ]
    },
    {
        title: "Estate & Property",
        icon: Home,
        items: [
            { title: "Estate Details", href: "/settings/estate-info", description: "Name, address, contact details", permissions: [PERMISSIONS.SETTINGS_MANAGE_GENERAL] },
            { title: "Logo & Branding", href: "/settings/branding", description: "Logo and visual identity", permissions: [PERMISSIONS.SETTINGS_MANAGE_GENERAL] },
            { title: "Theme", href: "/settings/appearance", description: "Colours and display settings", permissions: [PERMISSIONS.SETTINGS_MANAGE_GENERAL] },
            { title: "Streets", href: "/settings/streets", description: "Manage estate streets", permissions: [PERMISSIONS.SETTINGS_MANAGE_REFERENCE] },
            { title: "House Types", href: "/settings/house-types", description: "Define property types", permissions: [PERMISSIONS.SETTINGS_MANAGE_REFERENCE] },
        ]
    },
    {
        title: "Money",
        icon: CreditCard,
        items: [
            {
                title: "Billing Rules",
                href: "/settings/billing",
                permissions: [PERMISSIONS.SETTINGS_MANAGE_BILLING],
                children: [
                    { title: "General", href: "/settings/billing", description: "General billing configuration", permissions: [PERMISSIONS.SETTINGS_MANAGE_BILLING] },
                    { title: "Late Fees", href: "/settings/billing/late-fees", description: "Late fee rules and waivers", permissions: [PERMISSIONS.SETTINGS_MANAGE_BILLING] },
                    { title: "Invoices & Due Dates", href: "/settings/billing/invoices", description: "When invoices are generated and fall due", permissions: [PERMISSIONS.SETTINGS_MANAGE_BILLING] },
                    { title: "Levies", href: "/settings/billing/development-levies", description: "Development levy profiles", permissions: [PERMISSIONS.SETTINGS_MANAGE_BILLING] },
                ]
            },
            { title: "Rate Cards", href: "/settings/billing/profiles", description: "Billing profiles: what each house type pays", permissions: [PERMISSIONS.BILLING_MANAGE_PROFILES] },
            { title: "Bank Accounts", href: "/settings/bank-accounts", description: "Estate bank accounts", permissions: [PERMISSIONS.SETTINGS_MANAGE_REFERENCE] },
            { title: "Transaction Tags", href: "/settings/transaction-tags", description: "Financial categorization", permissions: [PERMISSIONS.SETTINGS_MANAGE_REFERENCE] },
        ]
    },
    {
        title: "Messages & Reminders",
        icon: Mail,
        items: [
            { title: "Notifications Overview", href: "/settings/notifications", description: "Notification dashboard", permissions: [PERMISSIONS.NOTIFICATIONS_MANAGE] },
            {
                title: "Reminders",
                href: "/settings/notifications/reminders",
                permissions: [PERMISSIONS.NOTIFICATIONS_MANAGE],
                children: [
                    { title: "When to Send", href: "/settings/notifications/reminders", description: "Turn invoice payment reminders on or off", permissions: [PERMISSIONS.NOTIFICATIONS_MANAGE] },
                    { title: "Reminder Schedule", href: "/settings/notifications/reminders/schedule", description: "Days before and after the due date, and escalation", permissions: [PERMISSIONS.NOTIFICATIONS_MANAGE] },
                ]
            },
            // Notification Schedules hidden (#787): nothing consumes notification_schedules.
            // History moved to /system/notification-history (ADR-0004): it shows
            // sent-notification state, not configuration.
            {
                title: "Message Wording",
                href: "/settings/notifications/templates",
                // No permissions of its own: the two children need different ones, and
                // the parent is dropped when neither is visible.
                children: [
                    { title: "Email Wording", href: "/settings/notifications/templates", description: "Edit the wording of resident emails", permissions: [PERMISSIONS.NOTIFICATIONS_MANAGE] },
                    { title: "Announcement Templates", href: "/settings/message-templates", description: "Reusable announcement text", permissions: [PERMISSIONS.ANNOUNCEMENTS_MANAGE_TEMPLATES] },
                ]
            },
            {
                title: "Email Delivery",
                href: "/settings/email",
                permissions: [PERMISSIONS.SETTINGS_MANAGE_GENERAL],
                children: [
                    { title: "Email Settings", href: "/settings/email", description: "Which emails are sent", permissions: [PERMISSIONS.SETTINGS_MANAGE_GENERAL] },
                    { title: "Send a Test", href: "/settings/email/debug", description: "Send a test email and payment reminders", permissions: [PERMISSIONS.SETTINGS_MANAGE_GENERAL] },
                ]
            },
            { title: "Redirect Messages (test mode)", href: "/settings/comms-override", description: "Redirect outbound email, SMS and WhatsApp to override contacts", permissions: [PERMISSIONS.SETTINGS_MANAGE_GENERAL] },
            { title: "Announcement Categories", href: "/settings/announcement-categories", description: "Organize announcements", permissions: [PERMISSIONS.ANNOUNCEMENTS_MANAGE_CATEGORIES] },
        ]
    },
    {
        title: "Documents",
        icon: FileText,
        items: [
            { title: "Categories", href: "/settings/document-categories", description: "Organize document types", permissions: [PERMISSIONS.DOCUMENTS_MANAGE_CATEGORIES] },
            { title: "Tags & Fields", href: "/settings/document-taxonomy", description: "Nested tags and custom fields", permissions: [PERMISSIONS.DOCUMENTS_MANAGE_TAGS, PERMISSIONS.DOCUMENTS_MANAGE_CUSTOM_FIELDS] },
        ]
    },
    {
        title: "People & Access",
        icon: Shield,
        items: [
            // Roles now live on the Roles & Access page (#912, ADR-0004 amendment). The link
            // opens its Roles tab; the route guard is /system/accounts (SYSTEM_ASSIGN_ROLES), so the
            // entry asks for exactly that. The tab itself also needs SYSTEM_MANAGE_ROLES and falls back
            // to Administrators without it.
            { title: "Roles & Permissions", href: "/system/accounts?tab=roles", description: "Create roles and choose what each can do", permissions: [PERMISSIONS.SYSTEM_ASSIGN_ROLES] },
            { title: "Groups", href: "/settings/groups", description: "Named lists of residents that messages and copies are sent to", permissions: [PERMISSIONS.GROUPS_VIEW] },
            {
                title: "Security Rules",
                href: "/settings/security",
                permissions: [PERMISSIONS.SETTINGS_MANAGE_SECURITY, PERMISSIONS.SECURITY_MANAGE_CATEGORIES],
                children: [
                    { title: "Security Settings", href: "/settings/security", description: "Security protocols and limits", permissions: [PERMISSIONS.SETTINGS_MANAGE_SECURITY] },
                    { title: "Contact Categories", href: "/settings/security/categories", description: "Validity periods and requirements", permissions: [PERMISSIONS.SECURITY_MANAGE_CATEGORIES] },
                ]
            },
        ]
    },
    {
        // The stated exception to grouping-by-subject (ADR-0005): WhatsApp and
        // Gmail import sit together as external services even though the
        // subjects they serve (messages, billing imports) live in other
        // groups. Each keeps its full operational console alongside its
        // credentials/config, unlike the configuration-only boundary the other
        // groups hold to (ADR-0004).
        title: "Connections",
        icon: Plug,
        items: [
            { title: "WhatsApp", href: "/settings/whatsapp", description: "Provider credentials, rollout, consent, and pending contacts", permissions: [PERMISSIONS.WHATSAPP_VIEW] },
            { title: "Gmail Import", href: "/settings/email-integration", description: "Connect Gmail, manage the connection, and trigger a manual sync", permissions: [PERMISSIONS.EMAIL_IMPORTS_VIEW] },
            // Paystack and SMS integrations are planned but not yet built.
        ]
    },
    {
        // Configuration only: live state (cron status, notification queue,
        // health) lives under the top-level /system dashboard (#174, #176,
        // ADR-0004); /settings/cron-status and /settings/system/health are
        // redirect stubs, not nav destinations.
        title: "System",
        icon: Wrench,
        items: [
            { title: "Maintenance Mode", href: "/settings/maintenance", description: "Maintenance mode, session timeout and duplicate matching", permissions: [PERMISSIONS.SYSTEM_MANAGE_MAINTENANCE] },
            { title: "Data Retention", href: "/settings/data-retention", description: "Retention policies and pruning", permissions: [PERMISSIONS.SYSTEM_MANAGE_DATA_RETENTION] },
        ]
    }
];

/** Every entry in the nav, parents and their children alike, in display order. */
export function flattenSettingsNav(groups: SettingsGroup[]): SettingsItem[] {
    const flatten = (items: SettingsItem[]): SettingsItem[] =>
        items.flatMap((item) => (item.children ? [item, ...flatten(item.children)] : [item]));
    return groups.flatMap((group) => flatten(group.items));
}

/**
 * The href of the one nav entry the current page belongs to: the longest href
 * that is the pathname or a path prefix of it.
 *
 * Longest match is what keeps a single item highlighted. Plain prefix matching
 * lit up every ancestor: "Overview" (/settings) on every settings page, and
 * both "Reminders" and "Reminder Schedule" on
 * /settings/notifications/reminders/schedule. A page with no entry of its own
 * (a hidden route) highlights the nearest entry above it.
 */
export function activeSettingsHref(pathname: string, groups: SettingsGroup[]): string | null {
    let best: string | null = null;
    for (const { href } of flattenSettingsNav(groups)) {
        const matches = pathname === href || pathname.startsWith(href + '/');
        if (matches && (best === null || href.length > best.length)) best = href;
    }
    return best;
}

/**
 * The entry for `href`, with the group it sits in and its parent if nested.
 * A parent shares its href with its index child; the child wins, because it
 * carries the page's own title and description.
 */
export function findSettingsEntry(
    href: string,
    groups: SettingsGroup[]
): { group: SettingsGroup; parent?: SettingsItem; item: SettingsItem } | null {
    for (const group of groups) {
        for (const item of group.items) {
            const child = item.children?.find((c) => c.href === href);
            if (child) return { group, parent: item, item: child };
            if (item.href === href) return { group, item };
        }
    }
    return null;
}
