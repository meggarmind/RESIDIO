// User roles for app access (profiles table)
export type UserRole = 'chairman' | 'financial_secretary' | 'security_officer' | 'admin';

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
          created_at: string;
          updated_at: string;
          created_by: string | null;
        };
        Insert: Omit<Database['public']['Tables']['houses']['Row'], 'id' | 'created_at' | 'updated_at' | 'is_occupied'> & {
          id?: string;
          is_occupied?: boolean;
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
          is_billing_responsible: boolean;
          created_at: string;
          updated_at: string;
          created_by: string | null;
        };
        Insert: Omit<Database['public']['Tables']['resident_houses']['Row'], 'id' | 'created_at' | 'updated_at'> & {
          id?: string;
          is_billing_responsible?: boolean; // Defaults to false
        };
        Update: Partial<Database['public']['Tables']['resident_houses']['Insert']>;
      };

      // Future phases
      payment_records: {
        Row: {
          id: string;
          resident_id: string;
          amount: number;
          payment_date: string;
          period_start: string;
          period_end: string;
          status: 'paid' | 'pending' | 'failed';
          reference: string | null;
          created_at: string;
        };
        Insert: Omit<Database['public']['Tables']['payment_records']['Row'], 'id' | 'created_at'>;
        Update: Partial<Database['public']['Tables']['payment_records']['Insert']>;
      };

      security_contacts: {
        Row: {
          id: string;
          resident_id: string;
          is_primary: boolean;
          access_code: string;
          valid_from: string;
          valid_until: string | null;
          is_active: boolean;
          created_at: string;
          updated_at: string;
        };
        Insert: Omit<Database['public']['Tables']['security_contacts']['Row'], 'id' | 'created_at' | 'updated_at'>;
        Update: Partial<Database['public']['Tables']['security_contacts']['Insert']>;
      };

      audit_logs: {
        Row: {
          id: string;
          actor_id: string;
          action: string;
          entity_type: string;
          entity_id: string;
          old_values: Record<string, unknown> | null;
          new_values: Record<string, unknown> | null;
          ip_address: string | null;
          user_agent: string | null;
          created_at: string;
        };
        Insert: Omit<Database['public']['Tables']['audit_logs']['Row'], 'id' | 'created_at'>;
        Update: never;
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
