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
 * Admin Dashboard Navigation Items
 *
 * Single source of truth for all sidebar/navigation components.
 * This array is consumed by:
 * - Sidebar (default theme)
 * - ModernSidebar (modern theme)
 * - MobileNav (mobile navigation)
 */
export const ADMIN_NAV_ITEMS: NavItem[] = [
  {
    id: 'dashboard',
    title: 'Dashboard',
    href: '/dashboard',
    icon: Home,
    // No permissions = visible to all authenticated users
  },
  {
    id: 'analytics',
    title: 'Analytics',
    href: '/analytics',
    icon: BarChart3,
    permissions: [PERMISSIONS.REPORTS_VIEW_FINANCIAL],
  },
  {
    id: 'residents',
    title: 'Residents',
    href: '/residents',
    icon: Users,
    permissions: [PERMISSIONS.RESIDENTS_VIEW],
  },
  {
    id: 'houses',
    title: 'Houses',
    href: '/houses',
    icon: Building2,
    permissions: [PERMISSIONS.HOUSES_VIEW],
  },
  {
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
  },
  {
    id: 'billing',
    title: 'Billing',
    href: '/billing',
    icon: Receipt,
    permissions: [PERMISSIONS.BILLING_VIEW],
  },
  {
    id: 'security',
    title: 'Security',
    href: '/security',
    icon: Shield,
    permissions: [PERMISSIONS.SECURITY_VIEW],
  },
  {
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
  },
  {
    id: 'documents',
    title: 'Documents',
    href: '/documents',
    icon: FileText,
    permissions: [PERMISSIONS.DOCUMENTS_VIEW],
  },
  {
    id: 'announcements',
    title: 'Announcements',
    href: '/announcements',
    icon: Megaphone,
    permissions: [PERMISSIONS.ANNOUNCEMENTS_VIEW],
    mobileLabel: 'News',
  },
  {
    id: 'approvals',
    title: 'Approvals',
    href: '/approvals',
    icon: ClipboardCheck,
    permissions: [PERMISSIONS.APPROVALS_VIEW],
    showBadge: true,
    badgeType: 'approvals',
  },
  {
    id: 'settings',
    title: 'Settings',
    href: '/settings',
    icon: Settings,
    permissions: [PERMISSIONS.SETTINGS_VIEW],
  },
];

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
