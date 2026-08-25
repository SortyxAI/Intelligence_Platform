export type Json = string | number | boolean | null | { [key: string]: Json | undefined } | Json[];

export interface Database {
  public: {
    Tables: {
      material_config: {
        Row: {
          id: string;
          material: string;
          category: string;
          co2e_factor: number | null;
          rate_per_kg: number | null;
          method: string | null;
          source: string | null;
          is_proxy: boolean;
          is_active: boolean;
          created_at: string;
          updated_at: string;
        };
      };
      waste_records: {
        Row: {
          id: string;
          organization_id: string;
          bin_id: string | null;
          telemetry_event_id: string | null;
          material: string;
          category: string;
          weight_kg: number;
          co2e_factor_used: number | null;
          co2e_avoided_kg: number | null;
          rate_per_kg_used: number | null;
          estimated_value_inr: number | null;
          calculation_method: string | null;
          source: string | null;
          is_proxy: boolean;
          recorded_at: string;
          created_at: string;
        };
      };
      bins: {
        Row: {
          id: string;
          organization_id: string;
          customer_id: string | null;
          device_id: string;
          serial_number: string;
          bin_type: "one" | "two" | "three" | "four";
          status: "active" | "maintenance" | "offline" | "decommissioned";
          latitude: number | null;
          longitude: number | null;
          latest_fill_level: number | null;
          [key: string]: unknown;
        };
      };
      profiles: {
        Row: {
          id: string;
          email: string;
          role: "admin" | "customer";
          organization_id: string | null;
          customer_id: string | null;
          full_name: string | null;
          fcm_token: string | null;
          phone: string | null;
          telegram_chat_id: string | null;
          notify_email: boolean;
          notify_telegram: boolean;
          notify_whatsapp: boolean;
        };
      };
    };
  };
}
