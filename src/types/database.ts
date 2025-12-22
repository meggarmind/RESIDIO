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
  | 'system';

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

// Resident roles (renamed in Phase 2 Enhancements)
export type ResidentRole =
  | 'resident_landlord' // Owner who resides in the unit (was owner_occupier)
  | 'non_resident_landlord' // Non-resident owner (was landlord)
  | 'tenant' // Leaseholder who resides in the unit
  | 'developer' // Developer holding unsold inventory
  | 'co_resident' // Adult residing in unit not on title/lease
  | 'household_member' // Family dependents (spouse, children)
  | 'domestic_staff' // Employees working/living at the unit
  | 'caretaker'; // Assigned to maintain a vacant unit

// Primary roles (can exist independently - relationship holders)
export type PrimaryResidentRole = 'resident_landlord' | 'non_resident_landlord' | 'tenant' | 'developer';

// Secondary roles (must be attached to a primary resident, individuals only)
export type SecondaryResidentRole = 'co_resident' | 'household_member' | 'domestic_staff' | 'caretaker';

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
  | 'bank_account_delete';

// Labels for approval request types
export const APPROVAL_REQUEST_TYPE_LABELS: Record<ApprovalRequestType, string> = {
  billing_profile_effective_date: 'Billing Profile Effective Date Change',
  house_plots_change: 'House Plots Change',
  bank_account_create: 'Bank Account Creation',
  bank_account_update: 'Bank Account Update',
  bank_account_delete: 'Bank Account Deletion',
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
  | 'role_permissions';   // Phase 10: RBAC

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
          is_occupied: boolean;
          is_active: boolean;
          notes: string | null;
          billing_profile_id: string | null; // Override for house type default
          number_of_plots: number; // Number of plots the house is built on (for Development Levy calculation)
          created_at: string;
          updated_at: string;
          created_by: string | null;
        };
        Insert: Omit<Database['public']['Tables']['houses']['Row'], 'id' | 'created_at' | 'updated_at' | 'is_occupied' | 'number_of_plots'> & {
          id?: string;
          is_occupied?: boolean;
          number_of_plots?: number;
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
          move_in_date: string;
          move_out_date: string | null;
          is_active: boolean;
          // Sponsor fields for secondary roles (domestic_staff, caretaker)
          sponsor_resident_id: string | null;
          created_at: string;
          updated_at: string;
          created_by: string | null;
        };
        Insert: Omit<Database['public']['Tables']['resident_houses']['Row'], 'id' | 'created_at' | 'updated_at'> & {
          id?: string;
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
export type ApprovalEntityType = 'billing_profile' | 'house' | 'estate_bank_account';

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
