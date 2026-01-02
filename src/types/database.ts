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
  | 'impersonation';  // Admin impersonation system

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
  | 'impersonation_request';

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
  | 'GENERATE'    // For invoice/levy generation
  | 'ALLOCATE'    // For wallet allocations
  | 'LOGIN'       // Future: auth events
  | 'LOGOUT';     // Future: auth events

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
  | 'impersonation_sessions';    // Admin impersonation system

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
export const RESIDENT_ROLE_LABELS: Record<ResidentRole, string> = {
  resident_landlord: 'Resident Landlord',
  non_resident_landlord: 'Non-Resident Landlord',
  tenant: 'Tenant',
  developer: 'Developer',
  co_resident: 'Co-Resident',
  household_member: 'Household Member',
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
  { value: 'resident_landlord' as const, label: 'Resident Landlord' },
  { value: 'non_resident_landlord' as const, label: 'Non-Resident Landlord' },
  { value: 'tenant' as const, label: 'Tenant' },
  { value: 'developer' as const, label: 'Developer' },
];

// Corporate-only role options (corporate entities can only have these roles)
export const CORPORATE_ROLE_OPTIONS = [
  { value: 'non_resident_landlord' as const, label: 'Non-Resident Landlord' },
  { value: 'developer' as const, label: 'Developer' },
];

// Secondary role options for forms (individuals only)
export const SECONDARY_ROLE_OPTIONS = [
  { value: 'co_resident' as const, label: 'Co-Resident' },
  { value: 'household_member' as const, label: 'Household Member' },
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
          created_at: string;
          updated_at: string;
        };
        Insert: Omit<Database['public']['Tables']['profiles']['Row'], 'created_at' | 'updated_at'>;
        Update: Partial<Database['public']['Tables']['profiles']['Insert']>;
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
          created_at: string;
          updated_at: string;
        };
        Insert: Omit<Database['public']['Tables']['payment_records']['Row'], 'id' | 'created_at' | 'updated_at'> & {
          id?: string;
          house_id?: string | null;
          split_payment_group_id?: string | null;
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

      // Phase 6: Security Contacts
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
          created_at: string;
          updated_at: string;
          created_by: string | null;
        };
        Insert: Omit<Database['public']['Tables']['security_contacts']['Row'], 'id' | 'created_at' | 'updated_at'>;
        Update: Partial<Database['public']['Tables']['security_contacts']['Insert']>;
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

      // Phase 6: Access Logs
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
          created_at: string;
        };
        Insert: Omit<Database['public']['Tables']['access_logs']['Row'], 'id' | 'created_at'>;
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
  | 'impersonation_session';  // For admin impersonation approval requests

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
  // Entity details based on entity_type
  entity_name: string; // House address or billing profile name
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
  created_by_profile?: {
    id: string;
    full_name: string;
  } | null;
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
