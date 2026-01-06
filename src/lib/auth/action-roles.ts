/**
 * Authorization Types and Role Configurations
 *
 * These are separated from the 'use server' authorize.ts file because
 * Next.js 15/16 only allows async function exports from 'use server' files.
 */

import type { UserRole, AppRoleName } from '@/types/database';

export interface AuthorizationResult {
  authorized: boolean;
  userId: string | null;
  role: UserRole | null;
  roleName: AppRoleName | null; // New RBAC role name
  roleId: string | null;        // New RBAC role ID
  permissions: string[];        // User's permissions from new RBAC
  error: string | null;
}

// =====================================================
// Phase 10: New Permission-Based Authorization
// =====================================================

/**
 * Permission strings used throughout the app.
 * These match the permission names in the app_permissions table.
 */
export const PERMISSIONS = {
  // Residents Module
  RESIDENTS_VIEW: 'residents.view',
  RESIDENTS_CREATE: 'residents.create',
  RESIDENTS_UPDATE: 'residents.update',
  RESIDENTS_DELETE: 'residents.delete',
  RESIDENTS_VERIFY: 'residents.verify',
  RESIDENTS_EXPORT: 'residents.export',

  // Houses Module
  HOUSES_VIEW: 'houses.view',
  HOUSES_CREATE: 'houses.create',
  HOUSES_UPDATE: 'houses.update',
  HOUSES_DELETE: 'houses.delete',
  HOUSES_ASSIGN_RESIDENT: 'houses.assign_resident',

  // Payments Module
  PAYMENTS_VIEW: 'payments.view',
  PAYMENTS_CREATE: 'payments.create',
  PAYMENTS_UPDATE: 'payments.update',
  PAYMENTS_DELETE: 'payments.delete',
  PAYMENTS_BULK_UPDATE: 'payments.bulk_update',
  PAYMENTS_EXPORT: 'payments.export',

  // Billing Module
  BILLING_VIEW: 'billing.view',
  BILLING_CREATE_INVOICE: 'billing.create_invoice',
  BILLING_VOID_INVOICE: 'billing.void_invoice',
  BILLING_MANAGE_PROFILES: 'billing.manage_profiles',
  BILLING_APPLY_LATE_FEES: 'billing.apply_late_fees',
  BILLING_MANAGE_WALLETS: 'billing.manage_wallets',

  // Security Module
  SECURITY_VIEW: 'security.view',
  SECURITY_REGISTER_CONTACTS: 'security.register_contacts',
  SECURITY_UPDATE_CONTACTS: 'security.update_contacts',
  SECURITY_SUSPEND_REVOKE: 'security.suspend_revoke',
  SECURITY_GENERATE_CODES: 'security.generate_codes',
  SECURITY_VERIFY_CODES: 'security.verify_codes',
  SECURITY_RECORD_ACCESS: 'security.record_access',
  SECURITY_VIEW_LOGS: 'security.view_logs',
  SECURITY_EXPORT: 'security.export',
  SECURITY_MANAGE_CATEGORIES: 'security.manage_categories',

  // Reports Module
  REPORTS_VIEW_FINANCIAL: 'reports.view_financial',
  REPORTS_VIEW_OCCUPANCY: 'reports.view_occupancy',
  REPORTS_VIEW_SECURITY: 'reports.view_security',
  REPORTS_EXPORT: 'reports.export',

  // Settings Module
  SETTINGS_VIEW: 'settings.view',
  SETTINGS_MANAGE_GENERAL: 'settings.manage_general',
  SETTINGS_MANAGE_BILLING: 'settings.manage_billing',
  SETTINGS_MANAGE_SECURITY: 'settings.manage_security',
  SETTINGS_MANAGE_REFERENCE: 'settings.manage_reference',
  SETTINGS_VIEW_AUDIT_LOGS: 'settings.view_audit_logs',

  // Imports Module
  IMPORTS_CREATE: 'imports.create',
  IMPORTS_REVIEW: 'imports.review',
  IMPORTS_APPROVE: 'imports.approve',
  IMPORTS_REJECT: 'imports.reject',

  // Approvals Module
  APPROVALS_VIEW: 'approvals.view',
  APPROVALS_APPROVE_REJECT: 'approvals.approve_reject',

  // System Module (Super Admin Only)
  SYSTEM_MANAGE_ROLES: 'system.manage_roles',
  SYSTEM_ASSIGN_ROLES: 'system.assign_roles',
  SYSTEM_MANAGE_MAINTENANCE: 'system.manage_maintenance',
  SYSTEM_MANAGE_DATA_RETENTION: 'system.manage_data_retention',
  SYSTEM_VIEW_ALL_SETTINGS: 'system.view_all_settings',

  // Documents Module (Phase 15)
  DOCUMENTS_VIEW: 'documents.view',
  DOCUMENTS_UPLOAD: 'documents.upload',
  DOCUMENTS_UPDATE: 'documents.update',
  DOCUMENTS_DELETE: 'documents.delete',
  DOCUMENTS_MANAGE_CATEGORIES: 'documents.manage_categories',

  // Announcements Module (Phase 16)
  ANNOUNCEMENTS_VIEW: 'announcements.view',
  ANNOUNCEMENTS_CREATE: 'announcements.create',
  ANNOUNCEMENTS_UPDATE: 'announcements.update',
  ANNOUNCEMENTS_DELETE: 'announcements.delete',
  ANNOUNCEMENTS_PUBLISH: 'announcements.publish',
  ANNOUNCEMENTS_MANAGE_CATEGORIES: 'announcements.manage_categories',
  ANNOUNCEMENTS_MANAGE_TEMPLATES: 'announcements.manage_templates',
  ANNOUNCEMENTS_EMERGENCY_BROADCAST: 'announcements.emergency_broadcast',

  // In-App Notifications Module (Phase 16)
  NOTIFICATIONS_VIEW: 'notifications.view',
  NOTIFICATIONS_SEND: 'notifications.send',
  NOTIFICATIONS_MANAGE: 'notifications.manage',

  // Report Subscriptions Module (Phase 16)
  REPORT_SUBSCRIPTIONS_VIEW: 'report_subscriptions.view',
  REPORT_SUBSCRIPTIONS_MANAGE: 'report_subscriptions.manage',

  // Impersonation Module (Admin Portal View)
  IMPERSONATION_VIEW_SESSIONS: 'impersonation.view_sessions',
  IMPERSONATION_START_SESSION: 'impersonation.start_session',
  IMPERSONATION_APPROVE_REQUESTS: 'impersonation.approve_requests',
  IMPERSONATION_MANAGE_SETTINGS: 'impersonation.manage_settings',

  // Notes Module
  NOTES_VIEW: 'notes.view',
  NOTES_CREATE: 'notes.create',
  NOTES_UPDATE: 'notes.update',
  NOTES_DELETE: 'notes.delete',
  NOTES_VIEW_CONFIDENTIAL: 'notes.view_confidential',
} as const;

export type Permission = typeof PERMISSIONS[keyof typeof PERMISSIONS];

/**
 * Route permission mapping for middleware.
 * Maps route prefixes to required permissions.
 */
export const ROUTE_PERMISSIONS: Record<string, Permission[]> = {
  '/residents': [PERMISSIONS.RESIDENTS_VIEW],
  '/houses': [PERMISSIONS.HOUSES_VIEW],
  '/payments': [PERMISSIONS.PAYMENTS_VIEW],
  '/payments/import': [PERMISSIONS.IMPORTS_CREATE],
  '/billing': [PERMISSIONS.BILLING_VIEW],
  '/security': [PERMISSIONS.SECURITY_VIEW],
  '/reports': [PERMISSIONS.REPORTS_VIEW_FINANCIAL, PERMISSIONS.REPORTS_VIEW_OCCUPANCY, PERMISSIONS.REPORTS_VIEW_SECURITY],
  '/documents': [PERMISSIONS.DOCUMENTS_VIEW],
  '/announcements': [PERMISSIONS.ANNOUNCEMENTS_VIEW],
  '/settings/announcement-categories': [PERMISSIONS.ANNOUNCEMENTS_MANAGE_CATEGORIES],
  '/settings/message-templates': [PERMISSIONS.ANNOUNCEMENTS_MANAGE_TEMPLATES],
  '/approvals': [PERMISSIONS.APPROVALS_VIEW],
  '/settings': [PERMISSIONS.SETTINGS_VIEW],
  '/settings/appearance': [PERMISSIONS.SETTINGS_MANAGE_GENERAL],
  '/settings/roles': [PERMISSIONS.SYSTEM_MANAGE_ROLES],
  '/settings/system': [PERMISSIONS.SYSTEM_VIEW_ALL_SETTINGS],
  '/settings/document-categories': [PERMISSIONS.DOCUMENTS_MANAGE_CATEGORIES],
  '/dashboard': [], // All authenticated users
};

// =====================================================
// Legacy: Role-based authorization (backwards compat)
// =====================================================

/**
 * @deprecated Use PERMISSIONS and permission-based authorization instead.
 * Kept for backwards compatibility during migration.
 * Role configurations for common actions
 * Based on route access control defined in middleware.ts
 */
export const ACTION_ROLES = {
  // Resident management - admin, chairman, financial_secretary
  residents: ['admin', 'chairman', 'financial_secretary'] as UserRole[],

  // House management - admin, chairman, financial_secretary
  houses: ['admin', 'chairman', 'financial_secretary'] as UserRole[],

  // Payment management - admin, chairman, financial_secretary
  payments: ['admin', 'chairman', 'financial_secretary'] as UserRole[],

  // Security contacts - admin, chairman (for create/update/delete)
  security_write: ['admin', 'chairman'] as UserRole[],

  // Security contacts - admin, chairman, security_officer (for read)
  security_read: ['admin', 'chairman', 'security_officer'] as UserRole[],

  // Reference data (streets, house types) - admin, chairman
  reference: ['admin', 'chairman'] as UserRole[],

  // Billing management - admin, chairman, financial_secretary
  billing: ['admin', 'chairman', 'financial_secretary'] as UserRole[],

  // Admin only actions
  admin: ['admin'] as UserRole[],

  // Settings - admin, chairman
  settings: ['admin', 'chairman'] as UserRole[],
} as const;
