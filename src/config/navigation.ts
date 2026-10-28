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
  Users,
  Building2,
  CreditCard,
  Upload,
  Mail,
  Receipt,
  HandCoins,
  Shield,
  Briefcase,
  FilePlus,
  FileText,
  Megaphone,
  ClipboardCheck,
  Settings,
  Eye,
  History,
} from 'lucide-react';
import { PERMISSIONS, type Permission } from '@/lib/auth/action-roles';
import { oversightConfig } from '@/config/oversight-nav';
import { flattenSettingsNav, type SettingsGroup } from '@/config/settings-nav';

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
  /** An area with its own left menu: the entry opens the first page of it the user may open, and is active on any of its pages */
  area?: SettingsGroup[];
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
      id: 'payments-import-history',
      title: 'Import History',
      href: '/payments/imports',
      icon: History,
      permissions: [
        PERMISSIONS.IMPORTS_CREATE,
        PERMISSIONS.IMPORTS_REVIEW,
        PERMISSIONS.IMPORTS_APPROVE,
        PERMISSIONS.IMPORTS_REJECT,
      ],
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

// Oversight (#1272): one flat entry for the reports and monitoring pages (menu in
// `oversight-nav.ts`). It is flat, not a parent with `children`, because `filterItem` drops an
// item whose own check fails; so its permissions are the union of every Oversight entry's, and a
// role holding just one of those pages still sees it.
const NAV_OVERSIGHT: NavItem = {
  id: 'oversight',
  title: 'Oversight',
  href: '/system',
  icon: Eye,
  area: oversightConfig,
  permissions: [
    ...new Set(flattenSettingsNav(oversightConfig).flatMap((item) => item.permissions ?? [])),
  ],
};

// Collections ledger (#1194): contributions and item purchases, outside billing.
const NAV_COLLECTIONS: NavItem = {
  id: 'collections',
  title: 'Collections',
  href: '/collections',
  icon: HandCoins,
  permissions: [PERMISSIONS.COLLECTIONS_VIEW],
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
 * - Core: Dashboard (entry point)
 * - People & Property: Residents, Houses
 * - Financial: Payments, Billing
 * - Operations: Security, Documents, Announcements, Approvals
 * - Admin: Oversight (reports and monitoring), Settings
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
    items: [NAV_DASHBOARD],
  },
  {
    id: 'people-property',
    label: 'People & Property',
    items: [NAV_RESIDENTS, NAV_HOUSES, NAV_PERSONNEL],
  },
  {
    id: 'financial',
    label: 'Financial',
    items: [NAV_PAYMENTS, NAV_BILLING, NAV_COLLECTIONS, NAV_EXPENDITURE],
  },
  {
    id: 'operations',
    label: 'Operations',
    items: [NAV_SECURITY, NAV_DOCUMENTS, NAV_ANNOUNCEMENTS, NAV_APPROVALS, NAV_PROJECTS],
  },
  {
    id: 'admin',
    label: 'Admin',
    items: [NAV_OVERSIGHT, NAV_SETTINGS],
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
