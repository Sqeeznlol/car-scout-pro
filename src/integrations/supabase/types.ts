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
      algorithm_insights: {
        Row: {
          autoscout_check_rate: number | null
          avg_time_on_interesting_ms: number | null
          avg_time_on_skip_ms: number | null
          calculated_at: string
          conversion_rate: number | null
          id: string
          margin_correlation: number | null
          market_price_correlation: number | null
          mileage_correlation: number | null
          preferred_fuel_types: Json | null
          preferred_makes: Json | null
          preferred_margin_min_chf: number | null
          preferred_mileage_max: number | null
          preferred_price_max_eur: number | null
          preferred_price_min_eur: number | null
          preferred_year_max: number | null
          preferred_year_min: number | null
          raw_insights: Json | null
          total_decisions: number | null
          total_interesting: number | null
        }
        Insert: {
          autoscout_check_rate?: number | null
          avg_time_on_interesting_ms?: number | null
          avg_time_on_skip_ms?: number | null
          calculated_at?: string
          conversion_rate?: number | null
          id?: string
          margin_correlation?: number | null
          market_price_correlation?: number | null
          mileage_correlation?: number | null
          preferred_fuel_types?: Json | null
          preferred_makes?: Json | null
          preferred_margin_min_chf?: number | null
          preferred_mileage_max?: number | null
          preferred_price_max_eur?: number | null
          preferred_price_min_eur?: number | null
          preferred_year_max?: number | null
          preferred_year_min?: number | null
          raw_insights?: Json | null
          total_decisions?: number | null
          total_interesting?: number | null
        }
        Update: {
          autoscout_check_rate?: number | null
          avg_time_on_interesting_ms?: number | null
          avg_time_on_skip_ms?: number | null
          calculated_at?: string
          conversion_rate?: number | null
          id?: string
          margin_correlation?: number | null
          market_price_correlation?: number | null
          mileage_correlation?: number | null
          preferred_fuel_types?: Json | null
          preferred_makes?: Json | null
          preferred_margin_min_chf?: number | null
          preferred_mileage_max?: number | null
          preferred_price_max_eur?: number | null
          preferred_price_min_eur?: number | null
          preferred_year_max?: number | null
          preferred_year_min?: number | null
          raw_insights?: Json | null
          total_decisions?: number | null
          total_interesting?: number | null
        }
        Relationships: []
      }
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
      decision_events: {
        Row: {
          decided_at: string
          decision: string
          distance_km: number | null
          id: string
          margin_chf: number | null
          market_price_ch: number | null
          price_vs_market_percent: number | null
          scrolled_to_autoscout: boolean | null
          scrolled_to_market: boolean | null
          seller_type: string | null
          session_id: string
          tapped_autoscout: boolean | null
          tapped_listing: boolean | null
          time_on_card_ms: number | null
          vehicle_fuel_type: string | null
          vehicle_id: string | null
          vehicle_make: string | null
          vehicle_mileage: number | null
          vehicle_model: string | null
          vehicle_price_eur: number | null
          vehicle_year: number | null
        }
        Insert: {
          decided_at?: string
          decision: string
          distance_km?: number | null
          id?: string
          margin_chf?: number | null
          market_price_ch?: number | null
          price_vs_market_percent?: number | null
          scrolled_to_autoscout?: boolean | null
          scrolled_to_market?: boolean | null
          seller_type?: string | null
          session_id: string
          tapped_autoscout?: boolean | null
          tapped_listing?: boolean | null
          time_on_card_ms?: number | null
          vehicle_fuel_type?: string | null
          vehicle_id?: string | null
          vehicle_make?: string | null
          vehicle_mileage?: number | null
          vehicle_model?: string | null
          vehicle_price_eur?: number | null
          vehicle_year?: number | null
        }
        Update: {
          decided_at?: string
          decision?: string
          distance_km?: number | null
          id?: string
          margin_chf?: number | null
          market_price_ch?: number | null
          price_vs_market_percent?: number | null
          scrolled_to_autoscout?: boolean | null
          scrolled_to_market?: boolean | null
          seller_type?: string | null
          session_id?: string
          tapped_autoscout?: boolean | null
          tapped_listing?: boolean | null
          time_on_card_ms?: number | null
          vehicle_fuel_type?: string | null
          vehicle_id?: string | null
          vehicle_make?: string | null
          vehicle_mileage?: number | null
          vehicle_model?: string | null
          vehicle_price_eur?: number | null
          vehicle_year?: number | null
        }
        Relationships: [
          {
            foreignKeyName: "decision_events_vehicle_id_fkey"
            columns: ["vehicle_id"]
            isOneToOne: false
            referencedRelation: "vehicles"
            referencedColumns: ["id"]
          },
        ]
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
      notification_filters: {
        Row: {
          created_at: string
          fuel_types: string[]
          id: string
          is_active: boolean
          makes: string[]
          max_mileage: number | null
          max_price_eur: number | null
          min_deal_score: number | null
          min_margin_chf: number | null
          models: string[]
          name: string
          telegram_bot_token: string
          telegram_chat_id: string
          updated_at: string
        }
        Insert: {
          created_at?: string
          fuel_types?: string[]
          id?: string
          is_active?: boolean
          makes?: string[]
          max_mileage?: number | null
          max_price_eur?: number | null
          min_deal_score?: number | null
          min_margin_chf?: number | null
          models?: string[]
          name?: string
          telegram_bot_token?: string
          telegram_chat_id?: string
          updated_at?: string
        }
        Update: {
          created_at?: string
          fuel_types?: string[]
          id?: string
          is_active?: boolean
          makes?: string[]
          max_mileage?: number | null
          max_price_eur?: number | null
          min_deal_score?: number | null
          min_margin_chf?: number | null
          models?: string[]
          name?: string
          telegram_bot_token?: string
          telegram_chat_id?: string
          updated_at?: string
        }
        Relationships: []
      }
      user_sessions: {
        Row: {
          browser: string | null
          city: string | null
          country: string | null
          device_type: string | null
          first_seen: string
          id: string
          ip_address: string | null
          last_seen: string
          latitude: number | null
          longitude: number | null
          os: string | null
          region: string | null
          screen_height: number | null
          screen_width: number | null
          session_id: string
          total_decisions: number
          total_interesting: number
          user_agent: string | null
        }
        Insert: {
          browser?: string | null
          city?: string | null
          country?: string | null
          device_type?: string | null
          first_seen?: string
          id?: string
          ip_address?: string | null
          last_seen?: string
          latitude?: number | null
          longitude?: number | null
          os?: string | null
          region?: string | null
          screen_height?: number | null
          screen_width?: number | null
          session_id: string
          total_decisions?: number
          total_interesting?: number
          user_agent?: string | null
        }
        Update: {
          browser?: string | null
          city?: string | null
          country?: string | null
          device_type?: string | null
          first_seen?: string
          id?: string
          ip_address?: string | null
          last_seen?: string
          latitude?: number | null
          longitude?: number | null
          os?: string | null
          region?: string | null
          screen_height?: number | null
          screen_width?: number | null
          session_id?: string
          total_decisions?: number
          total_interesting?: number
          user_agent?: string | null
        }
        Relationships: []
      }
      vehicle_analyses: {
        Row: {
          automobilsteuer_chf: number | null
          autoscout_ch_comparable_count: number | null
          autoscout_ch_price_avg: number | null
          autoscout_ch_price_max: number | null
          autoscout_ch_price_min: number | null
          autoscout_ch_scraped_at: string | null
          autoscout_ch_url: string | null
          ch_mwst_chf: number | null
          computed_at: string
          customs_chf: number | null
          de_mwst_erstattung_chf: number | null
          deal_score: number | null
          expected_margin_chf: number | null
          learning_score: number | null
          liquidity_score: number | null
          margin_score: number | null
          margin_with_mwst_chf: number | null
          margin_without_mwst_chf: number | null
          market_value_chf: number | null
          max_buy_with_mwst_eur: number | null
          max_buy_without_mwst_eur: number | null
          mfk_chf: number | null
          mwst_saving_chf: number | null
          netto_kaufpreis_chf: number | null
          preparation_chf: number | null
          price_chf: number | null
          risk_score: number | null
          seller_has_mwst: boolean | null
          total_cost_chf: number | null
          total_with_mwst_chf: number | null
          total_without_mwst_chf: number | null
          transport_chf: number | null
          vat_chf: number | null
          vehicle_id: string
          zoll_chf: number | null
        }
        Insert: {
          automobilsteuer_chf?: number | null
          autoscout_ch_comparable_count?: number | null
          autoscout_ch_price_avg?: number | null
          autoscout_ch_price_max?: number | null
          autoscout_ch_price_min?: number | null
          autoscout_ch_scraped_at?: string | null
          autoscout_ch_url?: string | null
          ch_mwst_chf?: number | null
          computed_at?: string
          customs_chf?: number | null
          de_mwst_erstattung_chf?: number | null
          deal_score?: number | null
          expected_margin_chf?: number | null
          learning_score?: number | null
          liquidity_score?: number | null
          margin_score?: number | null
          margin_with_mwst_chf?: number | null
          margin_without_mwst_chf?: number | null
          market_value_chf?: number | null
          max_buy_with_mwst_eur?: number | null
          max_buy_without_mwst_eur?: number | null
          mfk_chf?: number | null
          mwst_saving_chf?: number | null
          netto_kaufpreis_chf?: number | null
          preparation_chf?: number | null
          price_chf?: number | null
          risk_score?: number | null
          seller_has_mwst?: boolean | null
          total_cost_chf?: number | null
          total_with_mwst_chf?: number | null
          total_without_mwst_chf?: number | null
          transport_chf?: number | null
          vat_chf?: number | null
          vehicle_id: string
          zoll_chf?: number | null
        }
        Update: {
          automobilsteuer_chf?: number | null
          autoscout_ch_comparable_count?: number | null
          autoscout_ch_price_avg?: number | null
          autoscout_ch_price_max?: number | null
          autoscout_ch_price_min?: number | null
          autoscout_ch_scraped_at?: string | null
          autoscout_ch_url?: string | null
          ch_mwst_chf?: number | null
          computed_at?: string
          customs_chf?: number | null
          de_mwst_erstattung_chf?: number | null
          deal_score?: number | null
          expected_margin_chf?: number | null
          learning_score?: number | null
          liquidity_score?: number | null
          margin_score?: number | null
          margin_with_mwst_chf?: number | null
          margin_without_mwst_chf?: number | null
          market_value_chf?: number | null
          max_buy_with_mwst_eur?: number | null
          max_buy_without_mwst_eur?: number | null
          mfk_chf?: number | null
          mwst_saving_chf?: number | null
          netto_kaufpreis_chf?: number | null
          preparation_chf?: number | null
          price_chf?: number | null
          risk_score?: number | null
          seller_has_mwst?: boolean | null
          total_cost_chf?: number | null
          total_with_mwst_chf?: number | null
          total_without_mwst_chf?: number | null
          transport_chf?: number | null
          vat_chf?: number | null
          vehicle_id?: string
          zoll_chf?: number | null
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
          co2_gkm: number | null
          consumption: string | null
          created_at: string
          distance_computed_at: string | null
          distance_km: number | null
          distance_minutes: number | null
          emission_class: string | null
          fuel: string | null
          id: string
          image_url: string | null
          latitude: number | null
          listing_url: string | null
          location: string | null
          longitude: number | null
          make: string | null
          mileage_km: number | null
          model: string | null
          power_kw: number | null
          power_ps: number | null
          price_eur: number | null
          raw_text: string | null
          received_at: string | null
          registration_month: number | null
          seller_address: string | null
          seller_has_mwst: boolean | null
          seller_name: string | null
          seller_phone: string | null
          seller_type: string | null
          seller_website: string | null
          skip_reason: string | null
          source: string
          source_message_id: string | null
          telegram_sent: boolean
          telegram_sent_at: string | null
          title: string
          transmission: string | null
          variant: string | null
          year: number | null
        }
        Insert: {
          co2_gkm?: number | null
          consumption?: string | null
          created_at?: string
          distance_computed_at?: string | null
          distance_km?: number | null
          distance_minutes?: number | null
          emission_class?: string | null
          fuel?: string | null
          id?: string
          image_url?: string | null
          latitude?: number | null
          listing_url?: string | null
          location?: string | null
          longitude?: number | null
          make?: string | null
          mileage_km?: number | null
          model?: string | null
          power_kw?: number | null
          power_ps?: number | null
          price_eur?: number | null
          raw_text?: string | null
          received_at?: string | null
          registration_month?: number | null
          seller_address?: string | null
          seller_has_mwst?: boolean | null
          seller_name?: string | null
          seller_phone?: string | null
          seller_type?: string | null
          seller_website?: string | null
          skip_reason?: string | null
          source?: string
          source_message_id?: string | null
          telegram_sent?: boolean
          telegram_sent_at?: string | null
          title: string
          transmission?: string | null
          variant?: string | null
          year?: number | null
        }
        Update: {
          co2_gkm?: number | null
          consumption?: string | null
          created_at?: string
          distance_computed_at?: string | null
          distance_km?: number | null
          distance_minutes?: number | null
          emission_class?: string | null
          fuel?: string | null
          id?: string
          image_url?: string | null
          latitude?: number | null
          listing_url?: string | null
          location?: string | null
          longitude?: number | null
          make?: string | null
          mileage_km?: number | null
          model?: string | null
          power_kw?: number | null
          power_ps?: number | null
          price_eur?: number | null
          raw_text?: string | null
          received_at?: string | null
          registration_month?: number | null
          seller_address?: string | null
          seller_has_mwst?: boolean | null
          seller_name?: string | null
          seller_phone?: string | null
          seller_type?: string | null
          seller_website?: string | null
          skip_reason?: string | null
          source?: string
          source_message_id?: string | null
          telegram_sent?: boolean
          telegram_sent_at?: string | null
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
      increment_session_decisions: {
        Args: { p_interesting: number; p_session_id: string }
        Returns: undefined
      }
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
