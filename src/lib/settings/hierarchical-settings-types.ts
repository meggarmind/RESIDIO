/**
 * Hierarchical Settings Types
 *
 * Shared types and constants for the hierarchical settings system.
 * Extracted from server actions to comply with Next.js 16+ "use server" restrictions.
 */

/**
 * Setting level in the hierarchy
 * - estate: Default for entire estate
 * - house: Override for a specific house
 * - resident: Override for a specific resident
 */
export type SettingLevel = 'estate' | 'house' | 'resident';

/**
 * Hierarchical setting record
 */
export type HierarchicalSetting = {
  id: string;
  setting_key: string;
  category: string;
  level: SettingLevel;
  house_id: string | null;
  resident_id: string | null;
  value: unknown;
  description: string | null;
  created_at: string;
  updated_at: string;
};

/**
 * Setting override info for display
 */
export type SettingOverride = {
  level: SettingLevel;
  house_id: string | null;
  resident_id: string | null;
  value: unknown;
  reference_name: string;
};

/**
 * Known hierarchical setting keys
 */
export type HierarchicalSettingKey =
  // Occupancy settings
  | 'max_occupants_per_unit'
  | 'count_children_in_occupancy'
  | 'count_staff_in_occupancy'
  // Security settings
  | 'default_access_code_validity_days'
  | 'access_code_renewal_reminder_days'
  | 'max_active_codes_per_resident'
  // Approval settings
  | 'approval_auto_reject_hours'
  | 'approval_reminder_hours'
  // Reporting settings
  | 'default_report_format'
  | 'report_retention_days'
  // Portal settings
  | 'portal_session_timeout_minutes'
  | 'portal_show_payment_history';

/**
 * Setting category
 */
export type SettingCategory =
  | 'occupancy'
  | 'security'
  | 'approvals'
  | 'reports'
  | 'portal';

/**
 * Get setting metadata (description, category) for a key
 */
export const SETTING_METADATA: Record<HierarchicalSettingKey, {
  label: string;
  description: string;
  category: SettingCategory;
  type: 'number' | 'boolean' | 'string';
}> = {
  // Occupancy
  max_occupants_per_unit: {
    label: 'Maximum Occupants',
    description: 'Maximum number of occupants allowed per residential unit',
    category: 'occupancy',
    type: 'number',
  },
  count_children_in_occupancy: {
    label: 'Count Children',
    description: 'Whether to count children (household_member) in occupancy limits',
    category: 'occupancy',
    type: 'boolean',
  },
  count_staff_in_occupancy: {
    label: 'Count Staff',
    description: 'Whether to count domestic staff in occupancy limits',
    category: 'occupancy',
    type: 'boolean',
  },

  // Security
  default_access_code_validity_days: {
    label: 'Default Code Validity',
    description: 'Default number of days an access code is valid',
    category: 'security',
    type: 'number',
  },
  access_code_renewal_reminder_days: {
    label: 'Renewal Reminder Days',
    description: 'Days before expiry to send renewal reminder',
    category: 'security',
    type: 'number',
  },
  max_active_codes_per_resident: {
    label: 'Max Active Codes',
    description: 'Maximum number of active access codes per resident',
    category: 'security',
    type: 'number',
  },

  // Approvals
  approval_auto_reject_hours: {
    label: 'Auto-Reject Timeout',
    description: 'Hours before pending approvals are auto-rejected',
    category: 'approvals',
    type: 'number',
  },
  approval_reminder_hours: {
    label: 'Reminder Interval',
    description: 'Hours before sending approval reminder',
    category: 'approvals',
    type: 'number',
  },

  // Reports
  default_report_format: {
    label: 'Default Format',
    description: 'Default format for generated reports',
    category: 'reports',
    type: 'string',
  },
  report_retention_days: {
    label: 'Retention Period',
    description: 'Number of days to retain generated reports',
    category: 'reports',
    type: 'number',
  },

  // Portal
  portal_session_timeout_minutes: {
    label: 'Session Timeout',
    description: 'Portal session timeout in minutes',
    category: 'portal',
    type: 'number',
  },
  portal_show_payment_history: {
    label: 'Show Payment History',
    description: 'Whether to show payment history in portal',
    category: 'portal',
    type: 'boolean',
  },
};
