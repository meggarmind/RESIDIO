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
    /**
     * Sections of a merged settings page (#791). The registry is the single source for
     * row labels, so search and the page cannot name a row differently.
     */
    sections?: SettingsSectionDef[];
    /**
     * The link leaves Settings for a live-state page under /system (ADR-0004), so
     * the nav and search mark it "Opens System".
     */
    opensSystem?: boolean;
};

export type SettingsRowDef = {
    id: string;
    label: string;
    help?: string;
    /** Search aliases. Never displayed. */
    keywords?: string[];
};

export type SettingsSectionDef = {
    /** Anchor id, also the URL hash. */
    id: string;
    title: string;
    /** Holding any one reveals the section. Omitted means the item's own permissions apply. */
    permissions?: Permission[];
    defaultCollapsed?: boolean;
    rows: SettingsRowDef[];
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
                description: "How invoices are generated and fall due, late fees, and development levies",
                // The page opens for the same permissions as before the merge (#935); the four sections are all
                // visible to anyone who reaches it and each control keeps the permission its action enforces.
                permissions: [PERMISSIONS.SETTINGS_MANAGE_BILLING],
                sections: [
                    {
                        id: "general",
                        title: "General",
                        rows: [
                            { id: "bill-vacant-houses", label: "Bill vacant houses", help: "Bill property owners for vacant properties.", keywords: ["empty", "unoccupied", "owner", "dues"] },
                            { id: "bill-under-renovation", label: "Bill houses under renovation", help: "Bill property owners for properties under renovation.", keywords: ["refurbishment", "dues"] },
                            { id: "bill-under-construction", label: "Bill houses under construction", help: "Bill property owners for properties under construction.", keywords: ["building", "dues"] },
                            { id: "auto-generate-levies", label: "Auto-generate levies", help: "Automatically generate one-time levies when a house is created.", keywords: ["development levy", "one-time", "new house"] },
                            { id: "pro-rata-first-month", label: "Pro-rata first month", help: "Apply pro-rata calculation for the first billing month.", keywords: ["partial month", "proration"] },
                            { id: "invoice-due-window", label: "Invoice due window", help: "Days from invoice issue date until payment is due (1-90).", keywords: ["dues", "payment deadline", "due date"] },
                            { id: "payment-reminder-days", label: "Payment reminder days", help: "Which days before the due date reminders may go out.", keywords: ["dues", "nudge", "chase"] },
                            { id: "clearance-copy-group", label: "Clearance certificate copies", help: "Every issued clearance certificate is copied on WhatsApp to the members of one group.", keywords: ["move-out", "certificate", "whatsapp"] },
                        ],
                    },
                    {
                        id: "invoices",
                        title: "Invoices & due dates",
                        rows: [
                            { id: "auto-generate-invoices", label: "Auto-generate invoices", help: "Automatically generate monthly invoices on the configured day.", keywords: ["monthly bill", "dues", "schedule"] },
                            { id: "generation-day", label: "Generation day", help: "Day of the month when invoices are generated.", keywords: ["billing day", "due date", "dues"] },
                        ],
                    },
                    {
                        id: "late-fees",
                        title: "Late fees",
                        rows: [
                            { id: "late-fee-enabled", label: "Enable late fees", help: "Apply late fee charges to overdue invoices.", keywords: ["penalty", "fine", "surcharge", "overdue", "dues"] },
                            { id: "late-fee-type", label: "Late fee type", help: "How the late fee is calculated.", keywords: ["penalty", "percentage", "fixed amount"] },
                            { id: "late-fee-amount", label: "Late fee amount", help: "A percentage of the invoice total or a fixed amount, depending on the type.", keywords: ["penalty", "rate", "naira"] },
                            { id: "grace-period-days", label: "Grace period", help: "Days after the due date before a late fee applies (1-30). The late fee run treats 0 as 7, so 0 is not accepted.", keywords: ["penalty", "overdue", "dues"] },
                            { id: "late-fee-auto-apply", label: "Auto-apply late fees", help: "Automatically apply late fees on the configured day.", keywords: ["penalty", "automatic"] },
                            { id: "late-fee-application-day", label: "Application day", help: "Day of the month to auto-apply late fees.", keywords: ["penalty", "schedule"] },
                            { id: "apply-late-fees-now", label: "Apply late fees now", help: "Manually apply late fees to all eligible overdue invoices.", keywords: ["penalty", "run", "charge", "dues"] },
                            { id: "late-fee-waivers", label: "Late fee waiver requests", help: "Review and approve or reject requests to waive a late fee.", keywords: ["penalty", "forgive", "cancel fee"] },
                        ],
                    },
                    {
                        id: "levies",
                        title: "Levies",
                        rows: [
                            { id: "current-dev-levy", label: "Current development levy", help: "This profile is applied to all newly created houses.", keywords: ["one-time", "new house", "rate card"] },
                            { id: "retroactive-levies", label: "Generate retroactive levies", help: "Generate outstanding one-time levies for existing houses that haven't been charged yet.", keywords: ["backfill", "catch up", "existing houses"] },
                        ],
                    },
                ],
            },
            { title: "Rate Cards", href: "/settings/billing/profiles", description: "Billing profiles: what each house type pays", permissions: [PERMISSIONS.BILLING_MANAGE_PROFILES] },
            {
                title: "Banking",
                href: "/settings/banking",
                description: "Estate bank accounts, transaction tags and duplicate matching",
                // The OR of the sections: the page opens for any one of them and each section keeps its own.
                permissions: [PERMISSIONS.SETTINGS_MANAGE_REFERENCE, PERMISSIONS.SYSTEM_MANAGE_MAINTENANCE],
                sections: [
                    {
                        id: "bank-accounts",
                        title: "Bank accounts",
                        permissions: [PERMISSIONS.SETTINGS_MANAGE_REFERENCE],
                        rows: [
                            { id: "estate-bank-accounts", label: "Estate bank accounts", help: "Add, edit or remove the accounts used for statement imports. Changes by non-admin users require approval.", keywords: ["account number", "statement import", "bank"] },
                            { id: "statement-passwords", label: "PDF statement passwords", help: "Passwords for password-protected bank statement PDFs. They are encrypted at rest.", keywords: ["pdf password", "encrypted statement", "unlock"] },
                        ],
                    },
                    {
                        id: "tags",
                        title: "Transaction tags",
                        permissions: [PERMISSIONS.SETTINGS_MANAGE_REFERENCE],
                        rows: [
                            { id: "transaction-tags", label: "Transaction tags", help: "Category tags that classify incoming (credit) and outgoing (debit) bank statement transactions for financial reporting.", keywords: ["category", "classify", "credit", "debit", "keywords"] },
                        ],
                    },
                    {
                        id: "duplicate-matching",
                        title: "Duplicate matching",
                        permissions: [PERMISSIONS.SYSTEM_MANAGE_MAINTENANCE],
                        rows: [
                            { id: "duplicate-threshold", label: "Confidence threshold", help: "Transactions scoring above this percentage are flagged as duplicates.", keywords: ["sensitivity", "duplicate payment", "double", "match score"] },
                        ],
                    },
                ],
            },
        ]
    },
    {
        title: "Messages",
        icon: Mail,
        items: [
            // Four task pages (#934, #791). Notification history, queue and delivery counts are
            // live state and stay in /system (ADR-0004); the Monitoring group links to them.
            {
                title: "Reminders",
                href: "/settings/reminders",
                description: "Turn invoice payment reminders on or off, set when they go out, and send them now",
                // The page opens for any one of its sections' permissions; each section keeps its own.
                permissions: [PERMISSIONS.NOTIFICATIONS_MANAGE, PERMISSIONS.SETTINGS_MANAGE_GENERAL],
                sections: [
                    {
                        id: "on-off",
                        title: "On or off",
                        permissions: [PERMISSIONS.NOTIFICATIONS_MANAGE],
                        rows: [
                            {
                                id: "reminders-enabled",
                                label: "Send payment reminders",
                                help: "Turns the automatic daily reminders for unpaid invoices on or off.",
                                keywords: ["dues", "overdue", "chase", "nudge", "late payment"],
                            },
                        ],
                    },
                    {
                        id: "schedule",
                        title: "Schedule",
                        permissions: [PERMISSIONS.NOTIFICATIONS_MANAGE],
                        rows: [
                            {
                                id: "reminder-steps",
                                label: "Reminder steps",
                                help: "Days before and after the due date, how firm each reminder is, and the channels it uses.",
                                keywords: ["escalation", "days before due", "days after due", "overdue", "dues"],
                            },
                        ],
                    },
                    {
                        id: "send-test",
                        title: "Send now",
                        permissions: [PERMISSIONS.SETTINGS_MANAGE_GENERAL],
                        defaultCollapsed: true,
                        rows: [
                            {
                                id: "send-reminders-now",
                                label: "Send payment reminders now",
                                help: "Runs one email-only round of reminders straight away.",
                                keywords: ["test", "manual", "trigger", "dues"],
                            },
                        ],
                    },
                ],
            },
            {
                title: "Message Wording",
                href: "/settings/wording",
                description: "Edit the wording of the emails residents receive",
                permissions: [PERMISSIONS.NOTIFICATIONS_MANAGE],
                sections: [
                    {
                        id: "email",
                        title: "Email",
                        rows: [
                            {
                                id: "email-wording",
                                label: "Resident email wording",
                                help: "The subject, greeting and body of each automatic email. Anything left empty uses the built-in text.",
                                keywords: ["template", "text", "invoice email", "receipt", "welcome", "reminder email"],
                            },
                        ],
                    },
                    {
                        // Already built under #908; the owner's table lists it as "later".
                        id: "whatsapp",
                        title: "WhatsApp",
                        defaultCollapsed: true,
                        rows: [
                            {
                                id: "whatsapp-wording",
                                label: "WhatsApp message wording",
                                help: "Editable when Chatmaid is the active provider; Meta and Twilio templates are set in code.",
                                keywords: ["chatmaid", "template", "text"],
                            },
                        ],
                    },
                ],
            },
            {
                title: "Email & Sending",
                href: "/settings/sending",
                description: "Whether email goes out, which emails are sent, and testing",
                permissions: [PERMISSIONS.SETTINGS_MANAGE_GENERAL],
                sections: [
                    {
                        id: "channels",
                        title: "Channels",
                        rows: [
                            {
                                id: "email-enabled",
                                label: "Send email notifications",
                                help: "When off, the system sends no email at all.",
                                keywords: ["resend", "smtp", "mute", "stop emails"],
                            },
                        ],
                    },
                    {
                        id: "email-types",
                        title: "Email types",
                        rows: [
                            {
                                id: "email-payment-reminders",
                                label: "Payment reminders",
                                help: "Reminder emails for unpaid invoices, automatic and manual. WhatsApp reminders are not affected.",
                                keywords: ["dues", "overdue"],
                            },
                            {
                                id: "email-invoice-notifications",
                                label: "Invoice notifications",
                                help: "Email residents when a new invoice is generated.",
                                keywords: ["bill", "levy"],
                            },
                            {
                                id: "email-welcome",
                                label: "Welcome emails",
                                help: "Email new residents their code.",
                                keywords: ["new resident", "onboarding", "code"],
                            },
                        ],
                    },
                    {
                        id: "testing",
                        title: "Testing",
                        defaultCollapsed: true,
                        rows: [
                            {
                                id: "redirect-all",
                                label: "Redirect outbound messages",
                                help: "Sends every email, SMS and WhatsApp message to the override contacts instead of residents.",
                                keywords: ["test mode", "debug mode", "override", "uat", "sandbox"],
                            },
                            {
                                id: "override-contacts",
                                label: "Override contacts",
                                help: "Where redirected messages are delivered.",
                                keywords: ["test email address", "test phone"],
                            },
                            {
                                id: "debug-mode",
                                label: "Debug Mode",
                                help: "Redirects everything for a set time, then turns itself off.",
                                keywords: ["test mode", "redirect", "expiry"],
                            },
                            {
                                id: "test-email",
                                label: "Send a test email",
                                help: "Checks that email delivery works.",
                                keywords: ["verify", "check email works"],
                            },
                        ],
                    },
                ],
            },
            {
                title: "Announcements",
                href: "/settings/announcements",
                description: "Reusable announcement text and the categories announcements sit in",
                permissions: [PERMISSIONS.ANNOUNCEMENTS_MANAGE_TEMPLATES, PERMISSIONS.ANNOUNCEMENTS_MANAGE_CATEGORIES],
                sections: [
                    {
                        id: "templates",
                        title: "Templates",
                        permissions: [PERMISSIONS.ANNOUNCEMENTS_MANAGE_TEMPLATES],
                        rows: [
                            {
                                id: "announcement-templates",
                                label: "Announcement templates",
                                help: "Reusable text for announcements. The automatic emails are edited under Message Wording.",
                                keywords: ["notice", "canned message", "boilerplate"],
                            },
                        ],
                    },
                    {
                        id: "categories",
                        title: "Categories",
                        permissions: [PERMISSIONS.ANNOUNCEMENTS_MANAGE_CATEGORIES],
                        rows: [
                            {
                                id: "announcement-categories",
                                label: "Announcement categories",
                                help: "Groups announcements so residents can filter them.",
                                keywords: ["topics", "tags", "colour"],
                            },
                        ],
                    },
                ],
            },
        ]
    },
    {
        title: "Documents",
        icon: FileText,
        items: [
            {
                title: "Documents",
                href: "/settings/documents",
                description: "Document categories, nested tags and custom fields",
                // The page opens for any one of its sections' permissions; each section keeps its own.
                permissions: [PERMISSIONS.DOCUMENTS_MANAGE_CATEGORIES, PERMISSIONS.DOCUMENTS_MANAGE_TAGS, PERMISSIONS.DOCUMENTS_MANAGE_CUSTOM_FIELDS],
                sections: [
                    {
                        id: "categories",
                        title: "Categories",
                        permissions: [PERMISSIONS.DOCUMENTS_MANAGE_CATEGORIES],
                        rows: [
                            {
                                id: "document-categories",
                                label: "Document categories",
                                help: "Organise documents into categories and choose which ones residents can see in the portal.",
                                keywords: ["folders", "document types", "resident access", "visibility", "admin only"],
                            },
                        ],
                    },
                    {
                        id: "tags-fields",
                        title: "Tags & fields",
                        permissions: [PERMISSIONS.DOCUMENTS_MANAGE_TAGS, PERMISSIONS.DOCUMENTS_MANAGE_CUSTOM_FIELDS],
                        rows: [
                            {
                                id: "document-tags",
                                label: "Document tags",
                                help: "Nested tags for classifying documents. Filtering the library by a tag also finds documents under it.",
                                keywords: ["labels", "nested tags", "parent tag", "classify"],
                            },
                            {
                                id: "document-custom-fields",
                                label: "Document custom fields",
                                help: "Typed details recorded on each document, such as an amount, an expiry date or a related document.",
                                keywords: ["metadata", "expiry date", "amount", "extra details"],
                            },
                        ],
                    },
                ],
            },
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
                description: "Limits on security contacts, their categories, and how long a session stays signed in",
                // The page opens for any one of its sections' permissions; each section keeps its own.
                permissions: [PERMISSIONS.SETTINGS_MANAGE_SECURITY, PERMISSIONS.SECURITY_MANAGE_CATEGORIES, PERMISSIONS.SYSTEM_MANAGE_MAINTENANCE],
                sections: [
                    {
                        id: "contact-limits",
                        title: "Contact limits",
                        permissions: [PERMISSIONS.SETTINGS_MANAGE_SECURITY],
                        rows: [
                            {
                                id: "auto-expire-contacts",
                                label: "Auto-Expire Contacts",
                                help: "Automatically deactivate contacts after their validity period expires.",
                                keywords: ["visitor", "gate", "access code", "expiry"],
                            },
                            {
                                id: "max-contacts-per-category",
                                label: "Max Contacts Per Category",
                                help: "Maximum number of active contacts allowed per category.",
                                keywords: ["limit", "visitors", "cap"],
                            },
                            {
                                id: "expiry-warning-days",
                                label: "Warning Days Before Expiry",
                                help: "Days before contact expiry to trigger a warning notification.",
                                keywords: ["reminder", "notice", "expiring"],
                            },
                            {
                                id: "reset-security-defaults",
                                label: "Reset security settings",
                                help: "Puts the contact limits back to their defaults. Permissions and contact categories are not affected.",
                                keywords: ["defaults", "restore"],
                            },
                        ],
                    },
                    {
                        id: "contact-categories",
                        title: "Contact categories",
                        permissions: [PERMISSIONS.SECURITY_MANAGE_CATEGORIES],
                        rows: [
                            {
                                id: "contact-category-rules",
                                label: "Contact category validity",
                                help: "How long each kind of security contact stays valid by default, and the longest it can be made valid for.",
                                keywords: ["visitor", "domestic staff", "validity period", "days", "access"],
                            },
                        ],
                    },
                    {
                        // Moved from Maintenance (#937). Still written under system.manage_maintenance.
                        id: "session-timeout",
                        title: "Session timeout",
                        permissions: [PERMISSIONS.SYSTEM_MANAGE_MAINTENANCE],
                        rows: [
                            {
                                id: "session-timeout-minutes",
                                label: "Session Timeout (minutes)",
                                help: "Inactive users are signed out after this long.",
                                keywords: ["logout", "sign out", "idle", "inactivity", "auto logout"],
                            },
                        ],
                    },
                ],
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
            {
                title: "Maintenance & Data",
                href: "/settings/system",
                description: "Lock out non-admins during maintenance, and clear out old logs and notifications",
                // The page opens for either section's permission; each section keeps its own.
                permissions: [PERMISSIONS.SYSTEM_MANAGE_MAINTENANCE, PERMISSIONS.SYSTEM_MANAGE_DATA_RETENTION],
                sections: [
                    {
                        id: "maintenance-mode",
                        title: "Maintenance mode",
                        permissions: [PERMISSIONS.SYSTEM_MANAGE_MAINTENANCE],
                        rows: [
                            {
                                id: "maintenance-mode",
                                label: "Maintenance mode",
                                help: "Only super admins can use the application while it is on. Takes effect as soon as you confirm.",
                                keywords: ["lock out", "downtime", "offline", "shut down", "upgrade", "freeze"],
                            },
                            {
                                id: "maintenance-message",
                                label: "Maintenance message",
                                help: "What everyone else sees on the maintenance page. Takes effect once saved.",
                                keywords: ["notice", "downtime message", "back soon"],
                            },
                        ],
                    },
                    {
                        id: "retention",
                        title: "Data retention",
                        permissions: [PERMISSIONS.SYSTEM_MANAGE_DATA_RETENTION],
                        defaultCollapsed: true,
                        rows: [
                            {
                                id: "audit-log-retention",
                                label: "Audit log retention",
                                help: "How many days of audit log entries to keep. Prune Data deletes older ones; saved changes apply to the next prune.",
                                keywords: ["history", "how long to keep", "old logs", "storage"],
                            },
                            {
                                id: "prune-data",
                                label: "Prune old data",
                                help: "Deletes read notifications over 30 days and unread over 90, audit logs older than the retention above, search history over 30 days and system action log entries over 90. Cannot be undone.",
                                keywords: ["delete logs", "clean up", "purge", "storage"],
                            },
                        ],
                    },
                ],
            },
            {
                // Live state stays in /system (ADR-0004); these entries only link to it (#933).
                // No permissions on the parent: each child asks for exactly its /system route guard.
                title: "Monitoring",
                href: "/system/audit-logs",
                opensSystem: true,
                children: [
                    { title: "Audit Logs", href: "/system/audit-logs", description: "Who changed what, and when", permissions: [PERMISSIONS.SETTINGS_VIEW_AUDIT_LOGS], opensSystem: true },
                    { title: "Scheduled Jobs", href: "/system/cron-status", description: "Whether the scheduled jobs are running", permissions: [PERMISSIONS.SYSTEM_MONITOR], opensSystem: true },
                    { title: "Notification Queue", href: "/system/notification-queue", description: "Messages waiting to be sent", permissions: [PERMISSIONS.NOTIFICATIONS_MANAGE], opensSystem: true },
                    { title: "Notification History", href: "/system/notification-history", description: "Messages already sent", permissions: [PERMISSIONS.NOTIFICATIONS_MANAGE], opensSystem: true },
                ]
            },
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
 * both "Billing Rules" and "Late Fees" on
 * /settings/billing/late-fees. A page with no entry of its own
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

/**
 * What the mobile menu button says: the page being viewed. A child that shares its
 * parent's href is the parent's index page, so the parent's title alone names it;
 * any other child reads "Parent: Child" because "General" or "Late Fees" alone
 * does not say which page it belongs to.
 */
export function settingsPageLabel(activeHref: string | null, groups: SettingsGroup[]): string | undefined {
    const found = activeHref ? findSettingsEntry(activeHref, groups) : null;
    if (!found) return undefined;
    const { parent, item } = found;
    if (!parent || parent.href === item.href) return parent?.title ?? item.title;
    return `${parent.title}: ${item.title}`;
}

export type SettingsRowMatch = { item: SettingsItem; section: SettingsSectionDef; row: SettingsRowDef };

function walkItems(items: SettingsItem[], visit: (item: SettingsItem) => void) {
    for (const item of items) {
        visit(item);
        if (item.children) walkItems(item.children, visit);
    }
}

/** Every row in the registry with the item and section that own it. */
export function flattenSettingsRows(groups: SettingsGroup[] = settingsConfig): SettingsRowMatch[] {
    const out: SettingsRowMatch[] = [];
    for (const group of groups) {
        walkItems(group.items, (item) => {
            for (const section of item.sections ?? []) {
                for (const row of section.rows) out.push({ item, section, row });
            }
        });
    }
    return out;
}

export function findSettingsRow(rowId: string, groups: SettingsGroup[] = settingsConfig): SettingsRowMatch | null {
    return flattenSettingsRows(groups).find((m) => m.row.id === rowId) ?? null;
}
