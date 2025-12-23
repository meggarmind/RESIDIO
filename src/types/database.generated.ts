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
      access_codes: {
        Row: {
          code: string
          code_type: Database["public"]["Enums"]["access_code_type"]
          contact_id: string
          created_at: string
          current_uses: number
          id: string
          is_active: boolean
          max_uses: number | null
          revoked_at: string | null
          revoked_by: string | null
          valid_from: string
          valid_until: string | null
        }
        Insert: {
          code: string
          code_type?: Database["public"]["Enums"]["access_code_type"]
          contact_id: string
          created_at?: string
          current_uses?: number
          id?: string
          is_active?: boolean
          max_uses?: number | null
          revoked_at?: string | null
          revoked_by?: string | null
          valid_from?: string
          valid_until?: string | null
        }
        Update: {
          code?: string
          code_type?: Database["public"]["Enums"]["access_code_type"]
          contact_id?: string
          created_at?: string
          current_uses?: number
          id?: string
          is_active?: boolean
          max_uses?: number | null
          revoked_at?: string | null
          revoked_by?: string | null
          valid_from?: string
          valid_until?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "access_codes_contact_id_fkey"
            columns: ["contact_id"]
            isOneToOne: false
            referencedRelation: "security_contacts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "access_codes_revoked_by_fkey"
            columns: ["revoked_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      access_logs: {
        Row: {
          access_code_id: string | null
          check_in_time: string
          check_out_time: string | null
          contact_id: string
          created_at: string
          flag_reason: string | null
          flagged: boolean
          gate_location: string | null
          id: string
          notes: string | null
          resident_id: string
          verified_by: string | null
        }
        Insert: {
          access_code_id?: string | null
          check_in_time?: string
          check_out_time?: string | null
          contact_id: string
          created_at?: string
          flag_reason?: string | null
          flagged?: boolean
          gate_location?: string | null
          id?: string
          notes?: string | null
          resident_id: string
          verified_by?: string | null
        }
        Update: {
          access_code_id?: string | null
          check_in_time?: string
          check_out_time?: string | null
          contact_id?: string
          created_at?: string
          flag_reason?: string | null
          flagged?: boolean
          gate_location?: string | null
          id?: string
          notes?: string | null
          resident_id?: string
          verified_by?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "access_logs_access_code_id_fkey"
            columns: ["access_code_id"]
            isOneToOne: false
            referencedRelation: "access_codes"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "access_logs_contact_id_fkey"
            columns: ["contact_id"]
            isOneToOne: false
            referencedRelation: "security_contacts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "access_logs_resident_id_fkey"
            columns: ["resident_id"]
            isOneToOne: false
            referencedRelation: "residents"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "access_logs_verified_by_fkey"
            columns: ["verified_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      app_permissions: {
        Row: {
          category: Database["public"]["Enums"]["permission_category"]
          created_at: string | null
          description: string | null
          display_name: string
          id: string
          is_active: boolean | null
          name: string
        }
        Insert: {
          category: Database["public"]["Enums"]["permission_category"]
          created_at?: string | null
          description?: string | null
          display_name: string
          id?: string
          is_active?: boolean | null
          name: string
        }
        Update: {
          category?: Database["public"]["Enums"]["permission_category"]
          created_at?: string | null
          description?: string | null
          display_name?: string
          id?: string
          is_active?: boolean | null
          name?: string
        }
        Relationships: []
      }
      app_roles: {
        Row: {
          can_be_assigned_to_resident: boolean | null
          category: string | null
          created_at: string | null
          created_by: string | null
          description: string | null
          display_name: string
          id: string
          is_active: boolean | null
          is_system_role: boolean | null
          level: number | null
          name: string
          updated_at: string | null
        }
        Insert: {
          can_be_assigned_to_resident?: boolean | null
          category?: string | null
          created_at?: string | null
          created_by?: string | null
          description?: string | null
          display_name: string
          id?: string
          is_active?: boolean | null
          is_system_role?: boolean | null
          level?: number | null
          name: string
          updated_at?: string | null
        }
        Update: {
          can_be_assigned_to_resident?: boolean | null
          category?: string | null
          created_at?: string | null
          created_by?: string | null
          description?: string | null
          display_name?: string
          id?: string
          is_active?: boolean | null
          is_system_role?: boolean | null
          level?: number | null
          name?: string
          updated_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "app_roles_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
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
          actor_id: string | null
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
          actor_id?: string | null
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
          actor_id?: string | null
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
        Relationships: [
          {
            foreignKeyName: "audit_logs_actor_id_fkey"
            columns: ["actor_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      bank_statement_imports: {
        Row: {
          approved_at: string | null
          approved_by: string | null
          bank_account_id: string | null
          bank_name: string | null
          column_mapping: Json | null
          completed_at: string | null
          created_at: string | null
          created_by: string | null
          created_rows: number | null
          error_rows: number | null
          file_name: string
          file_type: string
          id: string
          import_summary: Json | null
          matched_rows: number | null
          skipped_rows: number | null
          status: string | null
          total_rows: number
          transaction_filter: string | null
        }
        Insert: {
          approved_at?: string | null
          approved_by?: string | null
          bank_account_id?: string | null
          bank_name?: string | null
          column_mapping?: Json | null
          completed_at?: string | null
          created_at?: string | null
          created_by?: string | null
          created_rows?: number | null
          error_rows?: number | null
          file_name: string
          file_type: string
          id?: string
          import_summary?: Json | null
          matched_rows?: number | null
          skipped_rows?: number | null
          status?: string | null
          total_rows?: number
          transaction_filter?: string | null
        }
        Update: {
          approved_at?: string | null
          approved_by?: string | null
          bank_account_id?: string | null
          bank_name?: string | null
          column_mapping?: Json | null
          completed_at?: string | null
          created_at?: string | null
          created_by?: string | null
          created_rows?: number | null
          error_rows?: number | null
          file_name?: string
          file_type?: string
          id?: string
          import_summary?: Json | null
          matched_rows?: number | null
          skipped_rows?: number | null
          status?: string | null
          total_rows?: number
          transaction_filter?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "bank_statement_imports_approved_by_fkey"
            columns: ["approved_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "bank_statement_imports_bank_account_id_fkey"
            columns: ["bank_account_id"]
            isOneToOne: false
            referencedRelation: "estate_bank_accounts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "bank_statement_imports_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      bank_statement_rows: {
        Row: {
          amount: number | null
          auto_tagged: boolean | null
          created_at: string | null
          description: string | null
          error_message: string | null
          id: string
          import_id: string
          match_confidence: string | null
          match_method: string | null
          matched_resident_id: string | null
          payment_id: string | null
          raw_data: Json
          reference: string | null
          row_number: number
          status: string | null
          tag_id: string | null
          tagged_at: string | null
          tagged_by: string | null
          transaction_date: string | null
          transaction_type: string | null
        }
        Insert: {
          amount?: number | null
          auto_tagged?: boolean | null
          created_at?: string | null
          description?: string | null
          error_message?: string | null
          id?: string
          import_id: string
          match_confidence?: string | null
          match_method?: string | null
          matched_resident_id?: string | null
          payment_id?: string | null
          raw_data: Json
          reference?: string | null
          row_number: number
          status?: string | null
          tag_id?: string | null
          tagged_at?: string | null
          tagged_by?: string | null
          transaction_date?: string | null
          transaction_type?: string | null
        }
        Update: {
          amount?: number | null
          auto_tagged?: boolean | null
          created_at?: string | null
          description?: string | null
          error_message?: string | null
          id?: string
          import_id?: string
          match_confidence?: string | null
          match_method?: string | null
          matched_resident_id?: string | null
          payment_id?: string | null
          raw_data?: Json
          reference?: string | null
          row_number?: number
          status?: string | null
          tag_id?: string | null
          tagged_at?: string | null
          tagged_by?: string | null
          transaction_date?: string | null
          transaction_type?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "bank_statement_rows_import_id_fkey"
            columns: ["import_id"]
            isOneToOne: false
            referencedRelation: "bank_statement_imports"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "bank_statement_rows_matched_resident_id_fkey"
            columns: ["matched_resident_id"]
            isOneToOne: false
            referencedRelation: "residents"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "bank_statement_rows_payment_id_fkey"
            columns: ["payment_id"]
            isOneToOne: false
            referencedRelation: "payment_records"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "bank_statement_rows_tag_id_fkey"
            columns: ["tag_id"]
            isOneToOne: false
            referencedRelation: "transaction_tags"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "bank_statement_rows_tagged_by_fkey"
            columns: ["tagged_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
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
      email_logs: {
        Row: {
          created_at: string | null
          email_type: string
          error_message: string | null
          id: string
          metadata: Json | null
          recipient_email: string
          recipient_name: string | null
          resend_id: string | null
          resident_id: string | null
          status: string | null
          subject: string
        }
        Insert: {
          created_at?: string | null
          email_type: string
          error_message?: string | null
          id?: string
          metadata?: Json | null
          recipient_email: string
          recipient_name?: string | null
          resend_id?: string | null
          resident_id?: string | null
          status?: string | null
          subject: string
        }
        Update: {
          created_at?: string | null
          email_type?: string
          error_message?: string | null
          id?: string
          metadata?: Json | null
          recipient_email?: string
          recipient_name?: string | null
          resend_id?: string | null
          resident_id?: string | null
          status?: string | null
          subject?: string
        }
        Relationships: [
          {
            foreignKeyName: "email_logs_resident_id_fkey"
            columns: ["resident_id"]
            isOneToOne: false
            referencedRelation: "residents"
            referencedColumns: ["id"]
          },
        ]
      }
      escalation_states: {
        Row: {
          created_at: string
          current_level: number
          entity_id: string
          entity_type: string
          id: string
          is_resolved: boolean
          last_notification_id: string | null
          last_notified_at: string | null
          next_scheduled_at: string | null
          resident_id: string
          resolved_at: string | null
          resolved_reason: string | null
          updated_at: string
        }
        Insert: {
          created_at?: string
          current_level?: number
          entity_id: string
          entity_type: string
          id?: string
          is_resolved?: boolean
          last_notification_id?: string | null
          last_notified_at?: string | null
          next_scheduled_at?: string | null
          resident_id: string
          resolved_at?: string | null
          resolved_reason?: string | null
          updated_at?: string
        }
        Update: {
          created_at?: string
          current_level?: number
          entity_id?: string
          entity_type?: string
          id?: string
          is_resolved?: boolean
          last_notification_id?: string | null
          last_notified_at?: string | null
          next_scheduled_at?: string | null
          resident_id?: string
          resolved_at?: string | null
          resolved_reason?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "escalation_states_last_notification_id_fkey"
            columns: ["last_notification_id"]
            isOneToOne: false
            referencedRelation: "notification_history"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "escalation_states_resident_id_fkey"
            columns: ["resident_id"]
            isOneToOne: false
            referencedRelation: "residents"
            referencedColumns: ["id"]
          },
        ]
      }
      estate_bank_accounts: {
        Row: {
          account_name: string
          account_number: string
          bank_name: string
          created_at: string | null
          id: string
          is_active: boolean | null
        }
        Insert: {
          account_name: string
          account_number: string
          bank_name?: string
          created_at?: string | null
          id?: string
          is_active?: boolean | null
        }
        Update: {
          account_name?: string
          account_number?: string
          bank_name?: string
          created_at?: string | null
          id?: string
          is_active?: boolean | null
        }
        Relationships: []
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
      notification_history: {
        Row: {
          body_preview: string | null
          channel: string
          clicked_at: string | null
          created_at: string
          delivered_at: string | null
          error_message: string | null
          external_id: string | null
          id: string
          metadata: Json | null
          opened_at: string | null
          queue_id: string | null
          recipient_email: string | null
          recipient_id: string | null
          recipient_phone: string | null
          schedule_id: string | null
          sent_at: string | null
          status: string
          subject: string | null
          template_id: string | null
        }
        Insert: {
          body_preview?: string | null
          channel: string
          clicked_at?: string | null
          created_at?: string
          delivered_at?: string | null
          error_message?: string | null
          external_id?: string | null
          id?: string
          metadata?: Json | null
          opened_at?: string | null
          queue_id?: string | null
          recipient_email?: string | null
          recipient_id?: string | null
          recipient_phone?: string | null
          schedule_id?: string | null
          sent_at?: string | null
          status: string
          subject?: string | null
          template_id?: string | null
        }
        Update: {
          body_preview?: string | null
          channel?: string
          clicked_at?: string | null
          created_at?: string
          delivered_at?: string | null
          error_message?: string | null
          external_id?: string | null
          id?: string
          metadata?: Json | null
          opened_at?: string | null
          queue_id?: string | null
          recipient_email?: string | null
          recipient_id?: string | null
          recipient_phone?: string | null
          schedule_id?: string | null
          sent_at?: string | null
          status?: string
          subject?: string | null
          template_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "notification_history_queue_id_fkey"
            columns: ["queue_id"]
            isOneToOne: false
            referencedRelation: "notification_queue"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "notification_history_recipient_id_fkey"
            columns: ["recipient_id"]
            isOneToOne: false
            referencedRelation: "residents"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "notification_history_schedule_id_fkey"
            columns: ["schedule_id"]
            isOneToOne: false
            referencedRelation: "notification_schedules"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "notification_history_template_id_fkey"
            columns: ["template_id"]
            isOneToOne: false
            referencedRelation: "notification_templates"
            referencedColumns: ["id"]
          },
        ]
      }
      notification_preferences: {
        Row: {
          category: string
          channel: string
          created_at: string
          enabled: boolean
          frequency: string | null
          id: string
          quiet_hours_end: string | null
          quiet_hours_start: string | null
          resident_id: string
          updated_at: string
        }
        Insert: {
          category: string
          channel?: string
          created_at?: string
          enabled?: boolean
          frequency?: string | null
          id?: string
          quiet_hours_end?: string | null
          quiet_hours_start?: string | null
          resident_id: string
          updated_at?: string
        }
        Update: {
          category?: string
          channel?: string
          created_at?: string
          enabled?: boolean
          frequency?: string | null
          id?: string
          quiet_hours_end?: string | null
          quiet_hours_start?: string | null
          resident_id?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "notification_preferences_resident_id_fkey"
            columns: ["resident_id"]
            isOneToOne: false
            referencedRelation: "residents"
            referencedColumns: ["id"]
          },
        ]
      }
      notification_queue: {
        Row: {
          attempts: number
          body: string
          channel: string
          created_at: string
          created_by: string | null
          dedup_window_minutes: number | null
          deduplication_key: string | null
          error_message: string | null
          html_body: string | null
          id: string
          last_attempt_at: string | null
          max_attempts: number
          metadata: Json | null
          priority: number
          recipient_email: string | null
          recipient_id: string
          recipient_phone: string | null
          schedule_id: string | null
          scheduled_for: string
          sent_at: string | null
          status: string
          subject: string | null
          template_id: string | null
          variables: Json | null
        }
        Insert: {
          attempts?: number
          body: string
          channel?: string
          created_at?: string
          created_by?: string | null
          dedup_window_minutes?: number | null
          deduplication_key?: string | null
          error_message?: string | null
          html_body?: string | null
          id?: string
          last_attempt_at?: string | null
          max_attempts?: number
          metadata?: Json | null
          priority?: number
          recipient_email?: string | null
          recipient_id: string
          recipient_phone?: string | null
          schedule_id?: string | null
          scheduled_for?: string
          sent_at?: string | null
          status?: string
          subject?: string | null
          template_id?: string | null
          variables?: Json | null
        }
        Update: {
          attempts?: number
          body?: string
          channel?: string
          created_at?: string
          created_by?: string | null
          dedup_window_minutes?: number | null
          deduplication_key?: string | null
          error_message?: string | null
          html_body?: string | null
          id?: string
          last_attempt_at?: string | null
          max_attempts?: number
          metadata?: Json | null
          priority?: number
          recipient_email?: string | null
          recipient_id?: string
          recipient_phone?: string | null
          schedule_id?: string | null
          scheduled_for?: string
          sent_at?: string | null
          status?: string
          subject?: string | null
          template_id?: string | null
          variables?: Json | null
        }
        Relationships: [
          {
            foreignKeyName: "notification_queue_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "notification_queue_recipient_id_fkey"
            columns: ["recipient_id"]
            isOneToOne: false
            referencedRelation: "residents"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "notification_queue_schedule_id_fkey"
            columns: ["schedule_id"]
            isOneToOne: false
            referencedRelation: "notification_schedules"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "notification_queue_template_id_fkey"
            columns: ["template_id"]
            isOneToOne: false
            referencedRelation: "notification_templates"
            referencedColumns: ["id"]
          },
        ]
      }
      notification_schedules: {
        Row: {
          conditions: Json | null
          created_at: string
          cron_expression: string | null
          escalation_sequence: number | null
          event_type: string | null
          id: string
          is_active: boolean
          name: string
          parent_schedule_id: string | null
          template_id: string
          trigger_type: string
          trigger_value: number | null
          updated_at: string
        }
        Insert: {
          conditions?: Json | null
          created_at?: string
          cron_expression?: string | null
          escalation_sequence?: number | null
          event_type?: string | null
          id?: string
          is_active?: boolean
          name: string
          parent_schedule_id?: string | null
          template_id: string
          trigger_type: string
          trigger_value?: number | null
          updated_at?: string
        }
        Update: {
          conditions?: Json | null
          created_at?: string
          cron_expression?: string | null
          escalation_sequence?: number | null
          event_type?: string | null
          id?: string
          is_active?: boolean
          name?: string
          parent_schedule_id?: string | null
          template_id?: string
          trigger_type?: string
          trigger_value?: number | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "notification_schedules_parent_schedule_id_fkey"
            columns: ["parent_schedule_id"]
            isOneToOne: false
            referencedRelation: "notification_schedules"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "notification_schedules_template_id_fkey"
            columns: ["template_id"]
            isOneToOne: false
            referencedRelation: "notification_templates"
            referencedColumns: ["id"]
          },
        ]
      }
      notification_templates: {
        Row: {
          body_template: string
          category: string
          channel: string
          created_at: string
          created_by: string | null
          display_name: string
          html_template: string | null
          id: string
          is_active: boolean
          is_system: boolean
          name: string
          subject_template: string | null
          updated_at: string
          variables: Json
        }
        Insert: {
          body_template: string
          category: string
          channel?: string
          created_at?: string
          created_by?: string | null
          display_name: string
          html_template?: string | null
          id?: string
          is_active?: boolean
          is_system?: boolean
          name: string
          subject_template?: string | null
          updated_at?: string
          variables?: Json
        }
        Update: {
          body_template?: string
          category?: string
          channel?: string
          created_at?: string
          created_by?: string | null
          display_name?: string
          html_template?: string | null
          id?: string
          is_active?: boolean
          is_system?: boolean
          name?: string
          subject_template?: string | null
          updated_at?: string
          variables?: Json
        }
        Relationships: [
          {
            foreignKeyName: "notification_templates_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      payment_records: {
        Row: {
          amount: number
          created_at: string | null
          house_id: string | null
          id: string
          import_id: string | null
          import_row_id: string | null
          method: Database["public"]["Enums"]["payment_method"] | null
          notes: string | null
          payment_date: string
          period_end: string | null
          period_start: string | null
          reference_number: string | null
          resident_id: string
          split_payment_group_id: string | null
          status: Database["public"]["Enums"]["payment_status"]
          updated_at: string | null
        }
        Insert: {
          amount: number
          created_at?: string | null
          house_id?: string | null
          id?: string
          import_id?: string | null
          import_row_id?: string | null
          method?: Database["public"]["Enums"]["payment_method"] | null
          notes?: string | null
          payment_date?: string
          period_end?: string | null
          period_start?: string | null
          reference_number?: string | null
          resident_id: string
          split_payment_group_id?: string | null
          status?: Database["public"]["Enums"]["payment_status"]
          updated_at?: string | null
        }
        Update: {
          amount?: number
          created_at?: string | null
          house_id?: string | null
          id?: string
          import_id?: string | null
          import_row_id?: string | null
          method?: Database["public"]["Enums"]["payment_method"] | null
          notes?: string | null
          payment_date?: string
          period_end?: string | null
          period_start?: string | null
          reference_number?: string | null
          resident_id?: string
          split_payment_group_id?: string | null
          status?: Database["public"]["Enums"]["payment_status"]
          updated_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "payment_records_house_id_fkey"
            columns: ["house_id"]
            isOneToOne: false
            referencedRelation: "houses"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "payment_records_import_id_fkey"
            columns: ["import_id"]
            isOneToOne: false
            referencedRelation: "bank_statement_imports"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "payment_records_import_row_id_fkey"
            columns: ["import_row_id"]
            isOneToOne: false
            referencedRelation: "bank_statement_rows"
            referencedColumns: ["id"]
          },
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
          resident_id: string | null
          role: Database["public"]["Enums"]["user_role"]
          role_id: string | null
          updated_at: string
        }
        Insert: {
          created_at?: string
          email: string
          full_name: string
          id: string
          resident_id?: string | null
          role?: Database["public"]["Enums"]["user_role"]
          role_id?: string | null
          updated_at?: string
        }
        Update: {
          created_at?: string
          email?: string
          full_name?: string
          id?: string
          resident_id?: string | null
          role?: Database["public"]["Enums"]["user_role"]
          role_id?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "profiles_resident_id_fkey"
            columns: ["resident_id"]
            isOneToOne: false
            referencedRelation: "residents"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "profiles_role_id_fkey"
            columns: ["role_id"]
            isOneToOne: false
            referencedRelation: "app_roles"
            referencedColumns: ["id"]
          },
        ]
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
      resident_payment_aliases: {
        Row: {
          alias_name: string
          created_at: string | null
          created_by: string | null
          id: string
          is_active: boolean | null
          notes: string | null
          resident_id: string
        }
        Insert: {
          alias_name: string
          created_at?: string | null
          created_by?: string | null
          id?: string
          is_active?: boolean | null
          notes?: string | null
          resident_id: string
        }
        Update: {
          alias_name?: string
          created_at?: string | null
          created_by?: string | null
          id?: string
          is_active?: boolean | null
          notes?: string | null
          resident_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "resident_payment_aliases_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "resident_payment_aliases_resident_id_fkey"
            columns: ["resident_id"]
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
          portal_enabled: boolean | null
          portal_enabled_at: string | null
          portal_enabled_by: string | null
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
          portal_enabled?: boolean | null
          portal_enabled_at?: string | null
          portal_enabled_by?: string | null
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
          portal_enabled?: boolean | null
          portal_enabled_at?: string | null
          portal_enabled_by?: string | null
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
            foreignKeyName: "residents_portal_enabled_by_fkey"
            columns: ["portal_enabled_by"]
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
      role_permissions: {
        Row: {
          created_at: string | null
          created_by: string | null
          id: string
          permission_id: string
          role_id: string
        }
        Insert: {
          created_at?: string | null
          created_by?: string | null
          id?: string
          permission_id: string
          role_id: string
        }
        Update: {
          created_at?: string | null
          created_by?: string | null
          id?: string
          permission_id?: string
          role_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "role_permissions_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "role_permissions_permission_id_fkey"
            columns: ["permission_id"]
            isOneToOne: false
            referencedRelation: "app_permissions"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "role_permissions_role_id_fkey"
            columns: ["role_id"]
            isOneToOne: false
            referencedRelation: "app_roles"
            referencedColumns: ["id"]
          },
        ]
      }
      security_contact_categories: {
        Row: {
          created_at: string
          default_validity_days: number
          description: string | null
          id: string
          is_active: boolean
          max_validity_days: number
          name: string
          requires_id_document: boolean
          requires_photo: boolean
          sort_order: number
          updated_at: string
        }
        Insert: {
          created_at?: string
          default_validity_days?: number
          description?: string | null
          id?: string
          is_active?: boolean
          max_validity_days?: number
          name: string
          requires_id_document?: boolean
          requires_photo?: boolean
          sort_order?: number
          updated_at?: string
        }
        Update: {
          created_at?: string
          default_validity_days?: number
          description?: string | null
          id?: string
          is_active?: boolean
          max_validity_days?: number
          name?: string
          requires_id_document?: boolean
          requires_photo?: boolean
          sort_order?: number
          updated_at?: string
        }
        Relationships: []
      }
      security_contacts: {
        Row: {
          address: string | null
          category_id: string
          created_at: string
          created_by: string | null
          employer: string | null
          full_name: string
          id: string
          id_document_url: string | null
          id_number: string | null
          id_type: Database["public"]["Enums"]["id_document_type"] | null
          next_of_kin_name: string | null
          next_of_kin_phone: string | null
          notes: string | null
          phone_primary: string
          phone_secondary: string | null
          photo_url: string | null
          relationship: string | null
          resident_id: string
          status: Database["public"]["Enums"]["security_contact_status"]
          updated_at: string
        }
        Insert: {
          address?: string | null
          category_id: string
          created_at?: string
          created_by?: string | null
          employer?: string | null
          full_name: string
          id?: string
          id_document_url?: string | null
          id_number?: string | null
          id_type?: Database["public"]["Enums"]["id_document_type"] | null
          next_of_kin_name?: string | null
          next_of_kin_phone?: string | null
          notes?: string | null
          phone_primary: string
          phone_secondary?: string | null
          photo_url?: string | null
          relationship?: string | null
          resident_id: string
          status?: Database["public"]["Enums"]["security_contact_status"]
          updated_at?: string
        }
        Update: {
          address?: string | null
          category_id?: string
          created_at?: string
          created_by?: string | null
          employer?: string | null
          full_name?: string
          id?: string
          id_document_url?: string | null
          id_number?: string | null
          id_type?: Database["public"]["Enums"]["id_document_type"] | null
          next_of_kin_name?: string | null
          next_of_kin_phone?: string | null
          notes?: string | null
          phone_primary?: string
          phone_secondary?: string | null
          photo_url?: string | null
          relationship?: string | null
          resident_id?: string
          status?: Database["public"]["Enums"]["security_contact_status"]
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "security_contacts_category_id_fkey"
            columns: ["category_id"]
            isOneToOne: false
            referencedRelation: "security_contact_categories"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "security_contacts_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "security_contacts_resident_id_fkey"
            columns: ["resident_id"]
            isOneToOne: false
            referencedRelation: "residents"
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
      transaction_tags: {
        Row: {
          color: string | null
          created_at: string
          description: string | null
          id: string
          is_active: boolean
          keywords: string[] | null
          name: string
          sort_order: number
          transaction_type: string
          updated_at: string
        }
        Insert: {
          color?: string | null
          created_at?: string
          description?: string | null
          id?: string
          is_active?: boolean
          keywords?: string[] | null
          name: string
          sort_order?: number
          transaction_type: string
          updated_at?: string
        }
        Update: {
          color?: string | null
          created_at?: string
          description?: string | null
          id?: string
          is_active?: boolean
          keywords?: string[] | null
          name?: string
          sort_order?: number
          transaction_type?: string
          updated_at?: string
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
      security_settings_view: {
        Row: {
          description: string | null
          key: string | null
          updated_at: string | null
          value: Json | null
        }
        Insert: {
          description?: string | null
          key?: string | null
          updated_at?: string | null
          value?: never
        }
        Update: {
          description?: string | null
          key?: string | null
          updated_at?: string | null
          value?: never
        }
        Relationships: []
      }
    }
    Functions: {
      generate_access_code: { Args: never; Returns: string }
      generate_resident_code: { Args: never; Returns: string }
      get_my_permissions: {
        Args: never
        Returns: {
          category: Database["public"]["Enums"]["permission_category"]
          permission_name: string
        }[]
      }
      get_my_resident_id: { Args: never; Returns: string }
      get_my_role: {
        Args: never
        Returns: Database["public"]["Enums"]["user_role"]
      }
      get_my_role_name: { Args: never; Returns: string }
      has_permission: { Args: { p_permission_name: string }; Returns: boolean }
      has_security_permission: {
        Args: { permission_name: string }
        Returns: boolean
      }
      is_resident: { Args: never; Returns: boolean }
      is_super_admin: { Args: never; Returns: boolean }
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
      access_code_type: "permanent" | "one_time"
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
      id_document_type:
        | "nin"
        | "voters_card"
        | "drivers_license"
        | "passport"
        | "company_id"
        | "other"
      invoice_status: "unpaid" | "paid" | "void" | "partially_paid"
      invoice_type_enum: "SERVICE_CHARGE" | "LEVY" | "ADJUSTMENT" | "OTHER"
      payment_method: "cash" | "bank_transfer" | "pos" | "cheque"
      payment_status: "pending" | "paid" | "overdue" | "failed"
      permission_category:
        | "residents"
        | "houses"
        | "payments"
        | "billing"
        | "security"
        | "reports"
        | "settings"
        | "imports"
        | "approvals"
        | "system"
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
      security_contact_status: "active" | "suspended" | "expired" | "revoked"
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
      access_code_type: ["permanent", "one_time"],
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
      id_document_type: [
        "nin",
        "voters_card",
        "drivers_license",
        "passport",
        "company_id",
        "other",
      ],
      invoice_status: ["unpaid", "paid", "void", "partially_paid"],
      invoice_type_enum: ["SERVICE_CHARGE", "LEVY", "ADJUSTMENT", "OTHER"],
      payment_method: ["cash", "bank_transfer", "pos", "cheque"],
      payment_status: ["pending", "paid", "overdue", "failed"],
      permission_category: [
        "residents",
        "houses",
        "payments",
        "billing",
        "security",
        "reports",
        "settings",
        "imports",
        "approvals",
        "system",
      ],
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
      security_contact_status: ["active", "suspended", "expired", "revoked"],
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
