/**
 * Navigation Configuration
 *
 * Central source of truth for admin dashboard navigation items.
 * Themes consume this configuration and apply their own visual styling.
 *
 * Key principle: Navigation data (routes, permissions) is theme-independent.
 * Themes should only affect visual presentation, not functionality.
 */

import type { LucideIcon } from 'lucide-react';
import {
  Home,
  BarChart3,
  Users,
  Building2,
  CreditCard,
  Upload,
  Mail,
  Receipt,
  Shield,
  Briefcase,
  FileBarChart,
  FilePlus,
  FileText,
  Megaphone,
  ClipboardCheck,
  Settings,
  History,
  Archive,
  ListTodo,
  Send,
  UserCog,
  Activity,
  LayoutDashboard,
} from 'lucide-react';
import { PERMISSIONS, type Permission } from '@/lib/auth/action-roles';

/**
 * Navigation item definition
 */
export interface NavItem {
  /** Unique identifier for the nav item (used as React key) */
  id: string;
  /** Display title in sidebar */
  title: string;
  /** URL path for navigation */
  href: string;
  /** Lucide icon component */
  icon: LucideIcon;
  /** Required permissions - user needs at least ONE (OR logic) */
  permissions?: Permission[];
  /** Nested navigation items */
  children?: NavItem[];
  /** Whether to show a badge (e.g., pending count) */
  showBadge?: boolean;
  /** Badge type for different badge data sources */
  badgeType?: 'approvals' | 'notifications';
  /** Short label for mobile display (optional, defaults to title) */
  mobileLabel?: string;
}

/**
 * Navigation section for grouping related items
 */
export interface NavSection {
  /** Section identifier */
  id: string;
  /** Section header label (null = no header, just visual separator) */
  label: string | null;
  /** Items in this section */
  items: NavItem[];
}

/**
 * Admin Dashboard Navigation Items
 *
 * Single source of truth for all sidebar/navigation components.
 * This array is consumed by:
 * - Sidebar (default theme)
 * - ModernSidebar (modern theme)
 * - MobileNav (mobile navigation)
 */
// Individual nav items (used for building sections)
const NAV_DASHBOARD: NavItem = {
  id: 'dashboard',
  title: 'Dashboard',
  href: '/dashboard',
  icon: Home,
};

const NAV_ANALYTICS: NavItem = {
  id: 'analytics',
  title: 'Analytics',
  href: '/analytics',
  icon: BarChart3,
  permissions: [PERMISSIONS.REPORTS_VIEW_FINANCIAL],
};

const NAV_RESIDENTS: NavItem = {
  id: 'residents',
  title: 'Residents',
  href: '/residents',
  icon: Users,
  permissions: [PERMISSIONS.RESIDENTS_VIEW],
};

const NAV_HOUSES: NavItem = {
  id: 'houses',
  title: 'Houses',
  href: '/houses',
  icon: Building2,
  permissions: [PERMISSIONS.HOUSES_VIEW],
};

const NAV_PERSONNEL: NavItem = {
  id: 'personnel',
  title: 'Contractors & Staff',
  href: '/personnel',
  icon: Briefcase, // Or Briefcase? Users is already used for Residents. Maybe HardHat or Contact?
  permissions: [PERMISSIONS.VENDORS_VIEW],
};

const NAV_PAYMENTS: NavItem = {
  id: 'payments',
  title: 'Transactions',
  href: '/payments',
  icon: CreditCard,
  permissions: [PERMISSIONS.PAYMENTS_VIEW],
  children: [
    {
      id: 'payments-import',
      title: 'Import Statement',
      href: '/payments/import',
      icon: Upload,
      permissions: [PERMISSIONS.IMPORTS_CREATE],
    },
    {
      id: 'payments-email-imports',
      title: 'Import Email',
      href: '/payments/email-imports',
      icon: Mail,
      permissions: [PERMISSIONS.EMAIL_IMPORTS_VIEW],
    },
  ],
};

const NAV_BILLING: NavItem = {
  id: 'billing',
  title: 'Invoices & Dues',
  href: '/billing',
  icon: Receipt,
  permissions: [PERMISSIONS.BILLING_VIEW],
  children: [
    {
      id: 'billing-generate',
      title: 'Generate Invoices',
      href: '/billing/generate',
      icon: FilePlus,
      permissions: [PERMISSIONS.BILLING_CREATE_INVOICE],
    },
  ],
};

const NAV_SECURITY: NavItem = {
  id: 'security',
  title: 'Security',
  href: '/security',
  icon: Shield,
  permissions: [PERMISSIONS.SECURITY_VIEW],
};

const NAV_REPORTS: NavItem = {
  id: 'reports',
  title: 'Reports',
  href: '/reports',
  icon: FileBarChart,
  permissions: [
    PERMISSIONS.REPORTS_VIEW_FINANCIAL,
    PERMISSIONS.REPORTS_VIEW_OCCUPANCY,
    PERMISSIONS.REPORTS_VIEW_SECURITY,
  ],
  children: [
    {
      id: 'reports-generate',
      title: 'Generate Reports',
      href: '/reports',
      icon: FilePlus,
      permissions: [PERMISSIONS.REPORTS_VIEW_FINANCIAL],
    },
    {
      id: 'reports-financial-overview',
      title: 'Financial Overview',
      href: '/reports/financial-overview',
      icon: FileBarChart,
      permissions: [PERMISSIONS.REPORTS_VIEW_FINANCIAL],
    },
  ],
};

const NAV_DOCUMENTS: NavItem = {
  id: 'documents',
  title: 'Documents',
  href: '/documents',
  icon: FileText,
  permissions: [PERMISSIONS.DOCUMENTS_VIEW],
};

const NAV_ANNOUNCEMENTS: NavItem = {
  id: 'announcements',
  title: 'Announcements',
  href: '/announcements',
  icon: Megaphone,
  permissions: [PERMISSIONS.ANNOUNCEMENTS_VIEW],
  mobileLabel: 'News',
};

const NAV_APPROVALS: NavItem = {
  id: 'approvals',
  title: 'Approvals',
  href: '/approvals',
  icon: ClipboardCheck,
  permissions: [PERMISSIONS.APPROVALS_VIEW],
  showBadge: true,
  badgeType: 'approvals',
};

const NAV_SETTINGS: NavItem = {
  id: 'settings',
  title: 'Settings',
  href: '/settings',
  icon: Settings,
  permissions: [PERMISSIONS.SETTINGS_VIEW],
};

// The System landing page (#177). Added as a flat item alongside the six
// pages below rather than as a parent with them nested as `children`
// (the NAV_BILLING / NAV_PAYMENTS shape) deliberately: nesting would mean
// `useNavigation`'s `filterItem` drops an item's entire subtree the moment
// its *own* permissions check fails, before it even looks at the children.
// NAV_SYSTEM's own permission (SYSTEM_VIEW_ALL_SETTINGS, matching this
// route's ROUTE_PERMISSIONS entry) is disjoint from each child's permission
// — e.g. NAV_AUDIT_LOGS only needs SETTINGS_VIEW_AUDIT_LOGS — so a role
// holding a child's permission but not SYSTEM_VIEW_ALL_SETTINGS (a plausible
// custom role; today only super_admin holds any `system` category
// permission at all, per the RBAC seed) would lose that sidebar link if it
// were nested under a gated parent, despite the middleware still letting
// them open the page directly. Flat items keep each page's visibility tied
// only to its own guard, matching how the other five already behave.
const NAV_SYSTEM: NavItem = {
  id: 'system',
  title: 'System',
  href: '/system',
  icon: LayoutDashboard,
  permissions: [PERMISSIONS.SYSTEM_VIEW_ALL_SETTINGS],
};

const NAV_AUDIT_LOGS: NavItem = {
  id: 'system-audit-logs',
  title: 'Audit Logs',
  href: '/system/audit-logs',
  icon: History,
  permissions: [PERMISSIONS.SETTINGS_VIEW_AUDIT_LOGS],
};

// Role Assignments, Pending Accounts and Orphaned Accounts moved here from
// /settings/roles (#172, ADR-0004). A flat item alongside NAV_AUDIT_LOGS and
// NAV_SYSTEM, not nested under NAV_SYSTEM — see the comment on NAV_SYSTEM
// for why.
const NAV_ACCOUNTS: NavItem = {
  id: 'system-accounts',
  title: 'Accounts',
  href: '/system/accounts',
  icon: UserCog,
  permissions: [PERMISSIONS.SYSTEM_ASSIGN_ROLES],
};

// Relocated out of /settings per ADR-0004: these show live/historical system
// state (the outgoing queue and what was actually sent), not configuration.
const NAV_NOTIFICATION_QUEUE: NavItem = {
  id: 'system-notification-queue',
  title: 'Notification Queue',
  href: '/system/notification-queue',
  icon: ListTodo,
  permissions: [PERMISSIONS.NOTIFICATIONS_MANAGE],
};

const NAV_NOTIFICATION_HISTORY: NavItem = {
  id: 'system-notification-history',
  title: 'Notification History',
  href: '/system/notification-history',
  icon: Send,
  permissions: [PERMISSIONS.NOTIFICATIONS_MANAGE],
};

const NAV_DATA_TOOLS: NavItem = {
  id: 'system-data-tools',
  title: 'Data Tools',
  href: '/system/data-tools',
  icon: Archive,
  permissions: [PERMISSIONS.SETTINGS_MANAGE_GENERAL],
};

// Canonical home for cron job status, moved from /settings/cron-status and
// /settings/system/health (#174, ADR-0004: live system state is not
// configuration). A flat item, not nested under NAV_SYSTEM — see the comment
// on NAV_SYSTEM for why. Permissions match the route's own guard at
// ROUTE_PERMISSIONS['/system/cron-status'].
const NAV_CRON_STATUS: NavItem = {
  id: 'system-cron-status',
  title: 'Cron Status',
  href: '/system/cron-status',
  icon: Activity,
  permissions: [PERMISSIONS.SYSTEM_MONITOR],
};

const NAV_PROJECTS: NavItem = {
  id: 'projects',
  title: 'Capital Projects',
  href: '/projects',
  icon: Building2,
  permissions: [PERMISSIONS.PROJECTS_VIEW],
};

/**
 * Admin Dashboard Navigation Sections
 *
 * Grouped navigation for better visual organization:
 * - Core: Dashboard, Analytics (entry points)
 * - People & Property: Residents, Houses
 * - Financial: Payments, Billing
 * - Operations: Security, Reports, Documents, Announcements, Approvals
 * - System: Settings
 */
const NAV_EXPENDITURE: NavItem = {
  id: 'expenditure',
  title: 'Expenditure',
  href: '/expenditure',
  icon: CreditCard, // Using CreditCard for now or import Wallet
  permissions: [PERMISSIONS.EXPENDITURE_VIEW],
};

export const ADMIN_NAV_SECTIONS: NavSection[] = [
  {
    id: 'core',
    label: null, // No header for first section
    items: [NAV_DASHBOARD, NAV_ANALYTICS],
  },
  {
    id: 'people-property',
    label: 'People & Property',
    items: [NAV_RESIDENTS, NAV_HOUSES, NAV_PERSONNEL],
  },
  {
    id: 'financial',
    label: 'Financial',
    items: [NAV_PAYMENTS, NAV_BILLING, NAV_EXPENDITURE],
  },
  {
    id: 'operations',
    label: 'Operations',
    items: [NAV_SECURITY, NAV_REPORTS, NAV_DOCUMENTS, NAV_ANNOUNCEMENTS, NAV_APPROVALS, NAV_PROJECTS],
  },
  {
    id: 'system',
    label: 'System',
    items: [
      NAV_SYSTEM,
      NAV_SETTINGS,
      NAV_AUDIT_LOGS,
      NAV_ACCOUNTS,
      NAV_NOTIFICATION_QUEUE,
      NAV_NOTIFICATION_HISTORY,
      NAV_DATA_TOOLS,
      NAV_CRON_STATUS,
    ],
  },
];

/**
 * Admin Dashboard Navigation Items (flat list)
 *
 * Maintained for backwards compatibility.
 * Prefer using ADMIN_NAV_SECTIONS for new implementations.
 */
export const ADMIN_NAV_ITEMS: NavItem[] = ADMIN_NAV_SECTIONS.flatMap(section => section.items);

/**
 * IDs for mobile navigation subset
 * Mobile shows a simplified navigation with fewer items
 */
export const MOBILE_NAV_IDS = [
  'dashboard',
  'residents',
  'payments',
  'security',
  'settings',
] as const;
