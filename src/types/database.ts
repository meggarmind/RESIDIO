export type UserRole = 'chairman' | 'financial_secretary' | 'security_officer' | 'admin';

export type PaymentStatus = 'current' | 'overdue' | 'suspended' | 'exempt';

export type ResidentStatus = 'active' | 'inactive' | 'pending';

export interface Database {
  public: {
    Tables: {
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
      residents: {
        Row: {
          id: string;
          full_name: string;
          email: string | null;
          phone: string;
          unit_number: string;
          payment_status: PaymentStatus;
          status: ResidentStatus;
          security_access_enabled: boolean;
          notes: string | null;
          created_at: string;
          updated_at: string;
          created_by: string;
        };
        Insert: Omit<Database['public']['Tables']['residents']['Row'], 'id' | 'created_at' | 'updated_at'>;
        Update: Partial<Database['public']['Tables']['residents']['Insert']>;
      };
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
        Update: never; // Audit logs are immutable
      };
    };
  };
}
