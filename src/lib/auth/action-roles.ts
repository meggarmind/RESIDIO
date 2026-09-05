/**
 * Authorization Types and Role Configurations
 *
 * These are separated from the 'use server' authorize.ts file because
 * Next.js 15/16 only allows async function exports from 'use server' files.
 */

import type { UserRole, AppRoleName, BuiltInRoleName, RoleCategory } from '@/types/database';

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
  BILLING_REQUEST_LATE_FEE_WAIVER: 'billing.request_late_fee_waiver',
  BILLING_APPROVE_LATE_FEE_WAIVER: 'billing.approve_late_fee_waiver',

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
  SYSTEM_MONITOR: 'system.monitor',

  // Documents Module (Phase 15)
  DOCUMENTS_VIEW: 'documents.view',
  DOCUMENTS_UPLOAD: 'documents.upload',
  DOCUMENTS_UPDATE: 'documents.update',
  DOCUMENTS_DELETE: 'documents.delete',
  DOCUMENTS_MANAGE_CATEGORIES: 'documents.manage_categories',

  // Expenditure
  EXPENDITURE_VIEW: 'view_expenditure',
  EXPENDITURE_MANAGE: 'manage_expenditure',
  VENDORS_VIEW: 'view_vendors',
  VENDORS_MANAGE: 'manage_vendors',

  // Projects Module
  PROJECTS_VIEW: 'view_projects',
  PROJECTS_MANAGE: 'manage_projects',

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

  // WhatsApp Assistant operations
  WHATSAPP_VIEW: 'whatsapp.view',
  WHATSAPP_MANAGE: 'whatsapp.manage',

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

  // Email Imports Module (Phase 17: Gmail Bank Statement Integration)
  EMAIL_IMPORTS_VIEW: 'email_imports.view',
  EMAIL_IMPORTS_CONFIGURE: 'email_imports.configure',
  EMAIL_IMPORTS_TRIGGER: 'email_imports.trigger',
  EMAIL_IMPORTS_PROCESS: 'email_imports.process',
  EMAIL_IMPORTS_MANAGE_PASSWORDS: 'email_imports.manage_passwords',

  // Two-Factor Authentication Module
  TWO_FACTOR_VIEW_STATUS: 'two_factor.view_status',
  TWO_FACTOR_ENABLE: 'two_factor.enable',
  TWO_FACTOR_DISABLE: 'two_factor.disable',
  TWO_FACTOR_MANAGE_POLICIES: 'two_factor.manage_policies',
  TWO_FACTOR_VIEW_AUDIT_LOG: 'two_factor.view_audit_log',
  TWO_FACTOR_RESET_USER: 'two_factor.reset_user',
} as const;

export type Permission = typeof PERMISSIONS[keyof typeof PERMISSIONS];

/**
 * Route permission mapping for middleware.
 *
 * Consumed directly by `src/middleware.ts`, which resolves by longest matching
 * prefix — so `/settings/roles` wins over `/settings`. Holding ANY listed
 * permission authorizes the route.
 *
 * Every settings route is listed. Previously only four were, so most settings
 * pages were reachable by any authenticated admin regardless of what their role
 * had been granted. Each entry mirrors the permissions its `settingsConfig`
 * entry uses, so the nav never links somewhere the middleware will bounce;
 * `settings-nav-coverage.test.ts` holds the two in step.
 */
export const ROUTE_PERMISSIONS: Record<string, Permission[]> = {
  '/residents': [PERMISSIONS.RESIDENTS_VIEW],
  '/houses': [PERMISSIONS.HOUSES_VIEW],
  '/payments': [PERMISSIONS.PAYMENTS_VIEW],
  '/payments/import': [PERMISSIONS.IMPORTS_CREATE],
  '/payments/email-imports': [PERMISSIONS.EMAIL_IMPORTS_VIEW],
  '/billing': [PERMISSIONS.BILLING_VIEW],
  '/security': [PERMISSIONS.SECURITY_VIEW],
  '/reports': [PERMISSIONS.REPORTS_VIEW_FINANCIAL, PERMISSIONS.REPORTS_VIEW_OCCUPANCY, PERMISSIONS.REPORTS_VIEW_SECURITY],
  '/documents': [PERMISSIONS.DOCUMENTS_VIEW],
  '/announcements': [PERMISSIONS.ANNOUNCEMENTS_VIEW],
  '/approvals': [PERMISSIONS.APPROVALS_VIEW],
  '/dashboard': [], // All authenticated users

  // System — fallback first, then the specific pages that override it.
  '/system': [PERMISSIONS.SYSTEM_VIEW_ALL_SETTINGS],
  '/system/audit-logs': [PERMISSIONS.SETTINGS_VIEW_AUDIT_LOGS],
  // Role Assignments, Pending Accounts and Orphaned Accounts moved here from
  // /settings/roles (#172, ADR-0004: day-to-day account work is not
  // configuration). Narrower than /settings/roles: this page only needs to
  // assign roles, not define them, so it does not require SYSTEM_MANAGE_ROLES.
  '/system/accounts': [PERMISSIONS.SYSTEM_ASSIGN_ROLES],
  '/system/notification-queue': [PERMISSIONS.NOTIFICATIONS_MANAGE],
  '/system/notification-history': [PERMISSIONS.NOTIFICATIONS_MANAGE],
  '/system/data-tools': [PERMISSIONS.SETTINGS_MANAGE_GENERAL],
  // Canonical home for cron job status, moved from /settings/cron-status and
  // /settings/system/health (#174, ADR-0004: live system state is not
  // configuration). Matches the route handler's own SYSTEM_MONITOR guard at
  // src/app/api/health/cron-status/route.ts.
  '/system/cron-status': [PERMISSIONS.SYSTEM_MONITOR],

  // Settings — fallback first, then the specific pages that override it.
  '/settings': [PERMISSIONS.SETTINGS_VIEW],

  // General & Preferences
  '/settings/estate-info': [PERMISSIONS.SETTINGS_MANAGE_GENERAL],
  '/settings/branding': [PERMISSIONS.SETTINGS_MANAGE_GENERAL],
  // Retained after the move to /system/data-tools: the redirect stub at this
  // path is a page component and runs after middleware, so this entry is what
  // gates who reaches it — deleting it would widen access to the generic
  // /settings fallback. See ADR-0004.
  '/settings/data-management': [PERMISSIONS.SETTINGS_MANAGE_GENERAL],
  '/settings/appearance': [PERMISSIONS.SETTINGS_MANAGE_GENERAL],
  '/settings/notifications': [PERMISSIONS.NOTIFICATIONS_MANAGE],
  '/settings/notification-queue': [PERMISSIONS.NOTIFICATIONS_MANAGE],
  '/settings/whatsapp': [PERMISSIONS.WHATSAPP_VIEW],

  // Estate configuration
  '/settings/streets': [PERMISSIONS.SETTINGS_MANAGE_REFERENCE],
  '/settings/house-types': [PERMISSIONS.SETTINGS_MANAGE_REFERENCE],
  '/settings/transaction-tags': [PERMISSIONS.SETTINGS_MANAGE_REFERENCE],
  '/settings/bank-accounts': [PERMISSIONS.SETTINGS_MANAGE_REFERENCE],
  '/settings/document-categories': [PERMISSIONS.DOCUMENTS_MANAGE_CATEGORIES],

  // Access & security
  '/settings/roles': [PERMISSIONS.SYSTEM_MANAGE_ROLES, PERMISSIONS.SYSTEM_ASSIGN_ROLES],
  '/settings/user-roles': [PERMISSIONS.SYSTEM_MANAGE_ROLES, PERMISSIONS.SYSTEM_ASSIGN_ROLES],
  '/settings/security': [PERMISSIONS.SETTINGS_MANAGE_SECURITY, PERMISSIONS.SECURITY_MANAGE_CATEGORIES],
  '/settings/security/categories': [PERMISSIONS.SECURITY_MANAGE_CATEGORIES],
  // Retained after the move to /system/audit-logs: the redirect stub at this
  // path is a page component and runs after middleware, so this entry is what
  // gates who reaches it — deleting it would widen access to the generic
  // /settings fallback. See ADR-0004.
  '/settings/audit-logs': [PERMISSIONS.SETTINGS_VIEW_AUDIT_LOGS],

  // Billing & finance
  '/settings/billing': [PERMISSIONS.SETTINGS_MANAGE_BILLING, PERMISSIONS.BILLING_MANAGE_PROFILES],
  '/settings/billing/profiles': [PERMISSIONS.BILLING_MANAGE_PROFILES],
  '/settings/email-integration': [PERMISSIONS.EMAIL_IMPORTS_VIEW],
  '/settings/email-integration/config': [PERMISSIONS.EMAIL_IMPORTS_CONFIGURE],

  // Communications
  '/settings/email': [PERMISSIONS.SETTINGS_MANAGE_GENERAL],
  '/settings/message-templates': [PERMISSIONS.ANNOUNCEMENTS_MANAGE_TEMPLATES],
  '/settings/announcement-categories': [PERMISSIONS.ANNOUNCEMENTS_MANAGE_CATEGORIES],

  // Maintenance & Data
  // Maintenance mode and data retention are genuine configuration and stay in
  // Settings (#176, ADR-0004) — moved up a level so they no longer sit beside
  // the new top-level /system dashboard, which means something entirely
  // different. "Prune Data" stays on /settings/data-retention beside the
  // retention rule it runs, per ADR-0004.
  '/settings/maintenance': [PERMISSIONS.SYSTEM_MANAGE_MAINTENANCE],
  '/settings/data-retention': [PERMISSIONS.SYSTEM_MANAGE_DATA_RETENTION],
  // Retained after the move (#176): all three of these paths are now
  // redirect stubs and each is a page component that runs after
  // middleware, so these entries are what gate who reaches them — deleting
  // any would widen access to the generic /settings fallback. See ADR-0004.
  '/settings/system': [PERMISSIONS.SYSTEM_VIEW_ALL_SETTINGS],
  '/settings/system/maintenance': [PERMISSIONS.SYSTEM_MANAGE_MAINTENANCE],
  '/settings/system/data': [PERMISSIONS.SYSTEM_MANAGE_DATA_RETENTION],
  // Retained after the move to /system/cron-status (#174): both of these
  // paths are now redirect stubs and each is a page component that runs
  // after middleware, so these entries are what gate who reaches them —
  // deleting either would widen access to the generic /settings(/system)
  // fallback. See ADR-0004.
  '/settings/system/health': [PERMISSIONS.SYSTEM_MONITOR],
  '/settings/cron-status': [PERMISSIONS.SYSTEM_MONITOR],
};

// =====================================================
// Role name groupings
// =====================================================

/**
 * Built-in role names that land on the admin dashboard rather than the resident
 * portal. Used for post-login routing only — never for authorization, which
 * always goes through permissions.
 *
 * This is now only a fallback for when the `app_roles` join is unavailable.
 * Prefer `isAdminRole()`, which reads the role's category and so admits roles
 * created through Roles & Permissions; while this list was the source of truth,
 * a `treasurer` was bounced to /portal or /pending-approval no matter what it
 * had been granted.
 */
export const ADMIN_ROLE_NAMES: readonly BuiltInRoleName[] = [
  'super_admin',
  'chairman',
  'vice_chairman',
  'financial_officer',
  'security_officer',
  'secretary',
  'project_manager',
] as const;

/** A role as read from an `app_roles!profiles_role_id_fkey (name, category)` join. */
export interface JoinedRole {
  name: AppRoleName;
  category: RoleCategory | null;
}

/**
 * True when the role routes to the admin dashboard.
 *
 * Decided by category rather than by name, so any non-resident role — seeded or
 * created by an admin — reaches the dashboard. Falls back to the built-in name
 * list when the join did not carry a category.
 */
export function isAdminRole(role: JoinedRole | null | undefined): boolean {
  if (!role) return false;
  if (role.category) return role.category !== 'resident';
  return (ADMIN_ROLE_NAMES as readonly string[]).includes(role.name);
}

/**
 * True when the role belongs to the resident portal. The mirror of
 * `isAdminRole`, so a resident-category role an admin creates routes with the
 * seeded `resident` role rather than falling through to /pending-approval.
 */
export function isResidentRole(role: JoinedRole | null | undefined): boolean {
  if (!role) return false;
  return role.category === 'resident' || role.name === 'resident';
}

/**
 * Reads a role out of an `app_roles!profiles_role_id_fkey (name, category)` join.
 *
 * PostgREST returns either an object or a single-element array depending on how
 * it infers the relation, and the hand-maintained Database type does not model
 * the FK at all, so the join arrives untyped. Normalises both shapes in one
 * place instead of repeating the cast at every call site.
 *
 * `category` comes back null when the caller selected only `(name)`; callers
 * that need admin routing should select both.
 */
export function extractRole(joined: unknown): JoinedRole | null {
  const record = Array.isArray(joined) ? joined[0] : joined;
  if (!record || typeof record !== 'object' || !('name' in record)) return null;

  const { name, category } = record as { name: unknown; category?: unknown };
  if (typeof name !== 'string') return null;

  return {
    name: name as AppRoleName,
    category: typeof category === 'string' ? (category as RoleCategory) : null,
  };
}

/** Convenience wrapper for callers that only need the name. */
export function extractRoleName(joined: unknown): AppRoleName | null {
  return extractRole(joined)?.name ?? null;
}
