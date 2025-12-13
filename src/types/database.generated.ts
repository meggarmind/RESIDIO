export type Json =
  | string
  | number
  | boolean
  | null
  | { [key: string]: Json | undefined }
  | Json[]

export type Database = {
  // Allows to automatically instantiate createClient with right options
  // instead of createClient<Database, { PostgrestVersion: 'XX' }>(URL, KEY)
  __InternalSupabase: {
    PostgrestVersion: "13.0.5"
  }
  public: {
    Tables: {
      approval_requests: {
        Row: {
          created_at: string
          current_values: Json
          entity_id: string
          entity_type: string
          id: string
          reason: string | null
          request_type: Database["public"]["Enums"]["approval_request_type"]
          requested_by: string
          requested_changes: Json
          review_notes: string | null
          reviewed_at: string | null
          reviewed_by: string | null
          status: Database["public"]["Enums"]["approval_status"]
          updated_at: string
        }
        Insert: {
          created_at?: string
          current_values: Json
          entity_id: string
          entity_type: string
          id?: string
          reason?: string | null
          request_type: Database["public"]["Enums"]["approval_request_type"]
          requested_by: string
          requested_changes: Json
          review_notes?: string | null
          reviewed_at?: string | null
          reviewed_by?: string | null
          status?: Database["public"]["Enums"]["approval_status"]
          updated_at?: string
        }
        Update: {
          created_at?: string
          current_values?: Json
          entity_id?: string
          entity_type?: string
          id?: string
          reason?: string | null
          request_type?: Database["public"]["Enums"]["approval_request_type"]
          requested_by?: string
          requested_changes?: Json
          review_notes?: string | null
          reviewed_at?: string | null
          reviewed_by?: string | null
          status?: Database["public"]["Enums"]["approval_status"]
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "approval_requests_requested_by_fkey"
            columns: ["requested_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "approval_requests_reviewed_by_fkey"
            columns: ["reviewed_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      audit_logs: {
        Row: {
          action: Database["public"]["Enums"]["audit_action"]
          actor_id: string
          created_at: string
          description: string | null
          entity_display: string | null
          entity_id: string
          entity_type: string
          id: string
          ip_address: unknown
          metadata: Json | null
          new_values: Json | null
          old_values: Json | null
          user_agent: string | null
        }
        Insert: {
          action: Database["public"]["Enums"]["audit_action"]
          actor_id: string
          created_at?: string
          description?: string | null
          entity_display?: string | null
          entity_id: string
          entity_type: string
          id?: string
          ip_address?: unknown
          metadata?: Json | null
          new_values?: Json | null
          old_values?: Json | null
          user_agent?: string | null
        }
        Update: {
          action?: Database["public"]["Enums"]["audit_action"]
          actor_id?: string
          created_at?: string
          description?: string | null
          entity_display?: string | null
          entity_id?: string
          entity_type?: string
          id?: string
          ip_address?: unknown
          metadata?: Json | null
          new_values?: Json | null
          old_values?: Json | null
          user_agent?: string | null
        }
        Relationships: []
      }
      billing_items: {
        Row: {
          amount: number
          billing_profile_id: string
          created_at: string
          frequency: Database["public"]["Enums"]["billing_frequency"]
          id: string
          is_mandatory: boolean
          name: string
          updated_at: string
        }
        Insert: {
          amount?: number
          billing_profile_id: string
          created_at?: string
          frequency?: Database["public"]["Enums"]["billing_frequency"]
          id?: string
          is_mandatory?: boolean
          name: string
          updated_at?: string
        }
        Update: {
          amount?: number
          billing_profile_id?: string
          created_at?: string
          frequency?: Database["public"]["Enums"]["billing_frequency"]
          id?: string
          is_mandatory?: boolean
          name?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "billing_items_billing_profile_id_fkey"
            columns: ["billing_profile_id"]
            isOneToOne: false
            referencedRelation: "billing_profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      billing_profiles: {
        Row: {
          applicable_roles: string[] | null
          created_at: string
          created_by: string | null
          description: string | null
          effective_date: string
          id: string
          is_active: boolean
          is_development_levy: boolean | null
          is_one_time: boolean
          name: string
          target_type: Database["public"]["Enums"]["billing_target_type"]
          updated_at: string
        }
        Insert: {
          applicable_roles?: string[] | null
          created_at?: string
          created_by?: string | null
          description?: string | null
          effective_date?: string
          id?: string
          is_active?: boolean
          is_development_levy?: boolean | null
          is_one_time?: boolean
          name: string
          target_type?: Database["public"]["Enums"]["billing_target_type"]
          updated_at?: string
        }
        Update: {
          applicable_roles?: string[] | null
          created_at?: string
          created_by?: string | null
          description?: string | null
          effective_date?: string
          id?: string
          is_active?: boolean
          is_development_levy?: boolean | null
          is_one_time?: boolean
          name?: string
          target_type?: Database["public"]["Enums"]["billing_target_type"]
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "billing_profiles_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      house_levy_history: {
        Row: {
          applied_at: string | null
          applied_by: string | null
          billing_profile_id: string
          house_id: string
          id: string
          invoice_id: string | null
          notes: string | null
          resident_id: string
        }
        Insert: {
          applied_at?: string | null
          applied_by?: string | null
          billing_profile_id: string
          house_id: string
          id?: string
          invoice_id?: string | null
          notes?: string | null
          resident_id: string
        }
        Update: {
          applied_at?: string | null
          applied_by?: string | null
          billing_profile_id?: string
          house_id?: string
          id?: string
          invoice_id?: string | null
          notes?: string | null
          resident_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "house_levy_history_applied_by_fkey"
            columns: ["applied_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "house_levy_history_billing_profile_id_fkey"
            columns: ["billing_profile_id"]
            isOneToOne: false
            referencedRelation: "billing_profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "house_levy_history_house_id_fkey"
            columns: ["house_id"]
            isOneToOne: false
            referencedRelation: "houses"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "house_levy_history_invoice_id_fkey"
            columns: ["invoice_id"]
            isOneToOne: false
            referencedRelation: "invoices"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "house_levy_history_resident_id_fkey"
            columns: ["resident_id"]
            isOneToOne: false
            referencedRelation: "residents"
            referencedColumns: ["id"]
          },
        ]
      }
      house_ownership_history: {
        Row: {
          created_at: string | null
          created_by: string | null
          event_date: string
          event_type: string
          house_id: string
          id: string
          is_current: boolean | null
          notes: string | null
          previous_role: Database["public"]["Enums"]["resident_role"] | null
          resident_id: string | null
          resident_role: Database["public"]["Enums"]["resident_role"] | null
        }
        Insert: {
          created_at?: string | null
          created_by?: string | null
          event_date?: string
          event_type: string
          house_id: string
          id?: string
          is_current?: boolean | null
          notes?: string | null
          previous_role?: Database["public"]["Enums"]["resident_role"] | null
          resident_id?: string | null
          resident_role?: Database["public"]["Enums"]["resident_role"] | null
        }
        Update: {
          created_at?: string | null
          created_by?: string | null
          event_date?: string
          event_type?: string
          house_id?: string
          id?: string
          is_current?: boolean | null
          notes?: string | null
          previous_role?: Database["public"]["Enums"]["resident_role"] | null
          resident_id?: string | null
          resident_role?: Database["public"]["Enums"]["resident_role"] | null
        }
        Relationships: [
          {
            foreignKeyName: "house_ownership_history_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "house_ownership_history_house_id_fkey"
            columns: ["house_id"]
            isOneToOne: false
            referencedRelation: "houses"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "house_ownership_history_resident_id_fkey"
            columns: ["resident_id"]
            isOneToOne: false
            referencedRelation: "residents"
            referencedColumns: ["id"]
          },
        ]
      }
      house_types: {
        Row: {
          billing_profile_id: string | null
          created_at: string
          created_by: string | null
          description: string | null
          id: string
          is_active: boolean
          max_residents: number
          name: string
          updated_at: string
        }
        Insert: {
          billing_profile_id?: string | null
          created_at?: string
          created_by?: string | null
          description?: string | null
          id?: string
          is_active?: boolean
          max_residents?: number
          name: string
          updated_at?: string
        }
        Update: {
          billing_profile_id?: string | null
          created_at?: string
          created_by?: string | null
          description?: string | null
          id?: string
          is_active?: boolean
          max_residents?: number
          name?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "house_types_billing_profile_id_fkey"
            columns: ["billing_profile_id"]
            isOneToOne: false
            referencedRelation: "billing_profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "house_types_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      houses: {
        Row: {
          address_line_2: string | null
          billing_profile_id: string | null
          created_at: string
          created_by: string | null
          house_number: string
          house_type_id: string | null
          id: string
          is_active: boolean
          is_occupied: boolean
          notes: string | null
          number_of_plots: number
          street_id: string
          updated_at: string
        }
        Insert: {
          address_line_2?: string | null
          billing_profile_id?: string | null
          created_at?: string
          created_by?: string | null
          house_number: string
          house_type_id?: string | null
          id?: string
          is_active?: boolean
          is_occupied?: boolean
          notes?: string | null
          number_of_plots?: number
          street_id: string
          updated_at?: string
        }
        Update: {
          address_line_2?: string | null
          billing_profile_id?: string | null
          created_at?: string
          created_by?: string | null
          house_number?: string
          house_type_id?: string | null
          id?: string
          is_active?: boolean
          is_occupied?: boolean
          notes?: string | null
          number_of_plots?: number
          street_id?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "houses_billing_profile_id_fkey"
            columns: ["billing_profile_id"]
            isOneToOne: false
            referencedRelation: "billing_profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "houses_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "houses_house_type_id_fkey"
            columns: ["house_type_id"]
            isOneToOne: false
            referencedRelation: "house_types"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "houses_street_id_fkey"
            columns: ["street_id"]
            isOneToOne: false
            referencedRelation: "streets"
            referencedColumns: ["id"]
          },
        ]
      }
      invoice_items: {
        Row: {
          amount: number
          created_at: string
          description: string
          id: string
          invoice_id: string
        }
        Insert: {
          amount: number
          created_at?: string
          description: string
          id?: string
          invoice_id: string
        }
        Update: {
          amount?: number
          created_at?: string
          description?: string
          id?: string
          invoice_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "invoice_items_invoice_id_fkey"
            columns: ["invoice_id"]
            isOneToOne: false
            referencedRelation: "invoices"
            referencedColumns: ["id"]
          },
        ]
      }
      invoices: {
        Row: {
          amount_due: number
          amount_paid: number
          billing_profile_id: string | null
          created_at: string
          created_by: string | null
          due_date: string
          house_id: string | null
          id: string
          invoice_number: string
          invoice_type: Database["public"]["Enums"]["invoice_type_enum"]
          notes: string | null
          period_end: string | null
          period_start: string | null
          rate_snapshot: Json | null
          resident_id: string
          status: Database["public"]["Enums"]["invoice_status"]
          updated_at: string
        }
        Insert: {
          amount_due?: number
          amount_paid?: number
          billing_profile_id?: string | null
          created_at?: string
          created_by?: string | null
          due_date: string
          house_id?: string | null
          id?: string
          invoice_number: string
          invoice_type?: Database["public"]["Enums"]["invoice_type_enum"]
          notes?: string | null
          period_end?: string | null
          period_start?: string | null
          rate_snapshot?: Json | null
          resident_id: string
          status?: Database["public"]["Enums"]["invoice_status"]
          updated_at?: string
        }
        Update: {
          amount_due?: number
          amount_paid?: number
          billing_profile_id?: string | null
          created_at?: string
          created_by?: string | null
          due_date?: string
          house_id?: string | null
          id?: string
          invoice_number?: string
          invoice_type?: Database["public"]["Enums"]["invoice_type_enum"]
          notes?: string | null
          period_end?: string | null
          period_start?: string | null
          rate_snapshot?: Json | null
          resident_id?: string
          status?: Database["public"]["Enums"]["invoice_status"]
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "invoices_billing_profile_id_fkey"
            columns: ["billing_profile_id"]
            isOneToOne: false
            referencedRelation: "billing_profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "invoices_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "invoices_house_id_fkey"
            columns: ["house_id"]
            isOneToOne: false
            referencedRelation: "houses"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "invoices_resident_id_fkey"
            columns: ["resident_id"]
            isOneToOne: false
            referencedRelation: "residents"
            referencedColumns: ["id"]
          },
        ]
      }
      payment_records: {
        Row: {
          amount: number
          created_at: string | null
          id: string
          method: Database["public"]["Enums"]["payment_method"] | null
          notes: string | null
          payment_date: string
          period_end: string | null
          period_start: string | null
          reference_number: string | null
          resident_id: string
          status: Database["public"]["Enums"]["payment_status"]
          updated_at: string | null
        }
        Insert: {
          amount: number
          created_at?: string | null
          id?: string
          method?: Database["public"]["Enums"]["payment_method"] | null
          notes?: string | null
          payment_date?: string
          period_end?: string | null
          period_start?: string | null
          reference_number?: string | null
          resident_id: string
          status?: Database["public"]["Enums"]["payment_status"]
          updated_at?: string | null
        }
        Update: {
          amount?: number
          created_at?: string | null
          id?: string
          method?: Database["public"]["Enums"]["payment_method"] | null
          notes?: string | null
          payment_date?: string
          period_end?: string | null
          period_start?: string | null
          reference_number?: string | null
          resident_id?: string
          status?: Database["public"]["Enums"]["payment_status"]
          updated_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "payment_records_resident_id_fkey"
            columns: ["resident_id"]
            isOneToOne: false
            referencedRelation: "residents"
            referencedColumns: ["id"]
          },
        ]
      }
      profiles: {
        Row: {
          created_at: string
          email: string
          full_name: string
          id: string
          role: Database["public"]["Enums"]["user_role"]
          updated_at: string
        }
        Insert: {
          created_at?: string
          email: string
          full_name: string
          id: string
          role?: Database["public"]["Enums"]["user_role"]
          updated_at?: string
        }
        Update: {
          created_at?: string
          email?: string
          full_name?: string
          id?: string
          role?: Database["public"]["Enums"]["user_role"]
          updated_at?: string
        }
        Relationships: []
      }
      resident_houses: {
        Row: {
          created_at: string
          created_by: string | null
          house_id: string
          id: string
          is_active: boolean
          move_in_date: string
          move_out_date: string | null
          resident_id: string
          resident_role: Database["public"]["Enums"]["resident_role"]
          sponsor_resident_id: string | null
          updated_at: string
        }
        Insert: {
          created_at?: string
          created_by?: string | null
          house_id: string
          id?: string
          is_active?: boolean
          move_in_date?: string
          move_out_date?: string | null
          resident_id: string
          resident_role?: Database["public"]["Enums"]["resident_role"]
          sponsor_resident_id?: string | null
          updated_at?: string
        }
        Update: {
          created_at?: string
          created_by?: string | null
          house_id?: string
          id?: string
          is_active?: boolean
          move_in_date?: string
          move_out_date?: string | null
          resident_id?: string
          resident_role?: Database["public"]["Enums"]["resident_role"]
          sponsor_resident_id?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "resident_houses_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "resident_houses_house_id_fkey"
            columns: ["house_id"]
            isOneToOne: false
            referencedRelation: "houses"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "resident_houses_resident_id_fkey"
            columns: ["resident_id"]
            isOneToOne: false
            referencedRelation: "residents"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "resident_houses_sponsor_resident_id_fkey"
            columns: ["sponsor_resident_id"]
            isOneToOne: false
            referencedRelation: "residents"
            referencedColumns: ["id"]
          },
        ]
      }
      resident_wallets: {
        Row: {
          balance: number
          created_at: string
          id: string
          resident_id: string
          updated_at: string
        }
        Insert: {
          balance?: number
          created_at?: string
          id?: string
          resident_id: string
          updated_at?: string
        }
        Update: {
          balance?: number
          created_at?: string
          id?: string
          resident_id?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "resident_wallets_resident_id_fkey"
            columns: ["resident_id"]
            isOneToOne: true
            referencedRelation: "residents"
            referencedColumns: ["id"]
          },
        ]
      }
      residents: {
        Row: {
          account_status: Database["public"]["Enums"]["account_status"]
          company_name: string | null
          created_at: string
          created_by: string | null
          email: string | null
          emergency_contact_name: string | null
          emergency_contact_phone: string | null
          emergency_contact_relationship: string | null
          emergency_contact_resident_id: string | null
          entity_type: Database["public"]["Enums"]["entity_type"]
          first_name: string
          id: string
          id_number: string | null
          id_type: string | null
          id_verified_at: string | null
          id_verified_by: string | null
          last_name: string
          liaison_contact_name: string | null
          liaison_contact_phone: string | null
          notes: string | null
          phone_primary: string
          phone_secondary: string | null
          photo_url: string | null
          profile_id: string | null
          rc_number: string | null
          resident_code: string
          resident_type: Database["public"]["Enums"]["resident_type"]
          updated_at: string
          updated_by: string | null
          verification_status: Database["public"]["Enums"]["verification_status"]
        }
        Insert: {
          account_status?: Database["public"]["Enums"]["account_status"]
          company_name?: string | null
          created_at?: string
          created_by?: string | null
          email?: string | null
          emergency_contact_name?: string | null
          emergency_contact_phone?: string | null
          emergency_contact_relationship?: string | null
          emergency_contact_resident_id?: string | null
          entity_type?: Database["public"]["Enums"]["entity_type"]
          first_name: string
          id?: string
          id_number?: string | null
          id_type?: string | null
          id_verified_at?: string | null
          id_verified_by?: string | null
          last_name: string
          liaison_contact_name?: string | null
          liaison_contact_phone?: string | null
          notes?: string | null
          phone_primary: string
          phone_secondary?: string | null
          photo_url?: string | null
          profile_id?: string | null
          rc_number?: string | null
          resident_code: string
          resident_type?: Database["public"]["Enums"]["resident_type"]
          updated_at?: string
          updated_by?: string | null
          verification_status?: Database["public"]["Enums"]["verification_status"]
        }
        Update: {
          account_status?: Database["public"]["Enums"]["account_status"]
          company_name?: string | null
          created_at?: string
          created_by?: string | null
          email?: string | null
          emergency_contact_name?: string | null
          emergency_contact_phone?: string | null
          emergency_contact_relationship?: string | null
          emergency_contact_resident_id?: string | null
          entity_type?: Database["public"]["Enums"]["entity_type"]
          first_name?: string
          id?: string
          id_number?: string | null
          id_type?: string | null
          id_verified_at?: string | null
          id_verified_by?: string | null
          last_name?: string
          liaison_contact_name?: string | null
          liaison_contact_phone?: string | null
          notes?: string | null
          phone_primary?: string
          phone_secondary?: string | null
          photo_url?: string | null
          profile_id?: string | null
          rc_number?: string | null
          resident_code?: string
          resident_type?: Database["public"]["Enums"]["resident_type"]
          updated_at?: string
          updated_by?: string | null
          verification_status?: Database["public"]["Enums"]["verification_status"]
        }
        Relationships: [
          {
            foreignKeyName: "residents_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "residents_emergency_contact_resident_id_fkey"
            columns: ["emergency_contact_resident_id"]
            isOneToOne: false
            referencedRelation: "residents"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "residents_id_verified_by_fkey"
            columns: ["id_verified_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "residents_profile_id_fkey"
            columns: ["profile_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "residents_updated_by_fkey"
            columns: ["updated_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      streets: {
        Row: {
          created_at: string
          created_by: string | null
          description: string | null
          id: string
          is_active: boolean
          name: string
          short_name: string | null
          updated_at: string
        }
        Insert: {
          created_at?: string
          created_by?: string | null
          description?: string | null
          id?: string
          is_active?: boolean
          name: string
          short_name?: string | null
          updated_at?: string
        }
        Update: {
          created_at?: string
          created_by?: string | null
          description?: string | null
          id?: string
          is_active?: boolean
          name?: string
          short_name?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "streets_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      system_settings: {
        Row: {
          category: string | null
          created_at: string | null
          description: string | null
          id: string
          key: string
          updated_at: string | null
          value: Json
        }
        Insert: {
          category?: string | null
          created_at?: string | null
          description?: string | null
          id?: string
          key: string
          updated_at?: string | null
          value: Json
        }
        Update: {
          category?: string | null
          created_at?: string | null
          description?: string | null
          id?: string
          key?: string
          updated_at?: string | null
          value?: Json
        }
        Relationships: []
      }
      wallet_transactions: {
        Row: {
          amount: number
          balance_after: number
          created_at: string
          description: string | null
          id: string
          reference_id: string | null
          reference_type: string | null
          type: Database["public"]["Enums"]["wallet_transaction_type"]
          wallet_id: string
        }
        Insert: {
          amount: number
          balance_after: number
          created_at?: string
          description?: string | null
          id?: string
          reference_id?: string | null
          reference_type?: string | null
          type: Database["public"]["Enums"]["wallet_transaction_type"]
          wallet_id: string
        }
        Update: {
          amount?: number
          balance_after?: number
          created_at?: string
          description?: string | null
          id?: string
          reference_id?: string | null
          reference_type?: string | null
          type?: Database["public"]["Enums"]["wallet_transaction_type"]
          wallet_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "wallet_transactions_wallet_id_fkey"
            columns: ["wallet_id"]
            isOneToOne: false
            referencedRelation: "resident_wallets"
            referencedColumns: ["id"]
          },
        ]
      }
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      generate_resident_code: { Args: never; Returns: string }
      get_my_role: {
        Args: never
        Returns: Database["public"]["Enums"]["user_role"]
      }
      record_ownership_history: {
        Args: {
          p_created_by?: string
          p_event_date?: string
          p_event_type: string
          p_house_id: string
          p_is_current?: boolean
          p_notes?: string
          p_previous_role?: Database["public"]["Enums"]["resident_role"]
          p_resident_id: string
          p_resident_role: Database["public"]["Enums"]["resident_role"]
        }
        Returns: string
      }
    }
    Enums: {
      account_status: "active" | "inactive" | "suspended" | "archived"
      approval_request_type:
        | "billing_profile_effective_date"
        | "house_plots_change"
      approval_status: "pending" | "approved" | "rejected"
      audit_action:
        | "CREATE"
        | "UPDATE"
        | "DELETE"
        | "VERIFY"
        | "APPROVE"
        | "REJECT"
        | "ASSIGN"
        | "UNASSIGN"
        | "ACTIVATE"
        | "DEACTIVATE"
        | "GENERATE"
        | "ALLOCATE"
        | "LOGIN"
        | "LOGOUT"
      billing_frequency: "monthly" | "yearly" | "one_off"
      billing_target_type: "house" | "resident"
      entity_type: "individual" | "corporate" | "developer"
      invoice_status: "unpaid" | "paid" | "void" | "partially_paid"
      invoice_type_enum: "SERVICE_CHARGE" | "LEVY" | "ADJUSTMENT" | "OTHER"
      payment_method: "cash" | "bank_transfer" | "pos" | "cheque"
      payment_status: "pending" | "paid" | "overdue" | "failed"
      resident_role:
        | "non_resident_landlord"
        | "tenant"
        | "co_resident"
        | "domestic_staff"
        | "household_member"
        | "resident_landlord"
        | "caretaker"
        | "developer"
      resident_type: "primary" | "secondary"
      user_role:
        | "chairman"
        | "financial_secretary"
        | "security_officer"
        | "admin"
      verification_status: "pending" | "submitted" | "verified" | "rejected"
      wallet_transaction_type: "credit" | "debit"
    }
    CompositeTypes: {
      [_ in never]: never
    }
  }
}

type DatabaseWithoutInternals = Omit<Database, "__InternalSupabase">

type DefaultSchema = DatabaseWithoutInternals[Extract<keyof Database, "public">]

export type Tables<
  DefaultSchemaTableNameOrOptions extends
    | keyof (DefaultSchema["Tables"] & DefaultSchema["Views"])
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
        DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])
    : never = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
      DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])[TableName] extends {
      Row: infer R
    }
    ? R
    : never
  : DefaultSchemaTableNameOrOptions extends keyof (DefaultSchema["Tables"] &
        DefaultSchema["Views"])
    ? (DefaultSchema["Tables"] &
        DefaultSchema["Views"])[DefaultSchemaTableNameOrOptions] extends {
        Row: infer R
      }
      ? R
      : never
    : never

export type TablesInsert<
  DefaultSchemaTableNameOrOptions extends
    | keyof DefaultSchema["Tables"]
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"][TableName] extends {
      Insert: infer I
    }
    ? I
    : never
  : DefaultSchemaTableNameOrOptions extends keyof DefaultSchema["Tables"]
    ? DefaultSchema["Tables"][DefaultSchemaTableNameOrOptions] extends {
        Insert: infer I
      }
      ? I
      : never
    : never

export type TablesUpdate<
  DefaultSchemaTableNameOrOptions extends
    | keyof DefaultSchema["Tables"]
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"][TableName] extends {
      Update: infer U
    }
    ? U
    : never
  : DefaultSchemaTableNameOrOptions extends keyof DefaultSchema["Tables"]
    ? DefaultSchema["Tables"][DefaultSchemaTableNameOrOptions] extends {
        Update: infer U
      }
      ? U
      : never
    : never

export type Enums<
  DefaultSchemaEnumNameOrOptions extends
    | keyof DefaultSchema["Enums"]
    | { schema: keyof DatabaseWithoutInternals },
  EnumName extends DefaultSchemaEnumNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"]
    : never = never,
> = DefaultSchemaEnumNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"][EnumName]
  : DefaultSchemaEnumNameOrOptions extends keyof DefaultSchema["Enums"]
    ? DefaultSchema["Enums"][DefaultSchemaEnumNameOrOptions]
    : never

export type CompositeTypes<
  PublicCompositeTypeNameOrOptions extends
    | keyof DefaultSchema["CompositeTypes"]
    | { schema: keyof DatabaseWithoutInternals },
  CompositeTypeName extends PublicCompositeTypeNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"]
    : never = never,
> = PublicCompositeTypeNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"][CompositeTypeName]
  : PublicCompositeTypeNameOrOptions extends keyof DefaultSchema["CompositeTypes"]
    ? DefaultSchema["CompositeTypes"][PublicCompositeTypeNameOrOptions]
    : never

export const Constants = {
  public: {
    Enums: {
      account_status: ["active", "inactive", "suspended", "archived"],
      approval_request_type: [
        "billing_profile_effective_date",
        "house_plots_change",
      ],
      approval_status: ["pending", "approved", "rejected"],
      audit_action: [
        "CREATE",
        "UPDATE",
        "DELETE",
        "VERIFY",
        "APPROVE",
        "REJECT",
        "ASSIGN",
        "UNASSIGN",
        "ACTIVATE",
        "DEACTIVATE",
        "GENERATE",
        "ALLOCATE",
        "LOGIN",
        "LOGOUT",
      ],
      billing_frequency: ["monthly", "yearly", "one_off"],
      billing_target_type: ["house", "resident"],
      entity_type: ["individual", "corporate", "developer"],
      invoice_status: ["unpaid", "paid", "void", "partially_paid"],
      invoice_type_enum: ["SERVICE_CHARGE", "LEVY", "ADJUSTMENT", "OTHER"],
      payment_method: ["cash", "bank_transfer", "pos", "cheque"],
      payment_status: ["pending", "paid", "overdue", "failed"],
      resident_role: [
        "non_resident_landlord",
        "tenant",
        "co_resident",
        "domestic_staff",
        "household_member",
        "resident_landlord",
        "caretaker",
        "developer",
      ],
      resident_type: ["primary", "secondary"],
      user_role: [
        "chairman",
        "financial_secretary",
        "security_officer",
        "admin",
      ],
      verification_status: ["pending", "submitted", "verified", "rejected"],
      wallet_transaction_type: ["credit", "debit"],
    },
  },
} as const
