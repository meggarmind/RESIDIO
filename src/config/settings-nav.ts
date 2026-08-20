import {
    Settings,
    Shield,
    CreditCard,
    Mail,
    Home,
    Activity,
    LucideIcon
} from 'lucide-react';

export type SettingsItem = {
    title: string;
    href: string;
    description?: string;
    children?: SettingsItem[];
};

export type SettingsGroup = {
    title: string;
    icon: LucideIcon;
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
                    { title: "Overview", href: "/settings", description: "Estate information and basics" },
                    { title: "Estate Info", href: "/settings/estate-info", description: "Name, address, contact details" },
                    { title: "Branding", href: "/settings/branding", description: "Logo and visual identity" },
                    { title: "Data Management", href: "/settings/data-management", description: "Administrative data tools" },
                ]
            },
            { title: "Appearance", href: "/settings/appearance", description: "Theme and display settings" },
            {
                title: "Notifications",
                href: "/settings/notifications",
                children: [
                    { title: "Overview", href: "/settings/notifications", description: "Notification dashboard" },
                    { title: "Reminders", href: "/settings/notifications/reminders", description: "Invoice payment reminders" },
                    { title: "Reminder Schedule", href: "/settings/notifications/reminders/schedule", description: "Configure reminder escalation" },
                    { title: "Templates", href: "/settings/notifications/templates", description: "Message templates" },
                    { title: "Schedules", href: "/settings/notifications/schedules", description: "Notification schedules" },
                    { title: "History", href: "/settings/notifications/history", description: "Sent notifications log" },
                ]
            },
            { title: "WhatsApp Operations", href: "/settings/whatsapp", description: "Review consent and pending contacts" },
        ]
    },
    {
        title: "Estate Configuration",
        icon: Home,
        items: [
            { title: "Streets", href: "/settings/streets", description: "Manage estate streets" },
            { title: "House Types", href: "/settings/house-types", description: "Define property types" },
            { title: "Document Categories", href: "/settings/document-categories", description: "Organize document types" },
            { title: "Transaction Tags", href: "/settings/transaction-tags", description: "Financial categorization" },
        ]
    },
    {
        title: "Access & Security",
        icon: Shield,
        items: [
            { title: "Roles & Permissions", href: "/settings/roles", description: "Manage user access levels" },
            {
                title: "Security",
                href: "/settings/security",
                children: [
                    { title: "General", href: "/settings/security", description: "Security protocols and limits" },
                    { title: "Permissions", href: "/settings/security/permissions", description: "Role-based access matrix" },
                    { title: "Contact Categories", href: "/settings/security/categories", description: "Validity periods and requirements" },
                ]
            },
            { title: "Audit Logs", href: "/settings/audit-logs", description: "View system activity" },
        ]
    },
    {
        title: "Billing & Finance",
        icon: CreditCard,
        items: [
            {
                title: "Billing",
                href: "/settings/billing",
                children: [
                    { title: "Billing Settings", href: "/settings/billing", description: "General billing configuration" },
                    { title: "Late Fees", href: "/settings/billing/late-fees", description: "Late fee rules and waivers" },
                    { title: "Invoice Generation", href: "/settings/billing/invoices", description: "Automated invoice settings" },
                    { title: "Development Levies", href: "/settings/billing/development-levies", description: "Development levy profiles" },
                    { title: "Billing Profiles", href: "/settings/billing/profiles", description: "Rate cards and pricing" },
                ]
            },
            { title: "Bank Accounts", href: "/settings/bank-accounts", description: "Estate bank accounts" },
            {
                title: "Import Integration",
                href: "/settings/email-integration",
                children: [
                    { title: "Connection", href: "/settings/email-integration", description: "Gmail connection status" },
                    { title: "Import Configuration", href: "/settings/email-integration/config", description: "Email import rules" },
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
                children: [
                    { title: "Configuration", href: "/settings/email", description: "Email notification settings" },
                    { title: "Debug & Testing", href: "/settings/email/debug", description: "Debug mode and test tools" },
                ]
            },
            { title: "Message Templates", href: "/settings/message-templates", description: "Pre-written messages" },
            { title: "Announcement Categories", href: "/settings/announcement-categories", description: "Organize announcements" },
        ]
    },
    {
        title: "System Health",
        icon: Activity,
        items: [
            {
                title: "System",
                href: "/settings/system",
                children: [
                    { title: "Overview", href: "/settings/system", description: "System health dashboard" },
                    { title: "Maintenance", href: "/settings/system/maintenance", description: "Maintenance mode and messages" },
                    { title: "Data & Retention", href: "/settings/system/data", description: "Retention policies and pruning" },
                    { title: "Health", href: "/settings/system/health", description: "Cron jobs and background tasks" },
                ]
            },
            { title: "Notification Queue", href: "/settings/notification-queue", description: "Pending notifications" },
        ]
    }
];
