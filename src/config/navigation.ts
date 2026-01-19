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
  FileBarChart,
  FilePlus,
  FileText,
  Megaphone,
  ClipboardCheck,
  Settings,
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
  title: 'Personnel',
  href: '/personnel',
  icon: Users, // Or Briefcase? Users is already used for Residents. Maybe HardHat or Contact?
  permissions: [PERMISSIONS.VENDORS_VIEW],
};

const NAV_PAYMENTS: NavItem = {
  id: 'payments',
  title: 'Payments',
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
      title: 'Email Imports',
      href: '/payments/email-imports',
      icon: Mail,
      permissions: [PERMISSIONS.EMAIL_IMPORTS_VIEW],
    },
  ],
};

const NAV_BILLING: NavItem = {
  id: 'billing',
  title: 'Billing',
  href: '/billing',
  icon: Receipt,
  permissions: [PERMISSIONS.BILLING_VIEW],
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
    items: [NAV_SETTINGS],
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
