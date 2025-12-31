/**
 * Portal Feature Access Control
 *
 * Role-based feature visibility and access for the resident portal.
 * Different resident roles have different access levels.
 */

import type { ResidentRole } from '@/types/database';

/**
 * Portal features that can be access-controlled
 */
export type PortalFeature =
  | 'view_dashboard'
  | 'view_properties'
  | 'view_invoices'
  | 'pay_invoices'
  | 'view_wallet'
  | 'view_security_contacts'
  | 'manage_security_contacts'
  | 'view_documents'
  | 'view_profile'
  | 'edit_profile'
  | 'view_announcements'
  | 'multi_property_dashboard'
  | 'property_transition' // For developers/landlords to initiate sales/leases
  | 'view_occupants'
  | 'manage_occupants'; // Add/remove household members

/**
 * Role categories for simpler permission mapping
 */
type RoleCategory = 'owner' | 'tenant' | 'resident' | 'staff' | 'contractor';

/**
 * Get the category of a resident role
 */
export function getRoleCategory(role: ResidentRole): RoleCategory {
  switch (role) {
    case 'resident_landlord':
    case 'non_resident_landlord':
    case 'developer':
      return 'owner';
    case 'tenant':
      return 'tenant';
    case 'co_resident':
    case 'household_member':
      return 'resident';
    case 'domestic_staff':
    case 'caretaker':
      return 'staff';
    case 'contractor':
      return 'contractor';
    default:
      return 'resident';
  }
}

/**
 * Feature permissions by role category
 */
const FEATURE_PERMISSIONS: Record<RoleCategory, PortalFeature[]> = {
  owner: [
    'view_dashboard',
    'view_properties',
    'view_invoices',
    'pay_invoices',
    'view_wallet',
    'view_security_contacts',
    'manage_security_contacts',
    'view_documents',
    'view_profile',
    'edit_profile',
    'view_announcements',
    'multi_property_dashboard',
    'property_transition',
    'view_occupants',
    'manage_occupants',
  ],
  tenant: [
    'view_dashboard',
    'view_properties',
    'view_invoices',
    'pay_invoices',
    'view_wallet',
    'view_security_contacts',
    'manage_security_contacts',
    'view_documents',
    'view_profile',
    'edit_profile',
    'view_announcements',
    'view_occupants',
    'manage_occupants',
  ],
  resident: [
    'view_dashboard',
    'view_properties',
    'view_invoices', // Can view, but not necessarily pay
    'view_security_contacts',
    'view_documents',
    'view_profile',
    'edit_profile',
    'view_announcements',
    'view_occupants',
  ],
  staff: [
    'view_dashboard',
    'view_properties',
    'view_profile',
    'edit_profile',
    'view_announcements',
  ],
  contractor: [
    'view_dashboard',
    'view_profile',
    'edit_profile',
    'view_announcements',
  ],
};

/**
 * Check if a role has access to a specific feature
 */
export function hasPortalFeatureAccess(
  role: ResidentRole,
  feature: PortalFeature
): boolean {
  const category = getRoleCategory(role);
  const permissions = FEATURE_PERMISSIONS[category];
  return permissions.includes(feature);
}

/**
 * Get all features available to a role
 */
export function getPortalFeaturesForRole(role: ResidentRole): PortalFeature[] {
  const category = getRoleCategory(role);
  return FEATURE_PERMISSIONS[category];
}

/**
 * Check multiple roles (for residents with multiple property assignments)
 * Returns true if ANY of the roles has access
 */
export function hasAnyRoleFeatureAccess(
  roles: ResidentRole[],
  feature: PortalFeature
): boolean {
  return roles.some(role => hasPortalFeatureAccess(role, feature));
}

/**
 * Get the highest privilege role from a list
 * Useful when a resident has multiple roles across properties
 */
export function getHighestPrivilegeRole(roles: ResidentRole[]): ResidentRole | null {
  const priorityOrder: ResidentRole[] = [
    'developer',
    'non_resident_landlord',
    'resident_landlord',
    'tenant',
    'co_resident',
    'household_member',
    'caretaker',
    'domestic_staff',
    'contractor',
  ];

  for (const role of priorityOrder) {
    if (roles.includes(role)) {
      return role;
    }
  }

  return roles[0] || null;
}

/**
 * Get descriptive labels for portal sections based on role
 */
export function getPortalSectionLabels(role: ResidentRole): {
  properties: string;
  invoices: string;
  securityContacts: string;
} {
  const category = getRoleCategory(role);

  switch (category) {
    case 'owner':
      return {
        properties: 'My Properties',
        invoices: 'Property Invoices',
        securityContacts: 'Security Contacts',
      };
    case 'tenant':
      return {
        properties: 'My Home',
        invoices: 'My Invoices',
        securityContacts: 'My Contacts',
      };
    case 'resident':
      return {
        properties: 'My Home',
        invoices: 'Household Invoices',
        securityContacts: 'Household Contacts',
      };
    case 'staff':
      return {
        properties: 'Assigned Properties',
        invoices: 'Property Invoices',
        securityContacts: 'Property Contacts',
      };
    case 'contractor':
      return {
        properties: 'Work Sites',
        invoices: 'N/A',
        securityContacts: 'N/A',
      };
  }
}

/**
 * Check if the role should see the multi-property dashboard
 */
export function shouldShowMultiPropertyDashboard(
  roles: ResidentRole[],
  propertyCount: number
): boolean {
  // Only show if has owner/developer role AND multiple properties
  if (propertyCount <= 1) return false;

  return roles.some(role =>
    ['developer', 'non_resident_landlord', 'resident_landlord'].includes(role)
  );
}

/**
 * Get role-specific quick action buttons for the portal
 */
export function getPortalQuickActions(role: ResidentRole): Array<{
  id: string;
  label: string;
  href: string;
  icon: string;
  color: string;
}> {
  const category = getRoleCategory(role);

  const baseActions = [
    { id: 'profile', label: 'Profile', href: '/portal/profile', icon: 'User', color: 'rose' },
  ];

  switch (category) {
    case 'owner':
      return [
        { id: 'invoices', label: 'Invoices', href: '/portal/invoices', icon: 'CreditCard', color: 'amber' },
        { id: 'security', label: 'Security', href: '/portal/security-contacts', icon: 'Shield', color: 'purple' },
        { id: 'documents', label: 'Documents', href: '/portal/documents', icon: 'FileText', color: 'sky' },
        ...baseActions,
      ];
    case 'tenant':
      return [
        { id: 'invoices', label: 'Pay Bills', href: '/portal/invoices', icon: 'CreditCard', color: 'amber' },
        { id: 'security', label: 'Contacts', href: '/portal/security-contacts', icon: 'Shield', color: 'purple' },
        { id: 'documents', label: 'Documents', href: '/portal/documents', icon: 'FileText', color: 'sky' },
        ...baseActions,
      ];
    case 'resident':
      return [
        { id: 'invoices', label: 'View Bills', href: '/portal/invoices', icon: 'CreditCard', color: 'amber' },
        { id: 'security', label: 'Contacts', href: '/portal/security-contacts', icon: 'Shield', color: 'purple' },
        { id: 'documents', label: 'Documents', href: '/portal/documents', icon: 'FileText', color: 'sky' },
        ...baseActions,
      ];
    case 'staff':
      return [
        { id: 'documents', label: 'Documents', href: '/portal/documents', icon: 'FileText', color: 'sky' },
        ...baseActions,
      ];
    case 'contractor':
      return baseActions;
  }
}

/**
 * Navigation items based on role access
 */
export type PortalNavItem = {
  id: string;
  label: string;
  href: string;
  icon: string;
  requiredFeature: PortalFeature;
  badge?: 'count' | 'new' | 'alert';
  badgeKey?: string;
};

export const PORTAL_NAV_ITEMS: PortalNavItem[] = [
  {
    id: 'home',
    label: 'Home',
    href: '/portal',
    icon: 'Home',
    requiredFeature: 'view_dashboard',
  },
  {
    id: 'properties',
    label: 'Properties',
    href: '/portal/properties',
    icon: 'Building2',
    requiredFeature: 'view_properties',
  },
  {
    id: 'invoices',
    label: 'Invoices',
    href: '/portal/invoices',
    icon: 'CreditCard',
    requiredFeature: 'view_invoices',
    badge: 'count',
    badgeKey: 'unpaidInvoices',
  },
  {
    id: 'security',
    label: 'Security Contacts',
    href: '/portal/security-contacts',
    icon: 'Shield',
    requiredFeature: 'view_security_contacts',
  },
  {
    id: 'documents',
    label: 'Documents',
    href: '/portal/documents',
    icon: 'FileText',
    requiredFeature: 'view_documents',
  },
  {
    id: 'profile',
    label: 'Profile',
    href: '/portal/profile',
    icon: 'User',
    requiredFeature: 'view_profile',
  },
];

/**
 * Get navigation items filtered by role access
 */
export function getPortalNavForRole(role: ResidentRole): PortalNavItem[] {
  return PORTAL_NAV_ITEMS.filter(item =>
    hasPortalFeatureAccess(role, item.requiredFeature)
  );
}

/**
 * Get navigation items filtered by any of the provided roles
 */
export function getPortalNavForRoles(roles: ResidentRole[]): PortalNavItem[] {
  return PORTAL_NAV_ITEMS.filter(item =>
    hasAnyRoleFeatureAccess(roles, item.requiredFeature)
  );
}
