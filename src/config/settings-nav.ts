import {
    Settings,
    Palette,
    Shield,
    CreditCard,
    Landmark,
    Mail,
    Bell,
    Map,
    Home,
    Tag,
    FileText,
    Megaphone,
    MessageSquare,
    FileClock,
    ListChecks,
    Activity,
    Cpu,
    Server,
    LucideIcon
} from 'lucide-react';

export type SettingsItem = {
    title: string;
    href: string;
    description?: string;
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
            { title: "General", href: "/settings", description: "Estate information and basics" },
            { title: "Appearance", href: "/settings/appearance", description: "Theme and display settings" },
            { title: "Notifications", href: "/settings/notifications", description: "Manage alerts and channels" },
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
            { title: "Security", href: "/settings/security", description: "Security protocols and limits" },
            { title: "Audit Logs", href: "/settings/audit-logs", description: "View system activity" },
        ]
    },
    {
        title: "Billing & Finance",
        icon: CreditCard,
        items: [
            { title: "Billing Profiles", href: "/settings/billing", description: "Manage billing entities" },
            { title: "Bank Accounts", href: "/settings/bank-accounts", description: "Estate bank accounts" },
        ]
    },
    {
        title: "Communications",
        icon: Mail,
        items: [
            { title: "Email", href: "/settings/email", description: "Email settings" },
            { title: "Email Integration", href: "/settings/email-integration", description: "Connect email providers" },
            { title: "Message Templates", href: "/settings/message-templates", description: "Pre-written messages" },
            { title: "Announcement Categories", href: "/settings/announcement-categories", description: "Organize announcements" },
        ]
    },
    {
        title: "System Health",
        icon: Activity,
        items: [
            { title: "System", href: "/settings/system", description: "Overall system status" },
            { title: "Cron Status", href: "/settings/cron-status", description: "Background job health" },
            { title: "Notification Queue", href: "/settings/notification-queue", description: "Pending notifications" },
        ]
    }
];
