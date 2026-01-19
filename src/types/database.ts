// =====================================================
// Phase 10: New Flexible RBAC System
// =====================================================

// New role names (from app_roles table)
export type AppRoleName =
  | 'super_admin'
  | 'chairman'
  | 'vice_chairman'
  | 'financial_officer'
  | 'security_officer'
  | 'secretary'
  | 'project_manager'
  | 'resident';

// Role category (organizational structure)
export type RoleCategory = 'exco' | 'bot' | 'staff' | 'resident';

// Permission category (module grouping)
export type PermissionCategory =
  | 'residents'
  | 'houses'
  | 'payments'
  | 'billing'
  | 'security'
  | 'reports'
  | 'settings'
  | 'imports'
  | 'approvals'
  | 'system'
  | 'documents'
  | 'announcements'
  | 'notifications'
  | 'report_subscriptions'
  | 'impersonation'  // Admin impersonation system
  | 'email_imports' // Gmail bank statement integration
  | 'two_factor'   // Two-factor authentication
  | 'finance'       // Expenditure and Petty Cash
  | 'projects';     // Capital Projects

// Human-readable labels for new roles
export const APP_ROLE_LABELS: Record<AppRoleName, string> = {
  super_admin: 'Super Administrator',
  chairman: 'Chairman',
  vice_chairman: 'Vice Chairman',
  financial_officer: 'Financial Officer',
  security_officer: 'Security Officer',
  secretary: 'Secretary',
  project_manager: 'Project Manager',
  resident: 'Resident',
};

// Legacy: User roles for app access (profiles table) - DEPRECATED, use AppRoleName
// Kept for backwards compatibility during migration
export type UserRole = 'chairman' | 'financial_secretary' | 'security_officer' | 'admin';

// Legacy: Human-readable labels for user roles - DEPRECATED
export const USER_ROLE_LABELS: Record<UserRole, string> = {
  admin: 'Administrator',
  chairman: 'Chairman',
  financial_secretary: 'Financial Secretary',
  security_officer: 'Security Officer',
};

// Mapping from old roles to new roles (for migration/backwards compat)
export const LEGACY_TO_NEW_ROLE_MAP: Record<UserRole, AppRoleName> = {
  admin: 'super_admin',
  chairman: 'chairman',
  financial_secretary: 'financial_officer',
  security_officer: 'security_officer',
};

// Entity types (Individual or Corporate only)
export type EntityType = 'individual' | 'corporate';

// Phase 3: Resident Management Types
export type ResidentType = 'primary' | 'secondary';

// Resident roles (renamed in Phase 2 Enhancements, Contractor added in Phase 15)
export type ResidentRole =
  | 'resident_landlord' // Owner who resides in the unit (was owner_occupier)
  | 'non_resident_landlord' // Non-resident owner (was landlord)
  | 'tenant' // Leaseholder who resides in the unit
  | 'developer' // Developer holding unsold inventory
  | 'co_resident' // Adult residing in unit not on title/lease
  | 'household_member' // Family dependents (spouse, children)
  | 'domestic_staff' // Employees working/living at the unit
  | 'caretaker' // Assigned to maintain a vacant unit
  | 'contractor'; // External service providers (plumbers, electricians, etc.)

// Primary roles (can exist independently - relationship holders)
export type PrimaryResidentRole = 'resident_landlord' | 'non_resident_landlord' | 'tenant' | 'developer';

// Secondary roles (must be attached to a primary resident, individuals only)
export type SecondaryResidentRole = 'co_resident' | 'household_member' | 'domestic_staff' | 'caretaker' | 'contractor';

// Corporate-allowed roles (companies can only have these roles)
export type CorporateRole = 'non_resident_landlord' | 'developer';

// Roles that indicate physical residency (for "One Home" policy)
export type ResidencyRole = 'resident_landlord' | 'tenant' | 'co_resident';

export type VerificationStatus = 'pending' | 'submitted' | 'verified' | 'rejected';
export type AccountStatus = 'active' | 'inactive' | 'suspended' | 'archived';

// Ownership history event types
export type OwnershipEventType =
  | 'house_added'         // House added to Residio portal
  | 'ownership_start'     // Initial ownership assignment
  | 'ownership_transfer'  // Ownership transferred to this resident
  | 'ownership_end'       // Ownership transferred away from this resident
  | 'move_in'             // Resident moved into the property
  | 'move_out'            // Resident moved out of the property
  | 'role_change';        // Role changed (e.g., resident_landlord -> non_resident_landlord)

// Legacy types (for future phases)
export type PaymentStatus = 'current' | 'overdue' | 'suspended' | 'exempt';

// Phase 6: Security Contact Types
export type SecurityContactStatus = 'active' | 'suspended' | 'expired' | 'revoked';
export type AccessCodeType = 'permanent' | 'one_time';
export type IdDocumentType = 'nin' | 'voters_card' | 'drivers_license' | 'passport' | 'company_id' | 'other';

// Visitor Management Enhancement Types
export type VisitorRecurrencePattern = 'daily' | 'weekly' | 'biweekly' | 'monthly' | 'custom';
export type DayOfWeek = 'monday' | 'tuesday' | 'wednesday' | 'thursday' | 'friday' | 'saturday' | 'sunday';
export type VehicleType = 'car' | 'motorcycle' | 'bicycle' | 'truck' | 'van' | 'bus' | 'other';
export type EntryMethod = 'code' | 'photo' | 'manual' | 'vehicle_plate';

// Unified Expenditure Engine Types
export type ExpenseSourceType = 'manual' | 'bank_import' | 'petty_cash';
export type ExpensePaymentMethod = 'bank_transfer' | 'cash' | 'cheque' | 'pos';
export type ExpenseStatus = 'pending' | 'paid' | 'cancelled';

export const EXPENSE_SOURCE_TYPE_LABELS: Record<ExpenseSourceType, string> = {
  manual: 'Manual Entry',
  bank_import: 'Bank Import',
  petty_cash: 'Petty Cash',
};

export const EXPENSE_PAYMENT_METHOD_LABELS: Record<ExpensePaymentMethod, string> = {
  bank_transfer: 'Bank Transfer',
  cash: 'Cash',
  cheque: 'Cheque',
  pos: 'POS',
};

export const VISITOR_RECURRENCE_PATTERN_LABELS: Record<VisitorRecurrencePattern, string> = {
  daily: 'Daily',
  weekly: 'Weekly',
  biweekly: 'Bi-Weekly',
  monthly: 'Monthly',
  custom: 'Custom',
};

export const DAY_OF_WEEK_LABELS: Record<DayOfWeek, string> = {
  monday: 'Monday',
  tuesday: 'Tuesday',
  wednesday: 'Wednesday',
  thursday: 'Thursday',
  friday: 'Friday',
  saturday: 'Saturday',
  sunday: 'Sunday',
};

export const VEHICLE_TYPE_LABELS: Record<VehicleType, string> = {
  car: 'Car',
  motorcycle: 'Motorcycle',
  bicycle: 'Bicycle',
  truck: 'Truck',
  van: 'Van',
  bus: 'Bus',
  other: 'Other',
};

export const ENTRY_METHOD_LABELS: Record<EntryMethod, string> = {
  code: 'Access Code',
  photo: 'Photo Verification',
  manual: 'Manual Entry',
  vehicle_plate: 'Vehicle Plate Recognition',
};

export const SECURITY_CONTACT_STATUS_LABELS: Record<SecurityContactStatus, string> = {
  active: 'Active',
  suspended: 'Suspended',
  expired: 'Expired',
  revoked: 'Revoked',
};

export const ACCESS_CODE_TYPE_LABELS: Record<AccessCodeType, string> = {
  permanent: 'Permanent',
  one_time: 'One-Time',
};

export const ID_DOCUMENT_TYPE_LABELS: Record<IdDocumentType, string> = {
  nin: 'NIN',
  voters_card: "Voter's Card",
  drivers_license: "Driver's License",
  passport: 'International Passport',
  company_id: 'Company ID',
  other: 'Other',
};

// Security permission keys (for configurable role permissions)
export type SecurityPermission =
  | 'register_contacts'
  | 'generate_codes'
  | 'update_contacts'
  | 'verify_codes'
  | 'record_checkin'
  | 'view_contacts'
  | 'search_contacts'
  | 'export_contacts'
  | 'suspend_revoke_contacts'
  | 'configure_categories'
  | 'view_access_logs';

export const SECURITY_PERMISSION_LABELS: Record<SecurityPermission, string> = {
  register_contacts: 'Register Contacts',
  generate_codes: 'Generate Access Codes',
  update_contacts: 'Update Contacts',
  verify_codes: 'Verify Access Codes',
  record_checkin: 'Record Check-In/Out',
  view_contacts: 'View All Contacts',
  search_contacts: 'Search Contacts',
  export_contacts: 'Export Contact List',
  suspend_revoke_contacts: 'Suspend/Revoke Contacts',
  configure_categories: 'Configure Categories',
  view_access_logs: 'View Access Logs',
};

// Billing types
export type BillingTargetType = 'house' | 'resident';
export type BillingFrequency = 'monthly' | 'yearly' | 'one_off';

// Invoice type classification
export type InvoiceType = 'SERVICE_CHARGE' | 'LEVY' | 'ADJUSTMENT' | 'OTHER';

export const INVOICE_TYPE_LABELS: Record<InvoiceType, string> = {
  SERVICE_CHARGE: 'Service Charge',
  LEVY: 'Levy',
  ADJUSTMENT: 'Adjustment',
  OTHER: 'Other',
};

// Invoice status type
export type InvoiceStatus = 'unpaid' | 'paid' | 'void' | 'partially_paid' | 'overdue';

// Approval request types (maker-checker workflow)
export type ApprovalStatus = 'pending' | 'approved' | 'rejected';
export type ApprovalRequestType =
  | 'billing_profile_effective_date'
  | 'house_plots_change'
  | 'bank_account_create'
  | 'bank_account_update'
  | 'bank_account_delete'
  // Developer/Owner actions requiring tenant/owner-occupier approval (Phase 15)
  | 'developer_property_access'
  | 'developer_resident_removal'
  | 'owner_property_access'
  | 'owner_resident_modification'
  | 'owner_security_code_change'
  // Admin impersonation system
  | 'impersonation_request'
  // Late fee waiver system
  | 'late_fee_waiver'
  // Hybrid Payments
  | 'manual_payment_verification';

// Labels for approval request types
export const APPROVAL_REQUEST_TYPE_LABELS: Record<ApprovalRequestType, string> = {
  billing_profile_effective_date: 'Billing Profile Effective Date Change',
  house_plots_change: 'House Plots Change',
  bank_account_create: 'Bank Account Creation',
  bank_account_update: 'Bank Account Update',
  bank_account_delete: 'Bank Account Deletion',
  // Developer/Owner actions
  developer_property_access: 'Developer Property Access Request',
  developer_resident_removal: 'Developer Resident Removal Request',
  owner_property_access: 'Owner Property Access Request',
  owner_resident_modification: 'Owner Resident Modification Request',
  owner_security_code_change: 'Owner Security Code Change Request',
  // Admin impersonation
  impersonation_request: 'Resident Impersonation Request',
  // Late fee waiver
  late_fee_waiver: 'Late Fee Waiver Request',
  // Hybrid Payments
  manual_payment_verification: 'Manual Payment Verification',
};

// Phase 8: Audit Logging Types
export type AuditAction =
  | 'CREATE'
  | 'UPDATE'
  | 'DELETE'
  | 'VERIFY'
  | 'APPROVE'
  | 'REJECT'
  | 'ASSIGN'
  | 'UNASSIGN'
  | 'ACTIVATE'
  | 'DEACTIVATE'
  | 'GENERATE'     // For invoice/levy generation
  | 'ALLOCATE'     // For wallet allocations
  | 'TRANSFER'     // For ownership transfers (Phase 16)
  | 'BULK_UPDATE'  // For bulk operations (Phase 16)
  | 'LOGIN'        // Future: auth events
  | 'LOGOUT';      // Future: auth events

// Auditable entity types (extensible - add new entities here for future modules)
export type AuditEntityType =
  | 'residents'
  | 'houses'
  | 'resident_houses'
  | 'invoices'
  | 'payments'
  | 'billing_profiles'
  | 'wallets'
  | 'approval_requests'
  | 'streets'
  | 'house_types'
  | 'security_contacts'
  | 'security_contact_categories'
  | 'access_codes'
  | 'access_logs'
  | 'profiles'
  | 'system_settings'
  | 'bank_statement_imports'
  | 'resident_payment_aliases'
  | 'estate_bank_accounts'
  | 'transaction_tags'
  | 'app_roles'           // Phase 10: RBAC
  | 'app_permissions'     // Phase 10: RBAC
  | 'role_permissions'    // Phase 10: RBAC
  | 'role_assignment_rules' // Role assignment restrictions
  | 'notification_templates'    // Phase 11: Notifications
  | 'notification_schedules'    // Phase 11: Notifications
  | 'notification_queue'        // Phase 11: Notifications
  | 'notification_history'      // Phase 11: Notifications
  | 'notification_preferences'  // Phase 11: Notifications
  | 'escalation_states'          // Phase 11: Notifications
  | 'invoice_generation_log'   // Phase 12: Invoice Automation
  | 'verification_tokens'     // Contact verification
  | 'announcements'              // Phase 16: Community Communication
  | 'announcement_categories'    // Phase 16: Community Communication
  | 'announcement_read_receipts' // Phase 16: Community Communication
  | 'in_app_notifications'       // Phase 16: Community Communication
  | 'message_templates'          // Phase 16: Community Communication
  | 'report_subscriptions'       // Phase 16: Community Communication
  | 'impersonation_sessions'     // Admin impersonation system
  | 'documents'                   // Phase 15: Document Management
  | 'document_categories'         // Phase 15: Document Management
  | 'entity_notes'               // Notes Module
  | 'gmail_oauth_credentials'     // Phase 17: Email Import
  | 'email_imports'               // Phase 17: Email Import
  | 'email_messages'              // Phase 17: Email Import
  | 'email_transactions'          // Phase 17: Email Import
  | 'estate_bank_account_passwords' // Phase 17: Email Import
  | 'clearance_certificate'        // Renter Move-Out Clearance
  | 'late_fee_waivers'             // Late Fee Waiver System
  | 'late_fee_log'                 // Late Fee Application Log
  | 'paystack_transactions'        // Paystack Payment Gateway
  | 'two_factor_tokens'            // 2FA tokens
  | 'two_factor_backup_codes'      // 2FA backup codes
  | 'two_factor_policies'          // 2FA enforcement policies
  | 'two_factor_audit_log'         // 2FA audit trail
  | 'visitor_vehicles'             // Visitor Vehicle Registration
  // Unified Expenditure Engine
  | 'expenses'                     // Expense records
  | 'payment_records'              // Payment records
  | 'petty_cash_accounts';         // Petty cash account management

export const AUDIT_ACTION_LABELS: Record<AuditAction, string> = {
  CREATE: 'Created',
  UPDATE: 'Updated',
  DELETE: 'Deleted',
  VERIFY: 'Verified',
  APPROVE: 'Approved',
  REJECT: 'Rejected',
  ASSIGN: 'Assigned',
  UNASSIGN: 'Unassigned',
  ACTIVATE: 'Activated',
  DEACTIVATE: 'Deactivated',
  GENERATE: 'Generated',
  ALLOCATE: 'Allocated',
  TRANSFER: 'Transferred',
  BULK_UPDATE: 'Bulk Updated',
  LOGIN: 'Logged In',
  LOGOUT: 'Logged Out',
};

export const AUDIT_ENTITY_LABELS: Record<AuditEntityType, string> = {
  residents: 'Resident',
  houses: 'House',
  resident_houses: 'House Assignment',
  invoices: 'Invoice',
  payments: 'Payment',
  billing_profiles: 'Billing Profile',
  wallets: 'Wallet',
  approval_requests: 'Approval Request',
  streets: 'Street',
  house_types: 'House Type',
  security_contacts: 'Security Contact',
  security_contact_categories: 'Contact Category',
  access_codes: 'Access Code',
  access_logs: 'Access Log',
  profiles: 'User Profile',
  system_settings: 'System Setting',
  bank_statement_imports: 'Bank Statement Import',
  resident_payment_aliases: 'Payment Alias',
  estate_bank_accounts: 'Estate Bank Account',
  transaction_tags: 'Transaction Tag',
  app_roles: 'Role',               // Phase 10: RBAC
  app_permissions: 'Permission',   // Phase 10: RBAC
  role_permissions: 'Role Permission', // Phase 10: RBAC
  role_assignment_rules: 'Role Assignment Rule',
  notification_templates: 'Notification Template',    // Phase 11: Notifications
  notification_schedules: 'Notification Schedule',    // Phase 11: Notifications
  notification_queue: 'Queued Notification',          // Phase 11: Notifications
  notification_history: 'Notification',               // Phase 11: Notifications
  notification_preferences: 'Notification Preference', // Phase 11: Notifications
  escalation_states: 'Escalation State',              // Phase 11: Notifications
  invoice_generation_log: 'Invoice Generation',       // Phase 12: Invoice Automation
  verification_tokens: 'Verification Token',          // Contact verification
  announcements: 'Announcement',                       // Phase 16: Community Communication
  announcement_categories: 'Announcement Category',    // Phase 16: Community Communication
  announcement_read_receipts: 'Announcement Read Receipt', // Phase 16: Community Communication
  in_app_notifications: 'In-App Notification',         // Phase 16: Community Communication
  message_templates: 'Message Template',               // Phase 16: Community Communication
  report_subscriptions: 'Report Subscription',         // Phase 16: Community Communication
  impersonation_sessions: 'Impersonation Session',     // Admin impersonation system
  documents: 'Document',                                // Phase 15: Document Management
  document_categories: 'Document Category',             // Phase 15: Document Management
  entity_notes: 'Note',                                 // Notes Module
  gmail_oauth_credentials: 'Gmail Connection',          // Email Import System
  email_imports: 'Email Import',                        // Email Import System
  email_messages: 'Email Message',                      // Email Import System
  email_transactions: 'Email Transaction',              // Email Import System
  estate_bank_account_passwords: 'Bank Account Password', // Email Import System
  clearance_certificate: 'Clearance Certificate',       // Renter Move-Out Clearance
  late_fee_waivers: 'Late Fee Waiver',                  // Late Fee Waiver System
  late_fee_log: 'Late Fee Application',                 // Late Fee Application Log
  paystack_transactions: 'Paystack Transaction',        // Paystack Payment Gateway
  two_factor_tokens: '2FA Token',                       // Two-Factor Authentication
  two_factor_backup_codes: '2FA Backup Code',           // Two-Factor Authentication
  two_factor_policies: '2FA Policy',                    // Two-Factor Authentication
  two_factor_audit_log: '2FA Audit Log',                // Two-Factor Authentication
  visitor_vehicles: 'Visitor Vehicle',                  // Visitor Management Enhancement
  // Unified Expenditure Engine
  expenses: 'Expense',                                  // Expense Management
  payment_records: 'Payment Record',                    // Payment Records
  petty_cash_accounts: 'Petty Cash Account',            // Petty Cash Management
};

export const APPROVAL_STATUS_LABELS: Record<ApprovalStatus, string> = {
  pending: 'Pending',
  approved: 'Approved',
  rejected: 'Rejected',
};

export const INVOICE_STATUS_LABELS: Record<InvoiceStatus, string> = {
  unpaid: 'Unpaid',
  paid: 'Paid',
  void: 'Void',
  partially_paid: 'Partially Paid',
  overdue: 'Overdue',
};

// Rate snapshot captured at invoice generation for audit trail
export interface RateSnapshot {
  billing_profile_id: string;
  billing_profile_name: string;
  captured_at: string; // ISO date
  items: Array<{
    name: string;
    amount: number;
    frequency: string;
    is_mandatory: boolean;
  }>;
  total_amount: number;
}

// Billable roles (roles that can receive invoices)
export type BillableRole = 'resident_landlord' | 'non_resident_landlord' | 'tenant' | 'developer';

// Billable role options for forms
export const BILLABLE_ROLE_OPTIONS = [
  { value: 'resident_landlord' as const, label: 'Resident Landlord' },
  { value: 'non_resident_landlord' as const, label: 'Non-Resident Landlord' },
  { value: 'tenant' as const, label: 'Tenant' },
  { value: 'developer' as const, label: 'Developer' },
];

// Billing target type labels
export const BILLING_TARGET_LABELS: Record<BillingTargetType, string> = {
  house: 'Property (House)',
  resident: 'Resident (Role-Based)',
};

// Role display labels for UI
// Updated terminology (Jan 2026): More professional property-focused labels
export const RESIDENT_ROLE_LABELS: Record<ResidentRole, string> = {
  resident_landlord: 'Owner-Occupier',
  non_resident_landlord: 'Property Owner',
  tenant: 'Renter',
  developer: 'Developer',
  co_resident: 'Occupant',
  household_member: 'Family Member',
  domestic_staff: 'Domestic Staff',
  caretaker: 'Caretaker',
  contractor: 'Contractor',
};

// Resident type labels for UI
export const RESIDENT_TYPE_LABELS: Record<ResidentType, string> = {
  primary: 'Primary Resident',
  secondary: 'Secondary Resident',
};

// Primary role options for forms (individual residents)
export const PRIMARY_ROLE_OPTIONS = [
  { value: 'resident_landlord' as const, label: 'Owner-Occupier' },
  { value: 'non_resident_landlord' as const, label: 'Property Owner' },
  { value: 'tenant' as const, label: 'Renter' },
  { value: 'developer' as const, label: 'Developer' },
];

// Corporate-only role options (corporate entities can only have these roles)
export const CORPORATE_ROLE_OPTIONS = [
  { value: 'non_resident_landlord' as const, label: 'Property Owner' },
  { value: 'developer' as const, label: 'Developer' },
];

// Secondary role options for forms (individuals only)
export const SECONDARY_ROLE_OPTIONS = [
  { value: 'co_resident' as const, label: 'Occupant' },
  { value: 'household_member' as const, label: 'Family Member' },
  { value: 'domestic_staff' as const, label: 'Domestic Staff' },
  { value: 'caretaker' as const, label: 'Caretaker' },
  { value: 'contractor' as const, label: 'Contractor' },
];

// Entity type labels for UI
export const ENTITY_TYPE_LABELS: Record<EntityType, string> = {
  individual: 'Individual',
  corporate: 'Corporate Entity',
};

export interface Database {
  public: {
    Tables: {
      // Auth/User profiles
      profiles: {
        Row: {
          id: string;
          email: string;
          full_name: string;
          role: UserRole;
          dashboard_theme_override: string | null; // Personal theme preference for Admin Dashboard
          portal_theme_override: string | null; // Personal theme preference for Resident Portal
          created_at: string;
          updated_at: string;
        };
        Insert: Omit<Database['public']['Tables']['profiles']['Row'], 'created_at' | 'updated_at'>;
        Update: Partial<Database['public']['Tables']['profiles']['Insert']>;
      };

      // System Configuration
      system_settings: {
        Row: {
          id: string;
          category: string;
          key: string;
          value: any; // JSONB type - can be string, number, boolean, object, or array
          description: string | null;
          is_public: boolean;
          created_at: string;
          updated_at: string;
        };
        Insert: Omit<Database['public']['Tables']['system_settings']['Row'], 'id' | 'created_at' | 'updated_at'> & {
          id?: string;
        };
        Update: Partial<Database['public']['Tables']['system_settings']['Insert']>;
      };

      // Phase 3: Streets
      streets: {
        Row: {
          id: string;
          name: string;
          short_name: string | null;
          description: string | null;
          is_active: boolean;
          created_at: string;
          updated_at: string;
          created_by: string | null;
        };
        Insert: Omit<Database['public']['Tables']['streets']['Row'], 'id' | 'created_at' | 'updated_at'> & {
          id?: string;
        };
        Update: Partial<Database['public']['Tables']['streets']['Insert']>;
      };

      // Phase 3: House Types
      house_types: {
        Row: {
          id: string;
          name: string;
          description: string | null;
          max_residents: number;
          billing_profile_id: string | null;
          is_active: boolean;
          created_at: string;
          updated_at: string;
          created_by: string | null;
        };
        Insert: Omit<Database['public']['Tables']['house_types']['Row'], 'id' | 'created_at' | 'updated_at'> & {
          id?: string;
        };
        Update: Partial<Database['public']['Tables']['house_types']['Insert']>;
      };

      // Phase 3: Houses
      houses: {
        Row: {
          id: string;
          house_number: string;
          street_id: string;
          house_type_id: string | null;
          address_line_2: string | null;
          short_name: string | null; // Human-readable property identifier (e.g., OAK-10A)
          is_occupied: boolean;
          is_active: boolean;
          notes: string | null;
          billing_profile_id: string | null; // Override for house type default
          number_of_plots: number; // Number of plots the house is built on (for Development Levy calculation)
          created_at: string;
          updated_at: string;
          created_by: string | null;
        };
        Insert: Omit<Database['public']['Tables']['houses']['Row'], 'id' | 'created_at' | 'updated_at' | 'is_occupied' | 'number_of_plots' | 'short_name'> & {
          id?: string;
          is_occupied?: boolean;
          number_of_plots?: number;
          short_name?: string | null;
        };
        Update: Partial<Database['public']['Tables']['houses']['Insert']>;
      };

      // Phase 3: Residents
      residents: {
        Row: {
          id: string;
          resident_code: string;
          first_name: string;
          last_name: string;
          email: string | null;
          phone_primary: string;
          phone_secondary: string | null;
          resident_type: ResidentType;
          verification_status: VerificationStatus;
          account_status: AccountStatus;
          // Entity type fields (Individual/Corporate/Developer)
          entity_type: EntityType;
          company_name: string | null;
          rc_number: string | null;
          liaison_contact_name: string | null;
          liaison_contact_phone: string | null;
          // ID verification fields
          id_type: string | null;
          id_number: string | null;
          id_verified_at: string | null;
          id_verified_by: string | null;
          photo_url: string | null;
          emergency_contact_name: string | null;
          emergency_contact_phone: string | null;
          emergency_contact_relationship: string | null;
          emergency_contact_resident_id: string | null;
          notes: string | null;
          // Portal access fields
          profile_id: string | null;
          portal_enabled: boolean | null;
          portal_enabled_at: string | null;
          portal_enabled_by: string | null;
          // Contact verification fields
          email_verified_at: string | null;
          phone_verified_at: string | null;
          created_at: string;
          updated_at: string;
          created_by: string | null;
          updated_by: string | null;
        };
        Insert: Omit<
          Database['public']['Tables']['residents']['Row'],
          'id' | 'resident_code' | 'created_at' | 'updated_at'
        > & {
          id?: string;
          resident_code?: string;
          entity_type?: EntityType; // Defaults to 'individual'
          emergency_contact_resident_id?: string | null;
        };
        Update: Partial<Database['public']['Tables']['residents']['Insert']>;
      };

      // Phase 3: Resident-House Junction
      resident_houses: {
        Row: {
          id: string;
          resident_id: string;
          house_id: string;
          resident_role: ResidentRole;
          is_primary: boolean;
          move_in_date: string;
          move_out_date: string | null;
          is_active: boolean;
          // Sponsor fields for secondary roles (domestic_staff, caretaker, contractor)
          sponsor_resident_id: string | null;
          // Live-in flag for domestic staff (true = lives at property, false = visiting)
          is_live_in: boolean;
          // Flexible tags/attributes for the resident-house relationship
          tags: string[];
          created_at: string;
          updated_at: string;
          created_by: string | null;
        };
        Insert: Omit<Database['public']['Tables']['resident_houses']['Row'], 'id' | 'created_at' | 'updated_at'> & {
          id?: string;
          is_live_in?: boolean;
          tags?: string[];
        };
        Update: Partial<Database['public']['Tables']['resident_houses']['Insert']>;
      };

      // Future phases
      payment_records: {
        Row: {
          id: string;
          resident_id: string;
          house_id: string | null;
          split_payment_group_id: string | null;
          amount: number;
          payment_date: string;
          period_start: string;
          period_end: string;
          status: 'paid' | 'pending' | 'failed';
          reference: string | null;
          import_id: string | null;
          import_row_id: string | null;
          method: string | null;
          notes: string | null;
          // Verification fields (Unified Expenditure Engine)
          is_verified: boolean;
          verified_at: string | null;
          verified_by: string | null;
          bank_row_id: string | null;
          created_at: string;
          updated_at: string;
        };
        Insert: Omit<Database['public']['Tables']['payment_records']['Row'], 'id' | 'created_at' | 'updated_at' | 'is_verified'> & {
          id?: string;
          house_id?: string | null;
          split_payment_group_id?: string | null;
          is_verified?: boolean;
        };
        Update: Partial<Database['public']['Tables']['payment_records']['Insert']>;
      };

      // Phase 6: Security Contact Categories
      security_contact_categories: {
        Row: {
          id: string;
          name: string;
          description: string | null;
          default_validity_days: number;
          max_validity_days: number;
          requires_photo: boolean;
          requires_id_document: boolean;
          is_active: boolean;
          sort_order: number;
          created_at: string;
          updated_at: string;
        };
        Insert: Omit<Database['public']['Tables']['security_contact_categories']['Row'], 'id' | 'created_at' | 'updated_at'>;
        Update: Partial<Database['public']['Tables']['security_contact_categories']['Insert']>;
      };

      // Phase 6: Security Contacts (Enhanced with Visitor Management)
      security_contacts: {
        Row: {
          id: string;
          resident_id: string;
          category_id: string;
          full_name: string;
          phone_primary: string;
          phone_secondary: string | null;
          photo_url: string | null;
          id_type: IdDocumentType | null;
          id_number: string | null;
          id_document_url: string | null;
          address: string | null;
          next_of_kin_name: string | null;
          next_of_kin_phone: string | null;
          employer: string | null;
          relationship: string | null;
          notes: string | null;
          status: SecurityContactStatus;
          // Visitor Management Enhancement fields
          is_recurring: boolean;
          recurrence_pattern: VisitorRecurrencePattern | null;
          recurrence_days: DayOfWeek[] | null;
          recurrence_start_date: string | null;
          recurrence_end_date: string | null;
          expected_arrival_time: string | null;
          expected_departure_time: string | null;
          purpose: string | null;
          visit_count: number;
          last_visit_at: string | null;
          is_frequent_visitor: boolean;
          created_at: string;
          updated_at: string;
          created_by: string | null;
        };
        Insert: Omit<Database['public']['Tables']['security_contacts']['Row'], 'id' | 'created_at' | 'updated_at' | 'visit_count' | 'is_frequent_visitor'> & {
          visit_count?: number;
          is_frequent_visitor?: boolean;
        };
        Update: Partial<Database['public']['Tables']['security_contacts']['Insert']>;
      };

      // Visitor Vehicles
      visitor_vehicles: {
        Row: {
          id: string;
          contact_id: string;
          vehicle_type: VehicleType;
          plate_number: string;
          make: string | null;
          model: string | null;
          color: string | null;
          year: number | null;
          photo_url: string | null;
          is_primary: boolean;
          is_active: boolean;
          notes: string | null;
          created_at: string;
          updated_at: string;
          created_by: string | null;
        };
        Insert: Omit<Database['public']['Tables']['visitor_vehicles']['Row'], 'id' | 'created_at' | 'updated_at'>;
        Update: Partial<Database['public']['Tables']['visitor_vehicles']['Insert']>;
      };

      // Phase 6: Access Codes
      access_codes: {
        Row: {
          id: string;
          contact_id: string;
          code: string;
          code_type: AccessCodeType;
          valid_from: string;
          valid_until: string | null;
          max_uses: number | null;
          current_uses: number;
          is_active: boolean;
          created_at: string;
          revoked_at: string | null;
          revoked_by: string | null;
        };
        Insert: Omit<Database['public']['Tables']['access_codes']['Row'], 'id' | 'created_at' | 'code'> & { code?: string };
        Update: Partial<Database['public']['Tables']['access_codes']['Insert']>;
      };

      // Phase 6: Access Logs (Enhanced with Visitor Management)
      access_logs: {
        Row: {
          id: string;
          access_code_id: string | null;
          contact_id: string;
          resident_id: string;
          check_in_time: string;
          check_out_time: string | null;
          verified_by: string | null;
          gate_location: string | null;
          notes: string | null;
          flagged: boolean;
          flag_reason: string | null;
          // Visitor Management Enhancement fields
          expected_duration_minutes: number | null;
          actual_duration_minutes: number | null;
          vehicle_id: string | null;
          entry_method: string | null;
          photo_captured_at: string | null;
          photo_url: string | null;
          created_at: string;
        };
        Insert: Omit<Database['public']['Tables']['access_logs']['Row'], 'id' | 'created_at' | 'actual_duration_minutes'> & {
          actual_duration_minutes?: number | null;
        };
        Update: Partial<Database['public']['Tables']['access_logs']['Insert']>;
      };

      audit_logs: {
        Row: {
          id: string;
          actor_id: string;
          action: AuditAction;
          entity_type: AuditEntityType;
          entity_id: string;
          entity_display: string | null;
          old_values: Record<string, unknown> | null;
          new_values: Record<string, unknown> | null;
          description: string | null;
          metadata: Record<string, unknown> | null;
          ip_address: string | null;
          user_agent: string | null;
          created_at: string;
        };
        Insert: Omit<Database['public']['Tables']['audit_logs']['Row'], 'id' | 'created_at'>;
        Update: never; // Audit logs are immutable - no updates allowed
      };

      // House Ownership History (audit trail for ownership and occupancy changes)
      house_ownership_history: {
        Row: {
          id: string;
          house_id: string;
          resident_id: string | null;  // Nullable for house_added events
          resident_role: ResidentRole | null;  // Nullable for house_added events
          event_type: OwnershipEventType;
          previous_role: ResidentRole | null;
          event_date: string;
          notes: string | null;
          is_current: boolean;
          created_at: string;
          created_by: string | null;
        };
        Insert: Omit<Database['public']['Tables']['house_ownership_history']['Row'], 'id' | 'created_at'> & {
          id?: string;
        };
        Update: Partial<Database['public']['Tables']['house_ownership_history']['Insert']>;
      };

      // Unified Expenditure Engine: Expenses
      expenses: {
        Row: {
          id: string;
          category_id: string;
          vendor_id: string | null;
          project_id: string | null;
          amount: number;
          description: string | null;
          expense_date: string;
          status: ExpenseStatus;
          receipt_url: string | null;
          // Verification fields (Unified Expenditure Engine)
          is_verified: boolean;
          verified_at: string | null;
          verified_by: string | null;
          bank_row_id: string | null;
          source_type: ExpenseSourceType;
          payment_method: ExpensePaymentMethod;
          petty_cash_account_id: string | null;
          created_by: string;
          created_at: string;
          updated_at: string;
        };
        Insert: Omit<Database['public']['Tables']['expenses']['Row'], 'id' | 'created_at' | 'updated_at' | 'is_verified'> & {
          id?: string;
          is_verified?: boolean;
          source_type?: ExpenseSourceType;
          payment_method?: ExpensePaymentMethod;
        };
        Update: Partial<Database['public']['Tables']['expenses']['Insert']>;
      };

      // Unified Expenditure Engine: Petty Cash Accounts
      petty_cash_accounts: {
        Row: {
          id: string;
          name: string;
          current_balance: number;
          initial_float: number;
          last_replenishment_at: string | null;
          last_replenishment_amount: number | null;
          last_replenishment_by: string | null;
          is_active: boolean;
          notes: string | null;
          created_at: string;
          updated_at: string;
          created_by: string | null;
        };
        Insert: Omit<Database['public']['Tables']['petty_cash_accounts']['Row'], 'id' | 'created_at' | 'updated_at' | 'current_balance'> & {
          id?: string;
          current_balance?: number;
        };
        Update: Partial<Database['public']['Tables']['petty_cash_accounts']['Insert']>;
      };

      // Vendors (Personnel)
      vendors: {
        Row: {
          id: string;
          name: string;
          type: 'staff' | 'vendor' | 'contractor' | 'supplier'; // default 'vendor'
          status: 'active' | 'inactive' | 'terminated'; // default 'active'
          category: string | null;
          contact_person: string | null;
          phone: string | null;
          email: string | null;
          bank_details: any; // JSONB
          job_title: string | null;
          department: string | null;
          start_date: string | null;
          end_date: string | null;
          notes: string | null;
          is_active: boolean;
          created_at: string;
          updated_at: string;
        };
        Insert: Omit<Database['public']['Tables']['vendors']['Row'], 'id' | 'created_at' | 'updated_at'> & {
          id?: string;
          type?: 'staff' | 'vendor' | 'contractor' | 'supplier';
          status?: 'active' | 'inactive' | 'terminated';
        };
        Update: Partial<Database['public']['Tables']['vendors']['Insert']>;
      };
    };
  };
}

// Convenience type aliases
export type Street = Database['public']['Tables']['streets']['Row'];
export type StreetInsert = Database['public']['Tables']['streets']['Insert'];
export type StreetUpdate = Database['public']['Tables']['streets']['Update'];

export type HouseType = Database['public']['Tables']['house_types']['Row'];
export type HouseTypeInsert = Database['public']['Tables']['house_types']['Insert'];
export type HouseTypeUpdate = Database['public']['Tables']['house_types']['Update'];

export type House = Database['public']['Tables']['houses']['Row'];
export type HouseInsert = Database['public']['Tables']['houses']['Insert'];
export type HouseUpdate = Database['public']['Tables']['houses']['Update'];

export type Resident = Database['public']['Tables']['residents']['Row'];
export type ResidentInsert = Database['public']['Tables']['residents']['Insert'];
export type ResidentUpdate = Database['public']['Tables']['residents']['Update'];

export type ResidentHouse = Database['public']['Tables']['resident_houses']['Row'];
export type ResidentHouseInsert = Database['public']['Tables']['resident_houses']['Insert'];
export type ResidentHouseUpdate = Database['public']['Tables']['resident_houses']['Update'];

export type Profile = Database['public']['Tables']['profiles']['Row'];

export type HouseOwnershipHistory = Database['public']['Tables']['house_ownership_history']['Row'];
export type HouseOwnershipHistoryInsert = Database['public']['Tables']['house_ownership_history']['Insert'];
export type HouseOwnershipHistoryUpdate = Database['public']['Tables']['house_ownership_history']['Update'];

export type PaymentRecord = Database['public']['Tables']['payment_records']['Row'];
export type PaymentRecordInsert = Database['public']['Tables']['payment_records']['Insert'];
export type PaymentRecordUpdate = Database['public']['Tables']['payment_records']['Update'];

// Unified Expenditure Engine: Expense type aliases
export type Expense = Database['public']['Tables']['expenses']['Row'];
export type ExpenseInsert = Database['public']['Tables']['expenses']['Insert'];
export type ExpenseUpdate = Database['public']['Tables']['expenses']['Update'];

// Unified Expenditure Engine: Petty Cash Account type aliases
export type PettyCashAccount = Database['public']['Tables']['petty_cash_accounts']['Row'];
export type PettyCashAccountInsert = Database['public']['Tables']['petty_cash_accounts']['Insert'];
export type PettyCashAccountUpdate = Database['public']['Tables']['petty_cash_accounts']['Update'];

// Personnel / Vendors
export type Vendor = Database['public']['Tables']['vendors']['Row'];
export type VendorInsert = Database['public']['Tables']['vendors']['Insert'];
export type VendorUpdate = Database['public']['Tables']['vendors']['Update'];

// Personnel Types (Mapped to Vendors table)
export type PersonnelType = 'staff' | 'vendor' | 'contractor' | 'supplier';
export type PersonnelStatus = 'active' | 'inactive' | 'terminated';

export interface Personnel extends Vendor {
  type: PersonnelType;
  status: PersonnelStatus;
  job_title: string | null;
  department: string | null;
  start_date: string | null;
  end_date: string | null;
}

// Payment with joined house and resident details
export interface PaymentRecordWithDetails extends PaymentRecord {
  resident: {
    id: string;
    first_name: string;
    last_name: string;
    resident_code: string;
    entity_type: EntityType;
    company_name: string | null;
  };
  house?: {
    id: string;
    house_number: string;
    street: {
      name: string;
    };
  } | null;
}

// Phase 6: Security Contact type aliases
export type SecurityContactCategory = Database['public']['Tables']['security_contact_categories']['Row'];
export type SecurityContactCategoryInsert = Database['public']['Tables']['security_contact_categories']['Insert'];
export type SecurityContactCategoryUpdate = Database['public']['Tables']['security_contact_categories']['Update'];

export type SecurityContact = Database['public']['Tables']['security_contacts']['Row'];
export type SecurityContactInsert = Database['public']['Tables']['security_contacts']['Insert'];
export type SecurityContactUpdate = Database['public']['Tables']['security_contacts']['Update'];

export type AccessCode = Database['public']['Tables']['access_codes']['Row'];
export type AccessCodeInsert = Database['public']['Tables']['access_codes']['Insert'];
export type AccessCodeUpdate = Database['public']['Tables']['access_codes']['Update'];

export type AccessLog = Database['public']['Tables']['access_logs']['Row'];
export type AccessLogInsert = Database['public']['Tables']['access_logs']['Insert'];
export type AccessLogUpdate = Database['public']['Tables']['access_logs']['Update'];

// Visitor Vehicles type aliases
export type VisitorVehicle = Database['public']['Tables']['visitor_vehicles']['Row'];
export type VisitorVehicleInsert = Database['public']['Tables']['visitor_vehicles']['Insert'];
export type VisitorVehicleUpdate = Database['public']['Tables']['visitor_vehicles']['Update'];

// Joined types for queries
export interface HouseWithStreet extends House {
  street: Street;
  house_type: HouseType | null;
}

export interface HouseWithResidents extends HouseWithStreet {
  resident_houses: (ResidentHouse & {
    resident: Resident;
  })[];
}

export interface ResidentWithHouses extends Resident {
  resident_houses: (ResidentHouse & {
    house: HouseWithStreet;
  })[];
  emergency_contact_resident?: {
    first_name: string;
    last_name: string;
    phone_primary: string;
    resident_code: string;
  } | null;
}

// Ownership history with resident details (resident can be null for house_added events)
export interface HouseOwnershipHistoryWithResident extends HouseOwnershipHistory {
  resident: {
    id: string;
    first_name: string;
    last_name: string;
    resident_code: string;
    entity_type: EntityType;
    company_name: string | null;
  } | null;
}

// Billing Profile type
export interface BillingProfile {
  id: string;
  name: string;
  description: string | null;
  is_active: boolean;
  target_type: BillingTargetType;
  applicable_roles: BillableRole[] | null;
  is_one_time: boolean;
  is_development_levy: boolean; // True for Development Levy profiles (flat fee per house)
  effective_date: string; // Date from which rates are effective
  created_at: string;
  updated_at: string;
  created_by: string | null;
}

// Billing Item type
export interface BillingItem {
  id: string;
  billing_profile_id: string;
  name: string;
  amount: number;
  frequency: BillingFrequency;
  is_mandatory: boolean;
  created_at: string;
  updated_at: string;
}

// Billing Profile with items
export interface BillingProfileWithItems extends BillingProfile {
  items: BillingItem[];
}

// System Settings type
export interface SystemSetting {
  id: string;
  key: string;
  value: unknown; // JSONB can be any type
  description: string | null;
  category: string;
  created_at: string;
  updated_at: string;
}

// Hierarchical Settings (Phase 15)
export type SettingLevel = 'estate' | 'house' | 'resident';

export interface HierarchicalSetting {
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
  created_by: string | null;
  updated_by: string | null;
}

// House Levy History type
export interface HouseLevyHistory {
  id: string;
  house_id: string;
  billing_profile_id: string;
  resident_id: string;
  invoice_id: string | null;
  applied_at: string;
  applied_by: string | null;
  notes: string | null;
}

// House Levy History with related data
export interface HouseLevyHistoryWithDetails extends HouseLevyHistory {
  billing_profile: BillingProfile;
  resident: {
    id: string;
    first_name: string;
    last_name: string;
    resident_code: string;
  };
  invoice?: {
    id: string;
    invoice_number: string;
    amount_due: number;
    status: string;
  };
}

// Invoice base type
export interface Invoice {
  id: string;
  invoice_number: string;
  resident_id: string;
  house_id: string;
  billing_profile_id: string | null;
  amount_due: number;
  amount_paid: number;
  status: InvoiceStatus;
  invoice_type: InvoiceType;
  rate_snapshot: RateSnapshot | null;
  due_date: string;
  period_start: string;
  period_end: string;
  notes: string | null;
  created_at: string;
  updated_at: string;
  created_by: string | null;
  is_correction?: boolean;
  parent_invoice_id?: string | null;
  correction_type?: 'credit_note' | 'debit_note' | null;
}

// Invoice with related data
export interface InvoiceWithDetails extends Invoice {
  resident: {
    id: string;
    first_name: string;
    last_name: string;
    resident_code: string;
    phone_primary?: string;
    email?: string | null;
  };
  house: {
    id: string;
    house_number: string;
    short_name?: string | null;
    street: { name: string };
  };
  billing_profile: {
    id: string;
    name: string;
  } | null;
  invoice_items: Array<{
    id: string;
    description: string;
    amount: number;
  }>;
}

// Approval Request entity types
export type ApprovalEntityType =
  | 'billing_profile'
  | 'house'
  | 'estate_bank_account'
  | 'resident_houses'       // For developer/owner approval requests
  | 'security_code'         // For security code approval requests
  | 'impersonation_session' // For admin impersonation approval requests
  | 'invoice'               // For late fee waiver approval requests
  | 'payment_record';       // For manual payment verification

// Approval Request type (maker-checker workflow)
export interface ApprovalRequest {
  id: string;
  request_type: ApprovalRequestType;
  entity_type: ApprovalEntityType;
  entity_id: string;
  requested_changes: Record<string, unknown>;
  current_values: Record<string, unknown>;
  reason: string | null;
  status: ApprovalStatus;
  requested_by: string;
  reviewed_by: string | null;
  reviewed_at: string | null;
  review_notes: string | null;
  created_at: string;
  updated_at: string;
}

// Approval Request with related data
export interface ApprovalRequestWithDetails extends ApprovalRequest {
  requester: {
    id: string;
    full_name: string;
    email: string;
    role: UserRole;
  };
  reviewer?: {
    id: string;
    full_name: string;
    email: string;
    role: UserRole;
  } | null;
  entity_name: string; // House address, billing profile name, or payment reference/amount
}

// Phase 8: Audit Log Types
export type AuditLog = Database['public']['Tables']['audit_logs']['Row'];
export type AuditLogInsert = Database['public']['Tables']['audit_logs']['Insert'];

// Audit log with actor details (for display in UI)
export interface AuditLogWithActor extends AuditLog {
  actor: {
    id: string;
    full_name: string;
    email: string;
    role: UserRole;
  } | null; // Nullable to handle deleted profiles (ON DELETE SET NULL)
}

// Phase 6: Security Contact Joined Types

// Security contact with category details
export interface SecurityContactWithCategory extends SecurityContact {
  category: SecurityContactCategory;
}

// Security contact with all related data (for detail views)
export interface SecurityContactWithDetails extends SecurityContact {
  category: SecurityContactCategory;
  resident: {
    id: string;
    first_name: string;
    last_name: string;
    resident_code: string;
    phone_primary: string;
  };
  access_codes: AccessCode[];
  vehicles?: VisitorVehicle[];
  created_by_profile?: {
    id: string;
    full_name: string;
  } | null;
}

// Visitor Vehicle with contact details
export interface VisitorVehicleWithContact extends VisitorVehicle {
  contact: {
    id: string;
    full_name: string;
    phone_primary: string;
    resident: {
      id: string;
      first_name: string;
      last_name: string;
      resident_code: string;
    };
  };
}

// Visitor Analytics (from the visitor_analytics view)
export interface VisitorAnalytics {
  contact_id: string;
  full_name: string;
  resident_id: string;
  category_id: string;
  is_recurring: boolean;
  is_frequent_visitor: boolean;
  visit_count: number;
  last_visit_at: string | null;
  status: SecurityContactStatus;
  category_name: string;
  resident_first_name: string;
  resident_last_name: string;
  resident_code: string;
  visits_last_30_days: number;
  visits_last_7_days: number;
  avg_visit_duration_minutes: number | null;
  vehicle_count: number;
}

// Frequent Visitor result from get_frequent_visitors function
export interface FrequentVisitor {
  contact_id: string;
  full_name: string;
  phone_primary: string;
  photo_url: string | null;
  category_name: string;
  resident_name: string;
  resident_code: string;
  visit_count: number;
  last_visit_at: string;
  avg_duration_minutes: number | null;
}

// Visitor History Summary from get_visitor_history_summary function
export interface VisitorHistorySummary {
  total_visits: number;
  first_visit: string | null;
  last_visit: string | null;
  avg_duration_minutes: number | null;
  total_duration_hours: number;
  most_common_gate: string | null;
  flagged_visits: number;
  vehicles_used: number;
}

// Recurring Schedule input for creating/updating recurring visitors
export interface RecurringScheduleInput {
  is_recurring: boolean;
  recurrence_pattern?: VisitorRecurrencePattern | null;
  recurrence_days?: DayOfWeek[] | null;
  recurrence_start_date?: string | null;
  recurrence_end_date?: string | null;
  expected_arrival_time?: string | null;
  expected_departure_time?: string | null;
  purpose?: string | null;
}

// Access code with contact details (for verification)
export interface AccessCodeWithContact extends AccessCode {
  contact: SecurityContactWithCategory & {
    resident: {
      id: string;
      first_name: string;
      last_name: string;
      resident_code: string;
      phone_primary: string;
      resident_houses: Array<{
        house: {
          id: string;
          house_number: string;
          street: { name: string };
        };
      }>;
    };
  };
}

// Access log with all related data
export interface AccessLogWithDetails extends AccessLog {
  contact: {
    id: string;
    full_name: string;
    phone_primary: string;
    category: SecurityContactCategory;
  };
  resident: {
    id: string;
    first_name: string;
    last_name: string;
    resident_code: string;
  };
  access_code?: {
    id: string;
    code: string;
    code_type: AccessCodeType;
  } | null;
  vehicle?: {
    id: string;
    plate_number: string;
    vehicle_type: string;
    make: string | null;
    model: string | null;
  } | null;
  verified_by_profile?: {
    id: string;
    full_name: string;
  } | null;
}

// Security settings type (role permissions configuration)
export interface SecurityRolePermissions {
  register_contacts: UserRole[];
  generate_codes: UserRole[];
  update_contacts: UserRole[];
  verify_codes: UserRole[];
  record_checkin: UserRole[];
  view_contacts: UserRole[];
  search_contacts: UserRole[];
  export_contacts: UserRole[];
  suspend_revoke_contacts: UserRole[];
  configure_categories: UserRole[];
  view_access_logs: UserRole[];
}

// Default security role permissions
export const DEFAULT_SECURITY_PERMISSIONS: SecurityRolePermissions = {
  register_contacts: ['admin', 'chairman', 'financial_secretary'],
  generate_codes: ['admin', 'chairman', 'financial_secretary'],
  update_contacts: ['admin', 'chairman', 'financial_secretary'],
  verify_codes: ['admin', 'chairman', 'financial_secretary', 'security_officer'],
  record_checkin: ['admin', 'chairman', 'financial_secretary', 'security_officer'],
  view_contacts: ['admin', 'chairman', 'financial_secretary', 'security_officer'],
  search_contacts: ['admin', 'chairman', 'financial_secretary', 'security_officer'],
  export_contacts: ['admin', 'chairman', 'financial_secretary', 'security_officer'],
  suspend_revoke_contacts: ['admin', 'chairman'],
  configure_categories: ['admin'],
  view_access_logs: ['admin', 'chairman'],
};

// ============================================
// Phase 6 (NEW): Bank Statement Import Types
// ============================================

// Import status for bank statement imports
export type ImportStatus = 'pending' | 'processing' | 'awaiting_approval' | 'approved' | 'completed' | 'failed' | 'rejected';

// Transaction filter options
export type TransactionFilter = 'credit' | 'debit' | 'all';

// Match confidence levels
export type MatchConfidence = 'high' | 'medium' | 'low' | 'none' | 'manual';

// Match methods for resident matching
export type MatchMethod = 'alias' | 'phone' | 'name' | 'house_number' | 'manual';

// Import row status
export type ImportRowStatus = 'pending' | 'matched' | 'unmatched' | 'duplicate' | 'created' | 'skipped' | 'error';

// Labels for import statuses
export const IMPORT_STATUS_LABELS: Record<ImportStatus, string> = {
  pending: 'Pending',
  processing: 'Processing',
  awaiting_approval: 'Awaiting Approval',
  approved: 'Approved',
  completed: 'Completed',
  failed: 'Failed',
  rejected: 'Rejected',
};

export const MATCH_CONFIDENCE_LABELS: Record<MatchConfidence, string> = {
  high: 'High',
  medium: 'Medium',
  low: 'Low',
  none: 'No Match',
  manual: 'Manual',
};

export const MATCH_METHOD_LABELS: Record<MatchMethod, string> = {
  alias: 'Payment Alias',
  phone: 'Phone Number',
  name: 'Name Match',
  house_number: 'House Number',
  manual: 'Manual Assignment',
};

export const IMPORT_ROW_STATUS_LABELS: Record<ImportRowStatus, string> = {
  pending: 'Pending',
  matched: 'Matched',
  unmatched: 'Unmatched',
  duplicate: 'Duplicate',
  created: 'Created',
  skipped: 'Skipped',
  error: 'Error',
};

export const TRANSACTION_FILTER_LABELS: Record<TransactionFilter, string> = {
  credit: 'Credits Only',
  debit: 'Debits Only',
  all: 'All Transactions',
};

// Resident Payment Alias type
export interface ResidentPaymentAlias {
  id: string;
  resident_id: string;
  alias_name: string;
  notes: string | null;
  is_active: boolean;
  created_at: string;
  created_by: string | null;
}

// Estate Bank Account type
export interface EstateBankAccount {
  id: string;
  account_number: string;
  account_name: string;
  bank_name: string;
  description: string | null;
  is_active: boolean;
  created_at: string;
}

// Bank Statement Import type
export interface BankStatementImport {
  id: string;
  file_name: string;
  file_type: 'csv' | 'xlsx';
  bank_account_id: string | null;
  bank_name: string;
  transaction_filter: TransactionFilter;
  total_rows: number;
  matched_rows: number;
  created_rows: number;
  skipped_rows: number;
  error_rows: number;
  status: ImportStatus;
  column_mapping: Record<string, string> | null;
  import_summary: Record<string, unknown> | null;
  created_by: string | null;
  approved_by: string | null;
  approved_at: string | null;
  created_at: string;
  completed_at: string | null;
}

// Bank Statement Row type
export interface BankStatementRow {
  id: string;
  import_id: string;
  row_number: number;
  raw_data: Record<string, unknown>;
  transaction_date: string | null;
  description: string | null;
  amount: number | null;
  transaction_type: 'credit' | 'debit' | null;
  reference: string | null;
  matched_resident_id: string | null;
  match_confidence: MatchConfidence | null;
  match_method: MatchMethod | null;
  status: ImportRowStatus;
  payment_id: string | null;
  error_message: string | null;
  created_at: string;
  // New assignment fields
  matched_petty_cash_account_id: string | null;
  matched_project_id: string | null;
  matched_expense_category_id: string | null;
  // Transaction tag fields
  tag_id: string | null;
  tagged_by: string | null;
  tagged_at: string | null;
  auto_tagged: boolean;
}

// Bank Statement Import with related data
export interface BankStatementImportWithDetails extends BankStatementImport {
  bank_account: EstateBankAccount | null;
  created_by_profile: {
    id: string;
    full_name: string;
    email: string;
  } | null;
  approved_by_profile: {
    id: string;
    full_name: string;
    email: string;
  } | null;
}

// Bank Statement Row with resident details (for review UI)
export interface BankStatementRowWithResident extends BankStatementRow {
  matched_resident: {
    id: string;
    first_name: string;
    last_name: string;
    resident_code: string;
    phone_primary: string;
    entity_type: EntityType;
    company_name: string | null;
  } | null;
}

// Parsed bank statement row (before database insert)
export interface ParsedStatementRow {
  rowNumber: number;
  rawData: Record<string, unknown>;
  transactionDate: Date | null;
  description: string | null;
  amount: number | null;
  transactionType: 'credit' | 'debit' | null;
  reference: string | null;
}

// Column mapping configuration
export interface ColumnMapping {
  date: string;
  description: string;
  credit: string;
  debit: string;
  reference: string;
  balance?: string;
}

// Bank format configuration
export interface BankFormatConfig {
  name: string;
  bankName: string;
  dateFormat: string;
  defaultColumns: ColumnMapping;
  headerRowIndex: number;
  skipRows?: number[];
}

// Match result from matching engine
export interface MatchResult {
  residentId: string | null;
  confidence: MatchConfidence;
  method: MatchMethod | null;
  matchedValue: string | null; // The value that matched (e.g., alias name, phone number)
}

// ============================================================
// Transaction Tags (for categorizing imported bank statement rows)
// ============================================================

export type TransactionTagType = 'credit' | 'debit';

export type TransactionTagColor = 'gray' | 'blue' | 'green' | 'red' | 'yellow' | 'purple' | 'orange';

export const TRANSACTION_TAG_TYPE_LABELS: Record<TransactionTagType, string> = {
  credit: 'Credit (Incoming)',
  debit: 'Debit (Outgoing)',
};

export const TRANSACTION_TAG_COLOR_LABELS: Record<TransactionTagColor, string> = {
  gray: 'Gray',
  blue: 'Blue',
  green: 'Green',
  red: 'Red',
  yellow: 'Yellow',
  purple: 'Purple',
  orange: 'Orange',
};

export interface TransactionTag {
  id: string;
  name: string;
  transaction_type: TransactionTagType;
  description: string | null;
  color: TransactionTagColor;
  is_active: boolean;
  sort_order: number;
  keywords: string[];
  created_at: string;
  updated_at: string;
}

// For creating/updating tags
export interface TransactionTagInsert {
  name: string;
  transaction_type: TransactionTagType;
  description?: string | null;
  color?: TransactionTagColor;
  is_active?: boolean;
  sort_order?: number;
  keywords?: string[];
}

export interface TransactionTagUpdate {
  name?: string;
  transaction_type?: TransactionTagType;
  description?: string | null;
  color?: TransactionTagColor;
  is_active?: boolean;
  sort_order?: number;
  keywords?: string[];
}

// ============================================================
// Expense Categories (for categorizing estate expenditures)
// ============================================================

// Reuse TransactionTagColor for expense category colors
export type ExpenseCategoryColor = TransactionTagColor;

export interface ExpenseCategory {
  id: string;
  name: string;
  description: string | null;
  keywords: string[];
  color: ExpenseCategoryColor;
  is_active: boolean;
  sort_order: number;
  created_at: string;
  updated_at: string;
}

export interface ExpenseCategoryInsert {
  name: string;
  description?: string | null;
  keywords?: string[];
  color?: ExpenseCategoryColor;
  is_active?: boolean;
  sort_order?: number;
}

export interface ExpenseCategoryUpdate {
  name?: string;
  description?: string | null;
  keywords?: string[];
  color?: ExpenseCategoryColor;
  is_active?: boolean;
  sort_order?: number;
}

// ============================================================
// Phase 10: RBAC Types
// ============================================================

// App Role (from app_roles table)
export interface AppRole {
  id: string;
  name: AppRoleName;
  display_name: string;
  description: string | null;
  category: RoleCategory;
  level: number;
  is_system_role: boolean;
  is_active: boolean;
  can_be_assigned_to_resident: boolean;
  created_at: string;
  updated_at: string;
  created_by: string | null;
}

export interface AppRoleInsert {
  name: string;
  display_name: string;
  description?: string | null;
  category?: RoleCategory;
  level?: number;
  is_system_role?: boolean;
  is_active?: boolean;
  can_be_assigned_to_resident?: boolean;
}

export interface AppRoleUpdate {
  display_name?: string;
  description?: string | null;
  category?: RoleCategory;
  level?: number;
  is_active?: boolean;
  can_be_assigned_to_resident?: boolean;
}

// App Permission (from app_permissions table)
export interface AppPermission {
  id: string;
  name: string;
  display_name: string;
  description: string | null;
  category: PermissionCategory;
  is_active: boolean;
  created_at: string;
}

// Role Permission junction (from role_permissions table)
export interface RolePermission {
  id: string;
  role_id: string;
  permission_id: string;
  created_at: string;
  created_by: string | null;
}

// Role with permissions (for UI display)
export interface AppRoleWithPermissions extends AppRole {
  permissions: AppPermission[];
}

// Profile with role details (new RBAC)
export interface ProfileWithRole {
  id: string;
  email: string;
  full_name: string;
  role_id: string | null;
  role: AppRole | null;
  created_at: string;
  updated_at: string;
}

// Permission check result
export interface PermissionCheckResult {
  hasPermission: boolean;
  permissions: string[];
  roleName: AppRoleName | null;
}

// Role Assignment Rules (for configuring which resident types can be assigned which roles)
export interface RoleAssignmentRule {
  id: string;
  resident_role: ResidentRole;
  app_role_id: string;
  is_allowed: boolean;
  created_at: string;
  updated_at: string;
  created_by: string | null;
}

export interface RoleAssignmentRuleInsert {
  resident_role: ResidentRole;
  app_role_id: string;
  is_allowed?: boolean;
}

export interface RoleAssignmentRuleUpdate {
  is_allowed?: boolean;
}

// Role assignment rule with role details for UI
export interface RoleAssignmentRuleWithRole extends RoleAssignmentRule {
  app_role: {
    id: string;
    name: AppRoleName;
    display_name: string;
  };
}

// =====================================================
// Phase 15: Document Management Types
// =====================================================

// Document category (from document_categories table)
export interface DocumentCategory {
  id: string;
  name: string;
  description: string | null;
  is_resident_accessible: boolean;
  is_active: boolean;
  display_order: number;
  created_at: string;
  updated_at: string;
}

// Allowed document file types
export type DocumentFileType = 'pdf' | 'docx' | 'xlsx' | 'txt';

// Allowed MIME types for document upload
export const ALLOWED_DOCUMENT_MIME_TYPES = [
  'application/pdf',
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document', // DOCX
  'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet', // XLSX
  'text/plain', // TXT
] as const;

export const DOCUMENT_MIME_TYPE_LABELS: Record<string, string> = {
  'application/pdf': 'PDF Document',
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document': 'Word Document',
  'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet': 'Excel Spreadsheet',
  'text/plain': 'Text File',
};

export const DOCUMENT_FILE_EXTENSIONS: Record<string, string> = {
  'application/pdf': '.pdf',
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document': '.docx',
  'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet': '.xlsx',
  'text/plain': '.txt',
};

// Maximum file size for document upload (50MB)
export const MAX_DOCUMENT_FILE_SIZE = 50 * 1024 * 1024;

// Document (from documents table)
export interface Document {
  id: string;
  title: string;
  description: string | null;
  file_name: string;
  file_path: string;
  file_type: string | null;
  file_size_bytes: number | null;
  mime_type: string | null;
  category_id: string | null;
  resident_id: string | null;
  house_id: string | null;
  version: number;
  parent_document_id: string | null;
  uploaded_by: string;
  is_archived: boolean;
  created_at: string;
  updated_at: string;
}

// Document with relations
export interface DocumentWithRelations extends Document {
  category: DocumentCategory | null;
  uploader: {
    id: string;
    full_name: string;
  } | null;
  resident: {
    id: string;
    full_name: string;
  } | null;
  house: {
    id: string;
    unit_number: string;
    street: { name: string } | null;
  } | null;
}

// Document access log action types
export type DocumentAccessAction = 'view' | 'download' | 'upload' | 'update' | 'delete';

// Document access log (from document_access_logs table)
export interface DocumentAccessLog {
  id: string;
  document_id: string;
  accessed_by: string;
  action: DocumentAccessAction;
  ip_address: string | null;
  user_agent: string | null;
  accessed_at: string;
}

// Document access log with relations
export interface DocumentAccessLogWithRelations extends DocumentAccessLog {
  document: Document;
  user: {
    id: string;
    full_name: string;
  };
}

// Document upload input
export interface DocumentUploadInput {
  title: string;
  description?: string;
  category_id?: string;
  file: File;
}

// Document update input
export interface DocumentUpdateInput {
  title?: string;
  description?: string;
  category_id?: string | null;
  is_archived?: boolean;
}

// Document list filter params
export interface DocumentListParams {
  category_id?: string;
  search?: string;
  is_archived?: boolean;
  uploaded_by?: string;
  from_date?: string;
  to_date?: string;
  page?: number;
  limit?: number;
}

// =====================================================
// Contact Verification Types
// =====================================================

// Verification type enum (matches database)
export type VerificationType = 'email' | 'phone';

// Verification token from database
export interface VerificationToken {
  id: string;
  resident_id: string;
  token_type: VerificationType;
  token: string;
  target_value: string;
  expires_at: string;
  used_at: string | null;
  created_at: string;
}

// Result of sending a verification code
export interface SendVerificationResult {
  success: boolean;
  message: string;
  expiresAt?: string;
}

// Result of verifying a code
export interface VerifyCodeResult {
  success: boolean;
  message: string;
  verifiedAt?: string;
}

// Resident verification status (simple format)
export interface ResidentVerificationStatus {
  email: string | null;
  emailVerifiedAt: string | null;
  phone: string | null;
  phoneVerifiedAt: string | null;
  isEmailVerified: boolean;
  isPhoneVerified: boolean;
  hasVerifiedContact: boolean;
}

// Contact verification status (detailed format used by getVerificationStatus)
export interface ContactVerificationStatus {
  email: {
    value: string | null;
    verified: boolean;
    verified_at: string | null;
  };
  phone: {
    value: string | null;
    verified: boolean;
    verified_at: string | null;
  };
}

// =====================================================
// Phase 16: Announcements & Community Communication
// =====================================================

// Announcement status enum
export type AnnouncementStatus = 'draft' | 'scheduled' | 'published' | 'archived';

// Announcement priority enum
export type AnnouncementPriority = 'low' | 'normal' | 'high' | 'emergency';

// Target audience enum
export type TargetAudience = 'all' | 'residents' | 'owners' | 'tenants' | 'staff';

// In-app notification priority
export type NotificationPriority = 'low' | 'normal' | 'high' | 'urgent';

// Announcement category labels
export const ANNOUNCEMENT_CATEGORY_COLORS: Record<string, string> = {
  blue: 'bg-blue-500/10 text-blue-700 border-blue-200 dark:text-blue-400 dark:border-blue-800',
  orange: 'bg-orange-500/10 text-orange-700 border-orange-200 dark:text-orange-400 dark:border-orange-800',
  red: 'bg-red-500/10 text-red-700 border-red-200 dark:text-red-400 dark:border-red-800',
  purple: 'bg-purple-500/10 text-purple-700 border-purple-200 dark:text-purple-400 dark:border-purple-800',
  green: 'bg-green-500/10 text-green-700 border-green-200 dark:text-green-400 dark:border-green-800',
};

// Priority colors
export const ANNOUNCEMENT_PRIORITY_COLORS: Record<AnnouncementPriority, string> = {
  low: 'bg-gray-500/10 text-gray-700 border-gray-200 dark:text-gray-400 dark:border-gray-700',
  normal: 'bg-blue-500/10 text-blue-700 border-blue-200 dark:text-blue-400 dark:border-blue-800',
  high: 'bg-orange-500/10 text-orange-700 border-orange-200 dark:text-orange-400 dark:border-orange-800',
  emergency: 'bg-red-500/10 text-red-700 border-red-200 dark:text-red-400 dark:border-red-800',
};

// Status colors
export const ANNOUNCEMENT_STATUS_COLORS: Record<AnnouncementStatus, string> = {
  draft: 'bg-gray-500/10 text-gray-700 border-gray-200 dark:text-gray-400 dark:border-gray-700',
  scheduled: 'bg-purple-500/10 text-purple-700 border-purple-200 dark:text-purple-400 dark:border-purple-800',
  published: 'bg-green-500/10 text-green-700 border-green-200 dark:text-green-400 dark:border-green-800',
  archived: 'bg-amber-500/10 text-amber-700 border-amber-200 dark:text-amber-400 dark:border-amber-800',
};

// Priority labels
export const ANNOUNCEMENT_PRIORITY_LABELS: Record<AnnouncementPriority, string> = {
  low: 'Low',
  normal: 'Normal',
  high: 'High',
  emergency: 'Emergency',
};

// Status labels
export const ANNOUNCEMENT_STATUS_LABELS: Record<AnnouncementStatus, string> = {
  draft: 'Draft',
  scheduled: 'Scheduled',
  published: 'Published',
  archived: 'Archived',
};

// Target audience labels
export const TARGET_AUDIENCE_LABELS: Record<TargetAudience, string> = {
  all: 'All Residents',
  residents: 'All Residents',
  owners: 'Property Owners',
  tenants: 'Tenants Only',
  staff: 'Staff Only',
};

// Announcement category from database
export interface AnnouncementCategory {
  id: string;
  name: string;
  slug: string;
  description: string | null;
  icon: string | null;
  color: string | null;
  display_order: number | null;
  is_active: boolean | null;
  created_at: string | null;
  updated_at: string | null;
}

// Announcement from database
export interface Announcement {
  id: string;
  title: string;
  content: string;
  summary: string | null;
  category_id: string | null;
  status: AnnouncementStatus | null;
  priority: AnnouncementPriority | null;
  target_audience: TargetAudience | null;
  target_houses: string[] | null;
  is_pinned: boolean | null;
  published_at: string | null;
  scheduled_for: string | null;
  expires_at: string | null;
  attachment_urls: string[] | null;
  created_by: string | null;
  updated_by: string | null;
  created_at: string | null;
  updated_at: string | null;
}

// Announcement with relations
export interface AnnouncementWithRelations extends Announcement {
  category: AnnouncementCategory | null;
  creator: {
    id: string;
    full_name: string;
  } | null;
  updater: {
    id: string;
    full_name: string;
  } | null;
  read_count?: number;
  is_read?: boolean;
}

// Announcement read receipt
export interface AnnouncementReadReceipt {
  id: string;
  announcement_id: string;
  resident_id: string;
  read_at: string | null;
}

// In-app notification from database
export interface InAppNotification {
  id: string;
  recipient_id: string;
  title: string;
  body: string;
  icon: string | null;
  category: string;
  entity_type: string | null;
  entity_id: string | null;
  action_url: string | null;
  is_read: boolean;
  read_at: string | null;
  priority: string;
  metadata: Record<string, unknown>;
  created_at: string;
  expires_at: string | null;
}

// Message template from database
export interface MessageTemplate {
  id: string;
  name: string;
  category_id: string | null;
  title_template: string;
  content_template: string;
  variables: Array<{
    name: string;
    description?: string;
    required?: boolean;
  }>;
  is_active: boolean | null;
  created_by: string | null;
  created_at: string | null;
  updated_at: string | null;
}

// Message template with category relation
export interface MessageTemplateWithCategory extends MessageTemplate {
  category: AnnouncementCategory | null;
}

// Report subscription from database
export interface ReportSubscription {
  id: string;
  resident_id: string;
  receive_monthly_summary: boolean;
  receive_quarterly_report: boolean;
  receive_payment_confirmation: boolean;
  receive_invoice_reminder: boolean;
  email_enabled: boolean;
  push_enabled: boolean;
  preferred_day_of_month: number;
  created_at: string | null;
  updated_at: string | null;
}

// Announcement create/update input
export interface AnnouncementInput {
  title: string;
  content: string;
  summary?: string;
  category_id?: string | null;
  status?: AnnouncementStatus;
  priority?: AnnouncementPriority;
  target_audience?: TargetAudience;
  target_houses?: string[];
  is_pinned?: boolean;
  scheduled_for?: string | null;
  expires_at?: string | null;
  attachment_urls?: string[];
}

// Announcement list filter params
export interface AnnouncementListParams {
  status?: AnnouncementStatus;
  category_id?: string;
  priority?: AnnouncementPriority;
  search?: string;
  is_pinned?: boolean;
  from_date?: string;
  to_date?: string;
  page?: number;
  limit?: number;
}

// In-app notification list params
export interface NotificationListParams {
  category?: string;
  is_read?: boolean;
  page?: number;
  limit?: number;
}

// Report subscription update input
export interface ReportSubscriptionInput {
  receive_monthly_summary?: boolean;
  receive_quarterly_report?: boolean;
  receive_payment_confirmation?: boolean;
  receive_invoice_reminder?: boolean;
  email_enabled?: boolean;
  push_enabled?: boolean;
  preferred_day_of_month?: number;
}

// =====================================================
// Admin Impersonation System Types
// =====================================================

// Session type determines if approval was required
export type ImpersonationSessionType = 'direct' | 'approved';

// Impersonation session from database
export interface ImpersonationSession {
  id: string;
  admin_profile_id: string;
  impersonated_resident_id: string;
  started_at: string;
  ended_at: string | null;
  is_active: boolean;
  session_type: ImpersonationSessionType;
  approval_request_id: string | null;
  page_views: Array<{ path: string; timestamp: string }>;
  created_at: string;
  updated_at: string;
}

// Impersonation session with related data for UI
export interface ImpersonationSessionWithDetails extends ImpersonationSession {
  admin: {
    id: string;
    full_name: string;
    email: string;
  };
  resident: {
    id: string;
    first_name: string;
    last_name: string;
    resident_code: string;
  };
  house: {
    id: string;
    address: string;
    short_name: string | null;
  } | null;
}

// Impersonation session insert input
export interface ImpersonationSessionInsert {
  admin_profile_id: string;
  impersonated_resident_id: string;
  session_type?: ImpersonationSessionType;
  approval_request_id?: string | null;
}

// Impersonation state stored in session storage
export interface ImpersonationState {
  isActive: boolean;
  sessionId: string | null;
  impersonatedResidentId: string | null;
  impersonatedResidentName: string | null;
  impersonatedHouseAddress: string | null;
  startedAt: string | null;
}

// Resident info for impersonation selector
export interface ResidentForImpersonation {
  id: string;
  first_name: string;
  last_name: string;
  email: string | null;
  phone_primary: string | null;
  resident_code: string;
  avatar_url: string | null;
  portal_enabled: boolean;
  house: {
    id: string;
    address: string;
    short_name: string | null;
    street_name: string;
  } | null;
}

// Impersonation approval request data (stored in approval_requests.requested_changes)
export interface ImpersonationApprovalData {
  resident_id: string;
  resident_name: string;
  resident_code: string;
  house_address: string | null;
  reason?: string;
  [key: string]: unknown; // Index signature for Record compatibility
}

// =====================================================
// Notes Module Types
// =====================================================

// Note entity type (polymorphic - can link to resident or house)
export type NoteEntityType = 'resident' | 'house';

// Note categories for organization
export type NoteCategory =
  | 'general'
  | 'agreement'
  | 'complaint'
  | 'reminder'
  | 'financial'
  | 'security'
  | 'maintenance'
  | 'legal';

// Category display labels
export const NOTE_CATEGORY_LABELS: Record<NoteCategory, string> = {
  general: 'General',
  agreement: 'Agreement',
  complaint: 'Complaint',
  reminder: 'Reminder',
  financial: 'Financial',
  security: 'Security',
  maintenance: 'Maintenance',
  legal: 'Legal',
};

// Category colors for badges
export const NOTE_CATEGORY_COLORS: Record<NoteCategory, string> = {
  general: 'bg-gray-500/10 text-gray-700 border-gray-200 dark:text-gray-400 dark:border-gray-700',
  agreement: 'bg-blue-500/10 text-blue-700 border-blue-200 dark:text-blue-400 dark:border-blue-800',
  complaint: 'bg-red-500/10 text-red-700 border-red-200 dark:text-red-400 dark:border-red-800',
  reminder: 'bg-yellow-500/10 text-yellow-700 border-yellow-200 dark:text-yellow-400 dark:border-yellow-800',
  financial: 'bg-green-500/10 text-green-700 border-green-200 dark:text-green-400 dark:border-green-800',
  security: 'bg-purple-500/10 text-purple-700 border-purple-200 dark:text-purple-400 dark:border-purple-800',
  maintenance: 'bg-orange-500/10 text-orange-700 border-orange-200 dark:text-orange-400 dark:border-orange-800',
  legal: 'bg-indigo-500/10 text-indigo-700 border-indigo-200 dark:text-indigo-400 dark:border-indigo-800',
};

// Category icons (Lucide icon names)
export const NOTE_CATEGORY_ICONS: Record<NoteCategory, string> = {
  general: 'StickyNote',
  agreement: 'FileSignature',
  complaint: 'AlertTriangle',
  reminder: 'Bell',
  financial: 'DollarSign',
  security: 'Shield',
  maintenance: 'Wrench',
  legal: 'Scale',
};

// Base entity note type (from database)
export interface EntityNote {
  id: string;
  entity_type: NoteEntityType;
  entity_id: string;
  title: string | null;
  content: string;
  category: NoteCategory;
  is_confidential: boolean;
  confidential_roles: string[] | null;
  document_id: string | null;
  version: number;
  parent_note_id: string | null;
  is_current: boolean;
  created_by: string;
  created_at: string;
  updated_at: string;
}

// Note with related data (for display)
export interface EntityNoteWithRelations extends EntityNote {
  created_by_profile: {
    id: string;
    full_name: string;
  } | null;
  document: {
    id: string;
    title: string;
    file_type: string | null;
  } | null;
  version_count?: number;
}

// Note version (for history view)
export interface NoteVersion {
  id: string;
  version: number;
  title: string | null;
  content: string;
  category: NoteCategory;
  is_current: boolean;
  created_by_profile: {
    id: string;
    full_name: string;
  } | null;
  created_at: string;
}

// Input for creating a new note
export interface CreateNoteInput {
  entity_type: NoteEntityType;
  entity_id: string;
  title?: string;
  content: string;
  category?: NoteCategory;
  is_confidential?: boolean;
  confidential_roles?: string[];
  document_id?: string | null;
}

// Input for updating an existing note (creates new version)
export interface UpdateNoteInput {
  title?: string;
  content: string;
  category?: NoteCategory;
  is_confidential?: boolean;
  confidential_roles?: string[];
  document_id?: string | null;
}

// List params for filtering notes
export interface NoteListParams {
  entity_type: NoteEntityType;
  entity_id: string;
  category?: NoteCategory;
  is_confidential?: boolean;
  include_history?: boolean;
  page?: number;
  limit?: number;
}

// ============================================================
// Phase 17: Email Import Types (Gmail Bank Statement Integration)
// ============================================================

// Email import status (workflow states)
export type EmailImportStatus =
  | 'pending'
  | 'fetching'
  | 'parsing'
  | 'matching'
  | 'processing'
  | 'completed'
  | 'failed';

export const EMAIL_IMPORT_STATUS_LABELS: Record<EmailImportStatus, string> = {
  pending: 'Pending',
  fetching: 'Fetching Emails',
  parsing: 'Parsing Emails',
  matching: 'Matching Residents',
  processing: 'Processing Transactions',
  completed: 'Completed',
  failed: 'Failed',
};

// Email import trigger types
export type EmailImportTrigger = 'manual' | 'cron';

// Email message classification
export type EmailMessageType = 'transaction_alert' | 'statement_attachment' | 'unknown';

export const EMAIL_MESSAGE_TYPE_LABELS: Record<EmailMessageType, string> = {
  transaction_alert: 'Transaction Alert',
  statement_attachment: 'Statement PDF',
  unknown: 'Unknown',
};

// Email message processing status
export type EmailProcessingStatus = 'pending' | 'parsed' | 'skipped' | 'error';

// Email transaction status (workflow states)
export type EmailTransactionStatus =
  | 'pending'           // Awaiting matching
  | 'matched'           // Matched to resident
  | 'auto_processed'    // High-confidence auto-processed
  | 'queued_for_review' // Queued for admin review
  | 'processed'         // Manually processed
  | 'skipped'           // Skipped
  | 'error';            // Error

export const EMAIL_TRANSACTION_STATUS_LABELS: Record<EmailTransactionStatus, string> = {
  pending: 'Pending',
  matched: 'Matched',
  auto_processed: 'Auto-Processed',
  queued_for_review: 'Needs Review',
  processed: 'Processed',
  skipped: 'Skipped',
  error: 'Error',
};

// Gmail OAuth sync status
export type GmailSyncStatus = 'success' | 'error' | 'partial';

// ============================================================
// Email Import Interfaces
// ============================================================

// Gmail OAuth credentials
export interface GmailOAuthCredentials {
  id: string;
  email_address: string;
  access_token_encrypted: string;
  refresh_token_encrypted: string;
  token_expiry: string;
  scopes: string[];
  is_active: boolean;
  last_sync_at: string | null;
  last_sync_status: GmailSyncStatus | null;
  last_sync_message: string | null;
  last_sync_emails_count: number;
  created_at: string;
  updated_at: string;
  created_by: string | null;
}

// Estate bank account password (for PDF decryption)
export interface EstateBankAccountPassword {
  id: string;
  bank_account_id: string;
  password_encrypted: string;
  created_at: string;
  updated_at: string;
  updated_by: string | null;
}

// Email import session
export interface EmailImport {
  id: string;
  source_email: string;
  bank_name: string;
  trigger_type: EmailImportTrigger;
  emails_fetched: number;
  emails_parsed: number;
  emails_skipped: number;
  emails_errored: number;
  transactions_extracted: number;
  transactions_matched: number;
  transactions_auto_processed: number;
  transactions_queued: number;
  transactions_skipped: number;
  transactions_errored: number;
  status: EmailImportStatus;
  error_message: string | null;
  import_summary: Record<string, unknown> | null;
  started_at: string | null;
  completed_at: string | null;
  created_at: string;
  created_by: string | null;
}

// Email import with creator profile
export interface EmailImportWithDetails extends EmailImport {
  created_by_profile: {
    id: string;
    full_name: string;
    email: string;
  } | null;
}

// Email message (individual email)
export interface EmailMessage {
  id: string;
  email_import_id: string;
  gmail_message_id: string;
  gmail_thread_id: string | null;
  subject: string | null;
  from_address: string | null;
  to_address: string | null;
  received_at: string | null;
  email_type: EmailMessageType;
  raw_content_path: string | null;
  attachments: EmailAttachment[];
  processing_status: EmailProcessingStatus;
  processing_error: string | null;
  transactions_extracted: number;
  processed_at: string | null;
  created_at: string;
}

// Email attachment metadata
export interface EmailAttachment {
  name: string;
  path: string;
  size: number;
  mimeType: string;
}

// Email transaction (extracted from email)
export interface EmailTransaction {
  id: string;
  email_message_id: string;
  email_import_id: string;
  transaction_date: string | null;
  description: string | null;
  amount: number | null;
  transaction_type: 'credit' | 'debit' | null;
  reference: string | null;
  bank_account_last4: string | null;
  raw_extracted_data: Record<string, unknown> | null;
  matched_resident_id: string | null;
  matched_project_id: string | null;
  matched_petty_cash_account_id: string | null;
  matched_expense_category_id: string | null;
  tag_id: string | null;
  match_confidence: MatchConfidence | null;
  match_method: MatchMethod | null;
  match_details: Record<string, unknown> | null;
  status: EmailTransactionStatus;
  payment_id: string | null;
  expense_id: string | null;
  skip_reason: string | null;
  error_message: string | null;
  reviewed_by: string | null;
  reviewed_at: string | null;
  review_notes: string | null;
  matched_at: string | null;
  processed_at: string | null;
  created_at: string;
}

// Email transaction with resident details
export interface EmailTransactionWithResident extends EmailTransaction {
  matched_resident: {
    id: string;
    first_name: string;
    last_name: string;
    resident_code: string;
    phone_primary: string | null;
    entity_type: EntityType;
    company_name: string | null;
  } | null;
  email_message: {
    id: string;
    subject: string | null;
    from_address: string | null;
    received_at: string | null;
    email_type: EmailMessageType;
  } | null;
  reviewed_by_profile: {
    id: string;
    full_name: string;
  } | null;
}

// Gmail connection status (for UI)
export interface GmailConnectionStatus {
  connected: boolean;
  email: string | null;
  lastSyncAt: string | null;
  lastSyncStatus: GmailSyncStatus | null;
  lastSyncMessage: string | null;
  lastSyncEmailsCount: number | null;
}

// Parsed transaction from email (before database insert)
export interface ParsedEmailTransaction {
  transactionDate: Date | null;
  description: string | null;
  amount: number | null;
  transactionType: 'credit' | 'debit' | null;
  reference: string | null;
  bankAccountLast4: string | null;
  rawExtractedData?: Record<string, unknown>;
}

// Email fetch options
export interface FetchEmailsOptions {
  trigger?: EmailImportTrigger;
  maxEmails?: number;
  sinceDays?: number;
}

// Email fetch result
export interface FetchEmailsResult {
  success: boolean;
  importId: string | null;
  emailsFetched: number;
  emailsSkipped: number;
  emailsErrored: number;
  error?: string | null;
}

// Process email transactions options
export interface ProcessEmailTransactionsOptions {
  autoProcessHighConfidence?: boolean;
  skipDuplicates?: boolean;
  duplicateToleranceDays?: number;
}

// Process email transactions result
export interface ProcessEmailTransactionsResult {
  success: boolean;
  autoProcessed: number;
  queuedForReview: number;
  skipped: number;
  errored: number;
  expensesCreated: number;
  error?: string;
}

// Add to AuditEntityType
export type EmailImportAuditEntityType =
  | 'gmail_oauth_credentials'
  | 'email_imports'
  | 'email_messages'
  | 'email_transactions'
  | 'estate_bank_account_passwords';

// ============================================
// Late Fee Waiver Types
// ============================================

export type LateFeeWaiverType = 'full' | 'partial';
export type LateFeeWaiverStatus = 'pending' | 'approved' | 'rejected';

export const LATE_FEE_WAIVER_TYPE_LABELS: Record<LateFeeWaiverType, string> = {
  full: 'Full Waiver',
  partial: 'Partial Waiver',
};

export const LATE_FEE_WAIVER_STATUS_LABELS: Record<LateFeeWaiverStatus, string> = {
  pending: 'Pending Approval',
  approved: 'Approved',
  rejected: 'Rejected',
};

export interface LateFeeWaiver {
  id: string;
  invoice_id: string;
  resident_id: string;
  requested_by: string;
  reason: string;
  waiver_type: LateFeeWaiverType;
  waiver_amount: number | null;
  original_late_fee: number;
  status: LateFeeWaiverStatus;
  reviewed_by: string | null;
  reviewed_at: string | null;
  review_notes: string | null;
  created_at: string;
  updated_at: string;
}

export interface LateFeeWaiverWithDetails extends LateFeeWaiver {
  invoice: {
    id: string;
    invoice_number: string;
    amount_due: number;
    due_date: string;
    status: InvoiceStatus;
  };
  resident: {
    id: string;
    first_name: string;
    last_name: string;
    resident_code: string;
  };
  requester: {
    id: string;
    full_name: string;
    email: string;
  };
  reviewer?: {
    id: string;
    full_name: string;
    email: string;
  } | null;
}

export interface LateFeeLog {
  id: string;
  run_date: string;
  trigger_type: 'manual' | 'cron' | 'api';
  triggered_by: string | null;
  invoices_processed: number;
  fees_applied: number;
  total_fees_amount: number;
  invoices_skipped_waiver: number;
  invoices_skipped_already_applied: number;
  errors: string[];
  duration_ms: number | null;
  created_at: string;
}

// =====================================================
// Two-Factor Authentication (2FA) Types
// =====================================================

// 2FA method enum
export type TwoFactorMethod = 'sms' | 'authenticator' | 'email';

// 2FA enforcement policy enum
export type TwoFactorEnforcement = 'disabled' | 'optional' | 'required_admin' | 'required_all';

// 2FA action types for audit log
export type TwoFactorAuditAction =
  | 'enabled'
  | 'disabled'
  | 'verified_login'
  | 'failed_login'
  | 'backup_code_used'
  | 'recovery_initiated'
  | 'method_changed'
  | 'secret_regenerated'
  | 'settings_updated';

// 2FA token purpose
export type TwoFactorTokenPurpose = 'login' | 'setup' | 'disable' | 'recovery';

// Labels for 2FA methods
export const TWO_FACTOR_METHOD_LABELS: Record<TwoFactorMethod, string> = {
  sms: 'SMS Code',
  authenticator: 'Authenticator App',
  email: 'Email Code',
};

// Labels for 2FA enforcement policies
export const TWO_FACTOR_ENFORCEMENT_LABELS: Record<TwoFactorEnforcement, string> = {
  disabled: 'Disabled',
  optional: 'Optional',
  required_admin: 'Required for Admins',
  required_all: 'Required for All Users',
};

// Labels for 2FA audit actions
export const TWO_FACTOR_AUDIT_ACTION_LABELS: Record<TwoFactorAuditAction, string> = {
  enabled: '2FA Enabled',
  disabled: '2FA Disabled',
  verified_login: 'Login Verified',
  failed_login: 'Login Failed',
  backup_code_used: 'Backup Code Used',
  recovery_initiated: 'Recovery Initiated',
  method_changed: 'Method Changed',
  secret_regenerated: 'Secret Regenerated',
  settings_updated: 'Settings Updated',
};

// Profile 2FA fields (extends base Profile)
export interface Profile2FA {
  two_factor_enabled: boolean;
  two_factor_method: TwoFactorMethod | null;
  two_factor_verified_at: string | null;
  two_factor_last_verified_at: string | null;
  two_factor_recovery_codes_used: number;
}

// 2FA token from database
export interface TwoFactorToken {
  id: string;
  profile_id: string;
  token: string;
  token_type: TwoFactorMethod;
  purpose: TwoFactorTokenPurpose;
  expires_at: string;
  used_at: string | null;
  ip_address: string | null;
  user_agent: string | null;
  created_at: string;
}

// 2FA backup code from database
export interface TwoFactorBackupCode {
  id: string;
  profile_id: string;
  code_hash: string;
  used_at: string | null;
  created_at: string;
}

// 2FA policy from database
export interface TwoFactorPolicy {
  id: string;
  role_id: string | null;
  enforcement: TwoFactorEnforcement;
  grace_period_days: number;
  allow_sms: boolean;
  allow_authenticator: boolean;
  allow_email: boolean;
  require_backup_codes: boolean;
  is_active: boolean;
  created_at: string;
  updated_at: string;
  created_by: string | null;
}

// 2FA policy with role details
export interface TwoFactorPolicyWithRole extends TwoFactorPolicy {
  role: {
    id: string;
    name: AppRoleName;
    display_name: string;
  } | null;
}

// 2FA audit log entry
export interface TwoFactorAuditLog {
  id: string;
  profile_id: string;
  action: TwoFactorAuditAction;
  method: TwoFactorMethod | null;
  ip_address: string | null;
  user_agent: string | null;
  metadata: Record<string, unknown>;
  created_at: string;
}

// 2FA audit log with profile details
export interface TwoFactorAuditLogWithProfile extends TwoFactorAuditLog {
  profile: {
    id: string;
    full_name: string;
    email: string;
  } | null;
}

// 2FA setup result
export interface TwoFactorSetupResult {
  success: boolean;
  message: string;
  qrCode?: string; // For authenticator apps
  secret?: string; // TOTP secret (masked in production)
  backupCodes?: string[]; // Plain backup codes (shown once)
  expiresAt?: string;
}

// 2FA verification result
export interface TwoFactorVerifyResult {
  success: boolean;
  message: string;
  verified?: boolean;
  remainingAttempts?: number;
}

// 2FA status for a user
export interface TwoFactorStatus {
  enabled: boolean;
  method: TwoFactorMethod | null;
  verifiedAt: string | null;
  lastVerifiedAt: string | null;
  backupCodesRemaining: number;
  isRequired: boolean;
  gracePeriodEndsAt: string | null;
  allowedMethods: TwoFactorMethod[];
}

// 2FA enforcement check result
export interface TwoFactorEnforcementCheck {
  isRequired: boolean;
  reason: string;
  gracePeriodEndsAt: string | null;
  canBypass: boolean;
}

// Input for enabling 2FA
export interface Enable2FAInput {
  method: TwoFactorMethod;
  generateBackupCodes?: boolean;
}

// Input for verifying 2FA during login
export interface Verify2FAInput {
  code: string;
  isBackupCode?: boolean;
  rememberDevice?: boolean;
}

// Input for updating 2FA policy
export interface UpdateTwoFactorPolicyInput {
  roleId?: string | null;
  enforcement?: TwoFactorEnforcement;
  gracePeriodDays?: number;
  allowSms?: boolean;
  allowAuthenticator?: boolean;
  allowEmail?: boolean;
  requireBackupCodes?: boolean;
  isActive?: boolean;
}
