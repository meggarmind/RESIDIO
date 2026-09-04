import {
    Home,
    CreditCard,
    Mail,
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
 * Six groups by subject/module, matching the dimension the main dashboard
 * sidebar already uses (ADR-0004, ADR-0005). Integrations is the one stated
 * exception: WhatsApp and Gmail import sit together because they are external
 * services, even though the subjects they touch (communications, billing
 * imports) belong to other groups.
 *
 * Nesting (a parent item with `children`) is kept only where it already
 * existed and where it does real work: several routes share a path prefix
 * with a sibling (e.g. `/settings/billing` and `/settings/billing/late-fees`,
 * or `/settings` and every other settings route), and `isItemActive` in
 * `settings-sidebar.tsx` highlights on a prefix match when an item has no
 * parent. Flattening those into plain siblings would make the shorter route
 * light up on every page under it. See `isIndexChild` below.
 */
export const settingsConfig: SettingsGroup[] = [
    {
        title: "Estate",
        icon: Home,
        items: [
            {
                title: "Estate",
                href: "/settings",
                children: [
                    { title: "Overview", href: "/settings", description: "Estate information and basics", permissions: [PERMISSIONS.SETTINGS_VIEW] },
                    { title: "Estate Info", href: "/settings/estate-info", description: "Name, address, contact details", permissions: [PERMISSIONS.SETTINGS_MANAGE_GENERAL] },
                    { title: "Branding", href: "/settings/branding", description: "Logo and visual identity", permissions: [PERMISSIONS.SETTINGS_MANAGE_GENERAL] },
                ]
            },
            { title: "Appearance", href: "/settings/appearance", description: "Theme and display settings", permissions: [PERMISSIONS.SETTINGS_MANAGE_GENERAL] },
            { title: "Streets", href: "/settings/streets", description: "Manage estate streets", permissions: [PERMISSIONS.SETTINGS_MANAGE_REFERENCE] },
            { title: "House Types", href: "/settings/house-types", description: "Define property types", permissions: [PERMISSIONS.SETTINGS_MANAGE_REFERENCE] },
            { title: "Document Categories", href: "/settings/document-categories", description: "Organize document types", permissions: [PERMISSIONS.DOCUMENTS_MANAGE_CATEGORIES] },
        ]
    },
    {
        title: "Financial",
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
            { title: "Transaction Tags", href: "/settings/transaction-tags", description: "Financial categorization", permissions: [PERMISSIONS.SETTINGS_MANAGE_REFERENCE] },
        ]
    },
    {
        title: "Communications",
        icon: Mail,
        items: [
            {
                title: "Notifications",
                href: "/settings/notifications",
                permissions: [PERMISSIONS.NOTIFICATIONS_MANAGE],
                children: [
                    { title: "Overview", href: "/settings/notifications", description: "Notification dashboard", permissions: [PERMISSIONS.NOTIFICATIONS_MANAGE] },
                    { title: "Reminders", href: "/settings/notifications/reminders", description: "Invoice payment reminders", permissions: [PERMISSIONS.NOTIFICATIONS_MANAGE] },
                    { title: "Reminder Schedule", href: "/settings/notifications/reminders/schedule", description: "Configure reminder escalation", permissions: [PERMISSIONS.NOTIFICATIONS_MANAGE] },
                    { title: "Notification Templates", href: "/settings/notifications/templates", description: "Message templates", permissions: [PERMISSIONS.NOTIFICATIONS_MANAGE] },
                    { title: "Notification Schedules", href: "/settings/notifications/schedules", description: "Notification schedules", permissions: [PERMISSIONS.NOTIFICATIONS_MANAGE] },
                    // History moved to /system/notification-history (ADR-0004): it shows
                    // sent-notification state, not configuration.
                ]
            },
            {
                title: "Email Notifications",
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
        title: "Access & Security",
        icon: Shield,
        items: [
            // Definitions only: assigning roles to people lives at
            // /system/accounts (#172, ADR-0004), which only needs
            // SYSTEM_ASSIGN_ROLES. This link is revealed by SYSTEM_MANAGE_ROLES
            // alone so it does not advertise itself to someone who can assign
            // roles but not define them.
            // Both permissions, deliberately. The page is definitions-only in the sense
            // that day-to-day account work moved to /system/accounts (#172) -- but it
            // still carries the Assignment Rules tab, and #172 kept SYSTEM_ASSIGN_ROLES
            // on this route precisely so someone who can only assign roles can read the
            // rules governing what they may assign. Narrowing this to MANAGE_ROLES would
            // hide from them a page they are still allowed to open.
            { title: "Roles & Permissions", href: "/settings/roles", description: "Create roles and choose what each can do", permissions: [PERMISSIONS.SYSTEM_MANAGE_ROLES, PERMISSIONS.SYSTEM_ASSIGN_ROLES] },
            {
                title: "Security",
                href: "/settings/security",
                permissions: [PERMISSIONS.SETTINGS_MANAGE_SECURITY, PERMISSIONS.SECURITY_MANAGE_CATEGORIES],
                children: [
                    // Titled "Security Settings" rather than "General" so it does not
                    // read as a second copy of another group's overview.
                    { title: "Security Settings", href: "/settings/security", description: "Security protocols and limits", permissions: [PERMISSIONS.SETTINGS_MANAGE_SECURITY] },
                    { title: "Contact Categories", href: "/settings/security/categories", description: "Validity periods and requirements", permissions: [PERMISSIONS.SECURITY_MANAGE_CATEGORIES] },
                ]
            },
        ]
    },
    {
        // The stated exception to grouping-by-subject (ADR-0005): WhatsApp and
        // Gmail import sit together as external services even though the
        // subjects they serve (communications, billing imports) live in other
        // groups. Each keeps its full operational console alongside its
        // credentials/config, unlike the configuration-only boundary the other
        // groups hold to (ADR-0004).
        title: "Integrations",
        icon: Plug,
        items: [
            { title: "WhatsApp", href: "/settings/whatsapp", description: "Provider credentials, rollout, consent, and pending contacts", permissions: [PERMISSIONS.WHATSAPP_VIEW] },
            { title: "Gmail Import", href: "/settings/email-integration", description: "Connect Gmail, manage the connection, and trigger a manual sync", permissions: [PERMISSIONS.EMAIL_IMPORTS_VIEW] },
            // Paystack and SMS integrations are planned but not yet built.
        ]
    },
    {
        title: "Maintenance & Data",
        icon: Wrench,
        items: [
            // Named for what these two pages are — genuine configuration — rather
            // than "System", which would read as the same thing as the new
            // top-level /system dashboard (#176, ADR-0004). No "System" parent or
            // Overview child: that overview had no single successor once its two
            // links moved up a level, so it was retired rather than kept.
            { title: "Maintenance", href: "/settings/maintenance", description: "Maintenance mode and messages", permissions: [PERMISSIONS.SYSTEM_MANAGE_MAINTENANCE] },
            { title: "Data & Retention", href: "/settings/data-retention", description: "Retention policies and pruning", permissions: [PERMISSIONS.SYSTEM_MANAGE_DATA_RETENTION] },
            // Cron Status moved to /system/cron-status (#174, ADR-0004): it shows live
            // job status, not configuration. /settings/cron-status and
            // /settings/system/health are now redirect stubs, not nav destinations.
            //
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
