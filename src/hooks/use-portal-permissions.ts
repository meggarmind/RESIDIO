import React, { useMemo } from 'react';
import { useAuth } from '@/lib/auth/auth-provider';
import { useResident } from '@/hooks/use-residents';
import type { ResidentRole } from '@/types/database';
import {
  type PortalFeature,
  hasAnyRoleFeatureAccess,
  getHighestPrivilegeRole,
  getPortalFeaturesForRole,
  getPortalQuickActions,
  getPortalNavForRoles,
  getPortalSectionLabels,
  shouldShowMultiPropertyDashboard,
  getRoleCategory,
} from '@/lib/portal/permissions';

/**
 * Hook for portal feature access control
 *
 * Provides role-based permissions for the resident portal.
 * Automatically considers all roles the resident has across properties.
 */
export function usePortalPermissions() {
  const { residentId } = useAuth();
  const { data: resident, isLoading } = useResident(residentId || undefined);

  // Extract all active roles from resident's house assignments
  const roles = useMemo<ResidentRole[]>(() => {
    if (!resident?.resident_houses) return [];

    return resident.resident_houses
      .filter(rh => rh.is_active)
      .map(rh => rh.resident_role as ResidentRole)
      .filter(Boolean);
  }, [resident]);

  // Get the highest privilege role for general access decisions
  const primaryRole = useMemo(() => {
    return getHighestPrivilegeRole(roles);
  }, [roles]);

  // Get role category for the primary role
  const roleCategory = useMemo(() => {
    return primaryRole ? getRoleCategory(primaryRole) : null;
  }, [primaryRole]);

  // Check if user has access to a specific feature
  const hasAccess = useMemo(() => {
    return (feature: PortalFeature) => hasAnyRoleFeatureAccess(roles, feature);
  }, [roles]);

  // Get all available features based on roles
  const availableFeatures = useMemo(() => {
    if (!primaryRole) return [];
    return getPortalFeaturesForRole(primaryRole);
  }, [primaryRole]);

  // Get quick action buttons based on primary role
  const quickActions = useMemo(() => {
    if (!primaryRole) return [];
    return getPortalQuickActions(primaryRole);
  }, [primaryRole]);

  // Get navigation items based on all roles
  const navItems = useMemo(() => {
    return getPortalNavForRoles(roles);
  }, [roles]);

  // Get section labels based on primary role
  const sectionLabels = useMemo(() => {
    if (!primaryRole) {
      return {
        properties: 'Properties',
        invoices: 'Invoices',
        securityContacts: 'Security Contacts',
      };
    }
    return getPortalSectionLabels(primaryRole);
  }, [primaryRole]);

  // Count properties for multi-property dashboard decision
  const propertyCount = useMemo(() => {
    return resident?.resident_houses?.filter(rh => rh.is_active).length || 0;
  }, [resident]);

  // Check if should show multi-property dashboard
  const showMultiPropertyDashboard = useMemo(() => {
    return shouldShowMultiPropertyDashboard(roles, propertyCount);
  }, [roles, propertyCount]);

  // Role-specific checks
  const isOwner = useMemo(() => {
    return roles.some(r =>
      ['developer', 'non_resident_landlord', 'resident_landlord'].includes(r)
    );
  }, [roles]);

  const isTenant = useMemo(() => {
    return roles.includes('tenant');
  }, [roles]);

  const isPrimaryResident = useMemo(() => {
    return isOwner || isTenant;
  }, [isOwner, isTenant]);

  const isSecondaryResident = useMemo(() => {
    return roles.some(r =>
      ['co_resident', 'household_member', 'domestic_staff', 'caretaker', 'contractor'].includes(r)
    );
  }, [roles]);

  const isStaff = useMemo(() => {
    return roles.some(r => ['domestic_staff', 'caretaker'].includes(r));
  }, [roles]);

  const isContractor = useMemo(() => {
    return roles.includes('contractor');
  }, [roles]);

  // Can manage security contacts
  const canManageSecurityContacts = useMemo(() => {
    return hasAccess('manage_security_contacts');
  }, [hasAccess]);

  // Can pay invoices
  const canPayInvoices = useMemo(() => {
    return hasAccess('pay_invoices');
  }, [hasAccess]);

  // Can manage occupants (add household members, etc.)
  const canManageOccupants = useMemo(() => {
    return hasAccess('manage_occupants');
  }, [hasAccess]);

  // Can initiate property transitions
  const canTransitionProperty = useMemo(() => {
    return hasAccess('property_transition');
  }, [hasAccess]);

  return {
    // Loading state
    isLoading,

    // Role information
    roles,
    primaryRole,
    roleCategory,
    propertyCount,

    // Permission checks
    hasAccess,
    availableFeatures,

    // UI helpers
    quickActions,
    navItems,
    sectionLabels,
    showMultiPropertyDashboard,

    // Convenience role checks
    isOwner,
    isTenant,
    isPrimaryResident,
    isSecondaryResident,
    isStaff,
    isContractor,

    // Feature-specific checks
    canManageSecurityContacts,
    canPayInvoices,
    canManageOccupants,
    canTransitionProperty,
  };
}

/**
 * Helper function to check portal feature access
 * Use this in components for conditional rendering
 *
 * Example:
 * ```tsx
 * const { hasAccess } = usePortalPermissions();
 * if (!hasAccess('manage_security_contacts')) {
 *   return <AccessDenied />;
 * }
 * ```
 */
export function usePortalFeatureCheck(feature: PortalFeature): {
  hasAccess: boolean;
  isLoading: boolean;
} {
  const { hasAccess, isLoading } = usePortalPermissions();

  return {
    hasAccess: hasAccess(feature),
    isLoading,
  };
}
