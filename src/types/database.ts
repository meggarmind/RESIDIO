// User roles for app access (profiles table)
export type UserRole = 'chairman' | 'financial_secretary' | 'security_officer' | 'admin';

// Phase 3: Resident Management Types
export type ResidentType = 'primary' | 'secondary';
export type ResidentRole = 'owner' | 'tenant' | 'occupier' | 'domestic_staff';
export type VerificationStatus = 'pending' | 'submitted' | 'verified' | 'rejected';
export type AccountStatus = 'active' | 'inactive' | 'suspended' | 'archived';

// Legacy types (for future phases)
export type PaymentStatus = 'current' | 'overdue' | 'suspended' | 'exempt';

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
          id_type: string | null;
          id_number: string | null;
          id_verified_at: string | null;
          id_verified_by: string | null;
          photo_url: string | null;
          emergency_contact_name: string | null;
          emergency_contact_phone: string | null;
          emergency_contact_relationship: string | null;
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
}
