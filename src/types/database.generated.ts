export type Json =
  | string
  | number
  | boolean
  | null
  | { [key: string]: Json | undefined }
  | Json[]

export type Database = {
  graphql_public: {
    Tables: {
      [_ in never]: never
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      graphql: {
        Args: {
          extensions?: Json
          operationName?: string
          query?: string
          variables?: Json
        }
        Returns: Json
      }
    }
    Enums: {
      [_ in never]: never
    }
    CompositeTypes: {
      [_ in never]: never
    }
  }
  public: {
    Tables: {
      house_types: {
        Row: {
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
          created_at: string
          created_by: string | null
          house_number: string
          house_type_id: string | null
          id: string
          is_active: boolean
          is_occupied: boolean
          notes: string | null
          street_id: string
          updated_at: string
        }
        Insert: {
          address_line_2?: string | null
          created_at?: string
          created_by?: string | null
          house_number: string
          house_type_id?: string | null
          id?: string
          is_active?: boolean
          is_occupied?: boolean
          notes?: string | null
          street_id: string
          updated_at?: string
        }
        Update: {
          address_line_2?: string | null
          created_at?: string
          created_by?: string | null
          house_number?: string
          house_type_id?: string | null
          id?: string
          is_active?: boolean
          is_occupied?: boolean
          notes?: string | null
          street_id?: string
          updated_at?: string
        }
        Relationships: [
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
          is_primary: boolean
          move_in_date: string
          move_out_date: string | null
          resident_id: string
          resident_role: Database["public"]["Enums"]["resident_role"]
          updated_at: string
        }
        Insert: {
          created_at?: string
          created_by?: string | null
          house_id: string
          id?: string
          is_active?: boolean
          is_primary?: boolean
          move_in_date?: string
          move_out_date?: string | null
          resident_id: string
          resident_role?: Database["public"]["Enums"]["resident_role"]
          updated_at?: string
        }
        Update: {
          created_at?: string
          created_by?: string | null
          house_id?: string
          id?: string
          is_active?: boolean
          is_primary?: boolean
          move_in_date?: string
          move_out_date?: string | null
          resident_id?: string
          resident_role?: Database["public"]["Enums"]["resident_role"]
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
        ]
      }
      residents: {
        Row: {
          account_status: Database["public"]["Enums"]["account_status"]
          created_at: string
          created_by: string | null
          email: string | null
          emergency_contact_name: string | null
          emergency_contact_phone: string | null
          emergency_contact_relationship: string | null
          emergency_contact_resident_id: string | null
          first_name: string
          id: string
          id_number: string | null
          id_type: string | null
          id_verified_at: string | null
          id_verified_by: string | null
          last_name: string
          notes: string | null
          phone_primary: string
          phone_secondary: string | null
          photo_url: string | null
          resident_code: string
          resident_type: Database["public"]["Enums"]["resident_type"]
          updated_at: string
          updated_by: string | null
          verification_status: Database["public"]["Enums"]["verification_status"]
        }
        Insert: {
          account_status?: Database["public"]["Enums"]["account_status"]
          created_at?: string
          created_by?: string | null
          email?: string | null
          emergency_contact_name?: string | null
          emergency_contact_phone?: string | null
          emergency_contact_relationship?: string | null
          emergency_contact_resident_id?: string | null
          first_name: string
          id?: string
          id_number?: string | null
          id_type?: string | null
          id_verified_at?: string | null
          id_verified_by?: string | null
          last_name: string
          notes?: string | null
          phone_primary: string
          phone_secondary?: string | null
          photo_url?: string | null
          resident_code: string
          resident_type?: Database["public"]["Enums"]["resident_type"]
          updated_at?: string
          updated_by?: string | null
          verification_status?: Database["public"]["Enums"]["verification_status"]
        }
        Update: {
          account_status?: Database["public"]["Enums"]["account_status"]
          created_at?: string
          created_by?: string | null
          email?: string | null
          emergency_contact_name?: string | null
          emergency_contact_phone?: string | null
          emergency_contact_relationship?: string | null
          emergency_contact_resident_id?: string | null
          first_name?: string
          id?: string
          id_number?: string | null
          id_type?: string | null
          id_verified_at?: string | null
          id_verified_by?: string | null
          last_name?: string
          notes?: string | null
          phone_primary?: string
          phone_secondary?: string | null
          photo_url?: string | null
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
          updated_at: string
        }
        Insert: {
          created_at?: string
          created_by?: string | null
          description?: string | null
          id?: string
          is_active?: boolean
          name: string
          updated_at?: string
        }
        Update: {
          created_at?: string
          created_by?: string | null
          description?: string | null
          id?: string
          is_active?: boolean
          name?: string
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
    }
    Enums: {
      account_status: "active" | "inactive" | "suspended" | "archived"
      resident_role:
        | "owner"
        | "tenant"
        | "occupier"
        | "domestic_staff"
        | "family_member"
      resident_type: "primary" | "secondary"
      user_role:
        | "chairman"
        | "financial_secretary"
        | "security_officer"
        | "admin"
      verification_status: "pending" | "submitted" | "verified" | "rejected"
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
  graphql_public: {
    Enums: {},
  },
  public: {
    Enums: {
      account_status: ["active", "inactive", "suspended", "archived"],
      resident_role: [
        "owner",
        "tenant",
        "occupier",
        "domestic_staff",
        "family_member",
      ],
      resident_type: ["primary", "secondary"],
      user_role: [
        "chairman",
        "financial_secretary",
        "security_officer",
        "admin",
      ],
      verification_status: ["pending", "submitted", "verified", "rejected"],
    },
  },
} as const

