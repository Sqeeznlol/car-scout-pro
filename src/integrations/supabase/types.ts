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
    PostgrestVersion: "14.5"
  }
  public: {
    Tables: {
      app_config: {
        Row: {
          automobilsteuer_rate: number
          chf_per_km: number
          co2_threshold_gkm: number
          customs_flat: number
          eur_chf_rate: number
          id: number
          mfk_flat: number
          preparation_flat: number
          target_margin_chf: number
          updated_at: string
          vat_rate: number
          weight_learning: number
          weight_liquidity: number
          weight_margin: number
          weight_risk: number
        }
        Insert: {
          automobilsteuer_rate?: number
          chf_per_km?: number
          co2_threshold_gkm?: number
          customs_flat?: number
          eur_chf_rate?: number
          id?: number
          mfk_flat?: number
          preparation_flat?: number
          target_margin_chf?: number
          updated_at?: string
          vat_rate?: number
          weight_learning?: number
          weight_liquidity?: number
          weight_margin?: number
          weight_risk?: number
        }
        Update: {
          automobilsteuer_rate?: number
          chf_per_km?: number
          co2_threshold_gkm?: number
          customs_flat?: number
          eur_chf_rate?: number
          id?: number
          mfk_flat?: number
          preparation_flat?: number
          target_margin_chf?: number
          updated_at?: string
          vat_rate?: number
          weight_learning?: number
          weight_liquidity?: number
          weight_margin?: number
          weight_risk?: number
        }
        Relationships: []
      }
      decisions: {
        Row: {
          decided_at: string
          decision: Database["public"]["Enums"]["decision_type"]
          id: string
          notes: string | null
          vehicle_id: string
        }
        Insert: {
          decided_at?: string
          decision: Database["public"]["Enums"]["decision_type"]
          id?: string
          notes?: string | null
          vehicle_id: string
        }
        Update: {
          decided_at?: string
          decision?: Database["public"]["Enums"]["decision_type"]
          id?: string
          notes?: string | null
          vehicle_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "decisions_vehicle_id_fkey"
            columns: ["vehicle_id"]
            isOneToOne: true
            referencedRelation: "vehicles"
            referencedColumns: ["id"]
          },
        ]
      }
      email_sync_state: {
        Row: {
          id: number
          last_history_id: string | null
          last_message_internal_date: number | null
          last_synced_at: string | null
        }
        Insert: {
          id?: number
          last_history_id?: string | null
          last_message_internal_date?: number | null
          last_synced_at?: string | null
        }
        Update: {
          id?: number
          last_history_id?: string | null
          last_message_internal_date?: number | null
          last_synced_at?: string | null
        }
        Relationships: []
      }
      vehicle_analyses: {
        Row: {
          automobilsteuer_chf: number | null
          computed_at: string
          customs_chf: number | null
          deal_score: number | null
          expected_margin_chf: number | null
          learning_score: number | null
          liquidity_score: number | null
          margin_score: number | null
          market_value_chf: number | null
          mfk_chf: number | null
          preparation_chf: number | null
          price_chf: number | null
          risk_score: number | null
          total_cost_chf: number | null
          transport_chf: number | null
          vat_chf: number | null
          vehicle_id: string
        }
        Insert: {
          automobilsteuer_chf?: number | null
          computed_at?: string
          customs_chf?: number | null
          deal_score?: number | null
          expected_margin_chf?: number | null
          learning_score?: number | null
          liquidity_score?: number | null
          margin_score?: number | null
          market_value_chf?: number | null
          mfk_chf?: number | null
          preparation_chf?: number | null
          price_chf?: number | null
          risk_score?: number | null
          total_cost_chf?: number | null
          transport_chf?: number | null
          vat_chf?: number | null
          vehicle_id: string
        }
        Update: {
          automobilsteuer_chf?: number | null
          computed_at?: string
          customs_chf?: number | null
          deal_score?: number | null
          expected_margin_chf?: number | null
          learning_score?: number | null
          liquidity_score?: number | null
          margin_score?: number | null
          market_value_chf?: number | null
          mfk_chf?: number | null
          preparation_chf?: number | null
          price_chf?: number | null
          risk_score?: number | null
          total_cost_chf?: number | null
          transport_chf?: number | null
          vat_chf?: number | null
          vehicle_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "vehicle_analyses_vehicle_id_fkey"
            columns: ["vehicle_id"]
            isOneToOne: true
            referencedRelation: "vehicles"
            referencedColumns: ["id"]
          },
        ]
      }
      vehicles: {
        Row: {
          created_at: string
          fuel: string | null
          id: string
          image_url: string | null
          listing_url: string | null
          location: string | null
          make: string | null
          mileage_km: number | null
          model: string | null
          power_kw: number | null
          price_eur: number | null
          raw_text: string | null
          received_at: string | null
          seller_name: string | null
          seller_type: string | null
          source: string
          source_message_id: string | null
          title: string
          transmission: string | null
          variant: string | null
          year: number | null
        }
        Insert: {
          created_at?: string
          fuel?: string | null
          id?: string
          image_url?: string | null
          listing_url?: string | null
          location?: string | null
          make?: string | null
          mileage_km?: number | null
          model?: string | null
          power_kw?: number | null
          price_eur?: number | null
          raw_text?: string | null
          received_at?: string | null
          seller_name?: string | null
          seller_type?: string | null
          source?: string
          source_message_id?: string | null
          title: string
          transmission?: string | null
          variant?: string | null
          year?: number | null
        }
        Update: {
          created_at?: string
          fuel?: string | null
          id?: string
          image_url?: string | null
          listing_url?: string | null
          location?: string | null
          make?: string | null
          mileage_km?: number | null
          model?: string | null
          power_kw?: number | null
          price_eur?: number | null
          raw_text?: string | null
          received_at?: string | null
          seller_name?: string | null
          seller_type?: string | null
          source?: string
          source_message_id?: string | null
          title?: string
          transmission?: string | null
          variant?: string | null
          year?: number | null
        }
        Relationships: []
      }
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      [_ in never]: never
    }
    Enums: {
      decision_type: "interesting" | "maybe" | "skip"
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
      decision_type: ["interesting", "maybe", "skip"],
    },
  },
} as const
