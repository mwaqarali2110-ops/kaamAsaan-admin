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
      battery_uplift_rules: {
        Row: {
          created_at: string
          id: string
          is_active: boolean
          label: string
          max_battery_bank_kwh: number | null
          min_battery_bank_kwh: number
          minimum_inverter_kw: number | null
          minimum_pv_kwp: number | null
          priority: number
          requires_expert_review: boolean
          updated_at: string
        }
        Insert: {
          created_at?: string
          id?: string
          is_active?: boolean
          label: string
          max_battery_bank_kwh?: number | null
          min_battery_bank_kwh: number
          minimum_inverter_kw?: number | null
          minimum_pv_kwp?: number | null
          priority?: number
          requires_expert_review?: boolean
          updated_at?: string
        }
        Update: {
          created_at?: string
          id?: string
          is_active?: boolean
          label?: string
          max_battery_bank_kwh?: number | null
          min_battery_bank_kwh?: number
          minimum_inverter_kw?: number | null
          minimum_pv_kwp?: number | null
          priority?: number
          requires_expert_review?: boolean
          updated_at?: string
        }
        Relationships: []
      }
      brands: {
        Row: {
          aliases: string[]
          canonical_slug: string | null
          category: Database["public"]["Enums"]["product_category"] | null
          created_at: string
          default_compatibility_group: string | null
          id: string
          is_active: boolean
          logo_url: string | null
          name: string
          package_generation_enabled: boolean
          package_image_url: string | null
          priority: number
          slug: string
          updated_at: string
        }
        Insert: {
          aliases?: string[]
          canonical_slug?: string | null
          category?: Database["public"]["Enums"]["product_category"] | null
          created_at?: string
          default_compatibility_group?: string | null
          id?: string
          is_active?: boolean
          logo_url?: string | null
          name: string
          package_generation_enabled?: boolean
          package_image_url?: string | null
          priority?: number
          slug: string
          updated_at?: string
        }
        Update: {
          aliases?: string[]
          canonical_slug?: string | null
          category?: Database["public"]["Enums"]["product_category"] | null
          created_at?: string
          default_compatibility_group?: string | null
          id?: string
          is_active?: boolean
          logo_url?: string | null
          name?: string
          package_generation_enabled?: boolean
          package_image_url?: string | null
          priority?: number
          slug?: string
          updated_at?: string
        }
        Relationships: []
      }
      family_compatibility: {
        Row: {
          battery_family_id: string
          created_at: string
          id: string
          inverter_family_id: string
          is_active: boolean
          notes: string | null
          priority: number
          status: string
          updated_at: string
        }
        Insert: {
          battery_family_id: string
          created_at?: string
          id?: string
          inverter_family_id: string
          is_active?: boolean
          notes?: string | null
          priority?: number
          status?: string
          updated_at?: string
        }
        Update: {
          battery_family_id?: string
          created_at?: string
          id?: string
          inverter_family_id?: string
          is_active?: boolean
          notes?: string | null
          priority?: number
          status?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "family_compatibility_battery_family_id_fkey"
            columns: ["battery_family_id"]
            isOneToOne: false
            referencedRelation: "product_families"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "family_compatibility_inverter_family_id_fkey"
            columns: ["inverter_family_id"]
            isOneToOne: false
            referencedRelation: "product_families"
            referencedColumns: ["id"]
          },
        ]
      }
      load_sizing_rules: {
        Row: {
          base_inverter_kw: number | null
          base_pv_kwp: number | null
          created_at: string
          id: string
          is_active: boolean
          label: string
          max_running_load_kw: number | null
          min_running_load_kw: number
          priority: number
          requires_expert_review: boolean
          updated_at: string
        }
        Insert: {
          base_inverter_kw?: number | null
          base_pv_kwp?: number | null
          created_at?: string
          id?: string
          is_active?: boolean
          label: string
          max_running_load_kw?: number | null
          min_running_load_kw: number
          priority?: number
          requires_expert_review?: boolean
          updated_at?: string
        }
        Update: {
          base_inverter_kw?: number | null
          base_pv_kwp?: number | null
          created_at?: string
          id?: string
          is_active?: boolean
          label?: string
          max_running_load_kw?: number | null
          min_running_load_kw?: number
          priority?: number
          requires_expert_review?: boolean
          updated_at?: string
        }
        Relationships: []
      }
      maintenance_feedback: {
        Row: {
          comments: string | null
          created_at: string
          id: string
          needs_follow_up: boolean
          overall_rating: number
          plan_id: string
          professionalism_rating: number | null
          punctuality_rating: number | null
          service_quality_rating: number | null
          user_id: string
          visit_id: string
        }
        Insert: {
          comments?: string | null
          created_at?: string
          id?: string
          needs_follow_up?: boolean
          overall_rating: number
          plan_id: string
          professionalism_rating?: number | null
          punctuality_rating?: number | null
          service_quality_rating?: number | null
          user_id: string
          visit_id: string
        }
        Update: {
          comments?: string | null
          created_at?: string
          id?: string
          needs_follow_up?: boolean
          overall_rating?: number
          plan_id?: string
          professionalism_rating?: number | null
          punctuality_rating?: number | null
          service_quality_rating?: number | null
          user_id?: string
          visit_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "maintenance_feedback_plan_id_fkey"
            columns: ["plan_id"]
            isOneToOne: false
            referencedRelation: "maintenance_plans"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "maintenance_feedback_visit_id_fkey"
            columns: ["visit_id"]
            isOneToOne: true
            referencedRelation: "maintenance_visits"
            referencedColumns: ["id"]
          },
        ]
      }
      maintenance_plans: {
        Row: {
          assigned_team_id: string | null
          assigned_team_name: string | null
          assigned_team_phone: string | null
          cancellation_reason: string | null
          cancelled_at: string | null
          created_at: string
          current_visit_number: number
          end_date: string
          id: string
          maintenance_request_id: string
          plan_type: string
          price: number
          reference: string
          start_date: string
          status: string
          total_visits: number
          updated_at: string
          user_id: string
          visit_interval_months: number
        }
        Insert: {
          assigned_team_id?: string | null
          assigned_team_name?: string | null
          assigned_team_phone?: string | null
          cancellation_reason?: string | null
          cancelled_at?: string | null
          created_at?: string
          current_visit_number?: number
          end_date: string
          id?: string
          maintenance_request_id: string
          plan_type?: string
          price?: number
          reference: string
          start_date: string
          status?: string
          total_visits?: number
          updated_at?: string
          user_id: string
          visit_interval_months?: number
        }
        Update: {
          assigned_team_id?: string | null
          assigned_team_name?: string | null
          assigned_team_phone?: string | null
          cancellation_reason?: string | null
          cancelled_at?: string | null
          created_at?: string
          current_visit_number?: number
          end_date?: string
          id?: string
          maintenance_request_id?: string
          plan_type?: string
          price?: number
          reference?: string
          start_date?: string
          status?: string
          total_visits?: number
          updated_at?: string
          user_id?: string
          visit_interval_months?: number
        }
        Relationships: [
          {
            foreignKeyName: "maintenance_plans_maintenance_request_id_fkey"
            columns: ["maintenance_request_id"]
            isOneToOne: true
            referencedRelation: "maintenance_requests"
            referencedColumns: ["id"]
          },
        ]
      }
      maintenance_requests: {
        Row: {
          address: string
          cancellation_note: string | null
          cancellation_reason: string | null
          cancelled_at: string | null
          cancelled_by: string | null
          city: string
          created_at: string
          customer_name: string
          frequency: string
          id: string
          idempotency_key: string | null
          maintenance_plan_id: string | null
          notes: string | null
          phone: string
          plan_id: string
          plan_price: number
          plan_title: string
          preferred_date: string
          preferred_time_slot: string
          reference_number: string
          service_type: string
          status: string
          updated_at: string
          user_id: string
        }
        Insert: {
          address: string
          cancellation_note?: string | null
          cancellation_reason?: string | null
          cancelled_at?: string | null
          cancelled_by?: string | null
          city: string
          created_at?: string
          customer_name: string
          frequency: string
          id?: string
          idempotency_key?: string | null
          maintenance_plan_id?: string | null
          notes?: string | null
          phone: string
          plan_id: string
          plan_price?: number
          plan_title: string
          preferred_date: string
          preferred_time_slot: string
          reference_number: string
          service_type: string
          status?: string
          updated_at?: string
          user_id: string
        }
        Update: {
          address?: string
          cancellation_note?: string | null
          cancellation_reason?: string | null
          cancelled_at?: string | null
          cancelled_by?: string | null
          city?: string
          created_at?: string
          customer_name?: string
          frequency?: string
          id?: string
          idempotency_key?: string | null
          maintenance_plan_id?: string | null
          notes?: string | null
          phone?: string
          plan_id?: string
          plan_price?: number
          plan_title?: string
          preferred_date?: string
          preferred_time_slot?: string
          reference_number?: string
          service_type?: string
          status?: string
          updated_at?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "maintenance_requests_maintenance_plan_id_fkey"
            columns: ["maintenance_plan_id"]
            isOneToOne: false
            referencedRelation: "maintenance_plans"
            referencedColumns: ["id"]
          },
        ]
      }
      maintenance_status_history: {
        Row: {
          changed_by: string | null
          changed_by_role: string
          created_at: string
          id: string
          new_status: string
          notes: string | null
          plan_id: string
          previous_status: string | null
          visit_id: string | null
        }
        Insert: {
          changed_by?: string | null
          changed_by_role?: string
          created_at?: string
          id?: string
          new_status: string
          notes?: string | null
          plan_id: string
          previous_status?: string | null
          visit_id?: string | null
        }
        Update: {
          changed_by?: string | null
          changed_by_role?: string
          created_at?: string
          id?: string
          new_status?: string
          notes?: string | null
          plan_id?: string
          previous_status?: string | null
          visit_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "maintenance_status_history_plan_id_fkey"
            columns: ["plan_id"]
            isOneToOne: false
            referencedRelation: "maintenance_plans"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "maintenance_status_history_visit_id_fkey"
            columns: ["visit_id"]
            isOneToOne: false
            referencedRelation: "maintenance_visits"
            referencedColumns: ["id"]
          },
        ]
      }
      maintenance_visits: {
        Row: {
          assigned_team_id: string | null
          assigned_team_name: string | null
          assigned_team_phone: string | null
          completed_at: string | null
          completion_notes: string | null
          created_at: string
          diagnostic_findings: string | null
          earthing_water_filled: boolean | null
          id: string
          mc4_tightening_completed: boolean | null
          nut_bolts_tightened: boolean | null
          panel_cleaning_completed: boolean | null
          plan_id: string
          production_observations: string | null
          report_url: string | null
          scheduled_date: string | null
          scheduled_time_slot: string | null
          status: string
          target_date: string
          updated_at: string
          visit_number: number
          window_end: string
          window_start: string
          work_performed: string | null
        }
        Insert: {
          assigned_team_id?: string | null
          assigned_team_name?: string | null
          assigned_team_phone?: string | null
          completed_at?: string | null
          completion_notes?: string | null
          created_at?: string
          diagnostic_findings?: string | null
          earthing_water_filled?: boolean | null
          id?: string
          mc4_tightening_completed?: boolean | null
          nut_bolts_tightened?: boolean | null
          panel_cleaning_completed?: boolean | null
          plan_id: string
          production_observations?: string | null
          report_url?: string | null
          scheduled_date?: string | null
          scheduled_time_slot?: string | null
          status?: string
          target_date: string
          updated_at?: string
          visit_number: number
          window_end: string
          window_start: string
          work_performed?: string | null
        }
        Update: {
          assigned_team_id?: string | null
          assigned_team_name?: string | null
          assigned_team_phone?: string | null
          completed_at?: string | null
          completion_notes?: string | null
          created_at?: string
          diagnostic_findings?: string | null
          earthing_water_filled?: boolean | null
          id?: string
          mc4_tightening_completed?: boolean | null
          nut_bolts_tightened?: boolean | null
          panel_cleaning_completed?: boolean | null
          plan_id?: string
          production_observations?: string | null
          report_url?: string | null
          scheduled_date?: string | null
          scheduled_time_slot?: string | null
          status?: string
          target_date?: string
          updated_at?: string
          visit_number?: number
          window_end?: string
          window_start?: string
          work_performed?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "maintenance_visits_plan_id_fkey"
            columns: ["plan_id"]
            isOneToOne: false
            referencedRelation: "maintenance_plans"
            referencedColumns: ["id"]
          },
        ]
      }
      notifications: {
        Row: {
          action_type: string | null
          action_value: string | null
          created_at: string
          id: string
          is_read: boolean
          message: string
          notification_key: string
          survey_booking_id: string | null
          title: string
          type: string
          user_id: string
        }
        Insert: {
          action_type?: string | null
          action_value?: string | null
          created_at?: string
          id?: string
          is_read?: boolean
          message: string
          notification_key: string
          survey_booking_id?: string | null
          title: string
          type: string
          user_id: string
        }
        Update: {
          action_type?: string | null
          action_value?: string | null
          created_at?: string
          id?: string
          is_read?: boolean
          message?: string
          notification_key?: string
          survey_booking_id?: string | null
          title?: string
          type?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "notifications_survey_booking_id_fkey"
            columns: ["survey_booking_id"]
            isOneToOne: false
            referencedRelation: "survey_bookings"
            referencedColumns: ["id"]
          },
        ]
      }
      package_templates: {
        Row: {
          allow_parallel_inverters: boolean
          allowed_battery_family_ids: string[]
          battery_selection_mode: string
          brand_id: string | null
          created_at: string
          customer_title: string | null
          description: string | null
          enable_basic: boolean
          enable_better: boolean
          enable_recommended: boolean
          id: string
          is_active: boolean
          maximum_oversizing_percentage: number | null
          minimum_basic_sizing_percentage: number
          name: string
          package_image_url: string | null
          panel_selection_mode: string
          preferred_battery_family_id: string | null
          preferred_panel_product_id: string | null
          primary_inverter_family_id: string
          priority: number
          selected_panel_brand_ids: string[]
          selected_panel_product_ids: string[]
          slug: string
          status: string
          updated_at: string
        }
        Insert: {
          allow_parallel_inverters?: boolean
          allowed_battery_family_ids?: string[]
          battery_selection_mode?: string
          brand_id?: string | null
          created_at?: string
          customer_title?: string | null
          description?: string | null
          enable_basic?: boolean
          enable_better?: boolean
          enable_recommended?: boolean
          id?: string
          is_active?: boolean
          maximum_oversizing_percentage?: number | null
          minimum_basic_sizing_percentage?: number
          name: string
          package_image_url?: string | null
          panel_selection_mode?: string
          preferred_battery_family_id?: string | null
          preferred_panel_product_id?: string | null
          primary_inverter_family_id: string
          priority?: number
          selected_panel_brand_ids?: string[]
          selected_panel_product_ids?: string[]
          slug: string
          status?: string
          updated_at?: string
        }
        Update: {
          allow_parallel_inverters?: boolean
          allowed_battery_family_ids?: string[]
          battery_selection_mode?: string
          brand_id?: string | null
          created_at?: string
          customer_title?: string | null
          description?: string | null
          enable_basic?: boolean
          enable_better?: boolean
          enable_recommended?: boolean
          id?: string
          is_active?: boolean
          maximum_oversizing_percentage?: number | null
          minimum_basic_sizing_percentage?: number
          name?: string
          package_image_url?: string | null
          panel_selection_mode?: string
          preferred_battery_family_id?: string | null
          preferred_panel_product_id?: string | null
          primary_inverter_family_id?: string
          priority?: number
          selected_panel_brand_ids?: string[]
          selected_panel_product_ids?: string[]
          slug?: string
          status?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "package_templates_brand_id_fkey"
            columns: ["brand_id"]
            isOneToOne: false
            referencedRelation: "brands"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "package_templates_preferred_battery_family_id_fkey"
            columns: ["preferred_battery_family_id"]
            isOneToOne: false
            referencedRelation: "product_families"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "package_templates_preferred_panel_product_id_fkey"
            columns: ["preferred_panel_product_id"]
            isOneToOne: false
            referencedRelation: "commercial_product_spec_diagnostics"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "package_templates_preferred_panel_product_id_fkey"
            columns: ["preferred_panel_product_id"]
            isOneToOne: false
            referencedRelation: "products"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "package_templates_primary_inverter_family_id_fkey"
            columns: ["primary_inverter_family_id"]
            isOneToOne: false
            referencedRelation: "product_families"
            referencedColumns: ["id"]
          },
        ]
      }
      product_compatibility: {
        Row: {
          compatible_battery_brand_id: string
          created_at: string
          id: string
          inverter_brand_id: string
          is_active: boolean
          notes: string | null
          updated_at: string
        }
        Insert: {
          compatible_battery_brand_id: string
          created_at?: string
          id?: string
          inverter_brand_id: string
          is_active?: boolean
          notes?: string | null
          updated_at?: string
        }
        Update: {
          compatible_battery_brand_id?: string
          created_at?: string
          id?: string
          inverter_brand_id?: string
          is_active?: boolean
          notes?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "product_compatibility_compatible_battery_brand_id_fkey"
            columns: ["compatible_battery_brand_id"]
            isOneToOne: false
            referencedRelation: "brands"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "product_compatibility_inverter_brand_id_fkey"
            columns: ["inverter_brand_id"]
            isOneToOne: false
            referencedRelation: "brands"
            referencedColumns: ["id"]
          },
        ]
      }
      product_compatibility_exceptions: {
        Row: {
          created_at: string
          id: string
          is_active: boolean
          notes: string | null
          source_product_id: string
          status: string
          target_product_id: string
          updated_at: string
        }
        Insert: {
          created_at?: string
          id?: string
          is_active?: boolean
          notes?: string | null
          source_product_id: string
          status: string
          target_product_id: string
          updated_at?: string
        }
        Update: {
          created_at?: string
          id?: string
          is_active?: boolean
          notes?: string | null
          source_product_id?: string
          status?: string
          target_product_id?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "product_compatibility_exceptions_source_product_id_fkey"
            columns: ["source_product_id"]
            isOneToOne: false
            referencedRelation: "commercial_product_spec_diagnostics"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "product_compatibility_exceptions_source_product_id_fkey"
            columns: ["source_product_id"]
            isOneToOne: false
            referencedRelation: "products"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "product_compatibility_exceptions_target_product_id_fkey"
            columns: ["target_product_id"]
            isOneToOne: false
            referencedRelation: "commercial_product_spec_diagnostics"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "product_compatibility_exceptions_target_product_id_fkey"
            columns: ["target_product_id"]
            isOneToOne: false
            referencedRelation: "products"
            referencedColumns: ["id"]
          },
        ]
      }
      product_families: {
        Row: {
          battery_required: boolean
          brand_id: string
          category: string
          created_at: string
          id: string
          is_active: boolean
          name: string
          notes: string | null
          phase: string | null
          priority: number
          slug: string
          status: string
          updated_at: string
          voltage_type: string
        }
        Insert: {
          battery_required?: boolean
          brand_id: string
          category: string
          created_at?: string
          id?: string
          is_active?: boolean
          name: string
          notes?: string | null
          phase?: string | null
          priority?: number
          slug: string
          status?: string
          updated_at?: string
          voltage_type?: string
        }
        Update: {
          battery_required?: boolean
          brand_id?: string
          category?: string
          created_at?: string
          id?: string
          is_active?: boolean
          name?: string
          notes?: string | null
          phase?: string | null
          priority?: number
          slug?: string
          status?: string
          updated_at?: string
          voltage_type?: string
        }
        Relationships: [
          {
            foreignKeyName: "product_families_brand_id_fkey"
            columns: ["brand_id"]
            isOneToOne: false
            referencedRelation: "brands"
            referencedColumns: ["id"]
          },
        ]
      }
      products: {
        Row: {
          battery_capacity_kwh: number | null
          brand_id: string
          capacity_kw: number | null
          capacity_kwh: number | null
          capacity_watt: number | null
          category: Database["public"]["Enums"]["product_category"]
          commercial_max_parallel_modules: number | null
          commercial_spec_status: string
          compatibility_groups: string[]
          compatible_battery_brand_ids: string[]
          compatible_inverter_brand_ids: string[]
          created_at: string
          currency_code: string
          description: string | null
          id: string
          image_url: string | null
          is_active: boolean
          is_featured: boolean
          max_parallel_modules: number | null
          max_parallel_units: number
          maximum_recommended_pv_kwp: number | null
          model: string | null
          name: string
          package_eligible: boolean
          panel_height_mm: number | null
          panel_wattage: number | null
          panel_width_mm: number | null
          parallel_supported: boolean
          phase: string | null
          price: number | null
          priority: number
          product_family_id: string | null
          same_brand_compatibility_enabled: boolean
          same_model_parallel_only: boolean
          sku: string | null
          slug: string
          specifications: Json
          stock_status: Database["public"]["Enums"]["product_stock_status"]
          updated_at: string
          usable_capacity_kwh: number | null
          usable_factor_override: number | null
          voltage_class: string | null
          warranty_years: number | null
        }
        Insert: {
          battery_capacity_kwh?: number | null
          brand_id: string
          capacity_kw?: number | null
          capacity_kwh?: number | null
          capacity_watt?: number | null
          category: Database["public"]["Enums"]["product_category"]
          commercial_max_parallel_modules?: number | null
          commercial_spec_status?: string
          compatibility_groups?: string[]
          compatible_battery_brand_ids?: string[]
          compatible_inverter_brand_ids?: string[]
          created_at?: string
          currency_code?: string
          description?: string | null
          id?: string
          image_url?: string | null
          is_active?: boolean
          is_featured?: boolean
          max_parallel_modules?: number | null
          max_parallel_units?: number
          maximum_recommended_pv_kwp?: number | null
          model?: string | null
          name: string
          package_eligible?: boolean
          panel_height_mm?: number | null
          panel_wattage?: number | null
          panel_width_mm?: number | null
          parallel_supported?: boolean
          phase?: string | null
          price?: number | null
          priority?: number
          product_family_id?: string | null
          same_brand_compatibility_enabled?: boolean
          same_model_parallel_only?: boolean
          sku?: string | null
          slug: string
          specifications?: Json
          stock_status?: Database["public"]["Enums"]["product_stock_status"]
          updated_at?: string
          usable_capacity_kwh?: number | null
          usable_factor_override?: number | null
          voltage_class?: string | null
          warranty_years?: number | null
        }
        Update: {
          battery_capacity_kwh?: number | null
          brand_id?: string
          capacity_kw?: number | null
          capacity_kwh?: number | null
          capacity_watt?: number | null
          category?: Database["public"]["Enums"]["product_category"]
          commercial_max_parallel_modules?: number | null
          commercial_spec_status?: string
          compatibility_groups?: string[]
          compatible_battery_brand_ids?: string[]
          compatible_inverter_brand_ids?: string[]
          created_at?: string
          currency_code?: string
          description?: string | null
          id?: string
          image_url?: string | null
          is_active?: boolean
          is_featured?: boolean
          max_parallel_modules?: number | null
          max_parallel_units?: number
          maximum_recommended_pv_kwp?: number | null
          model?: string | null
          name?: string
          package_eligible?: boolean
          panel_height_mm?: number | null
          panel_wattage?: number | null
          panel_width_mm?: number | null
          parallel_supported?: boolean
          phase?: string | null
          price?: number | null
          priority?: number
          product_family_id?: string | null
          same_brand_compatibility_enabled?: boolean
          same_model_parallel_only?: boolean
          sku?: string | null
          slug?: string
          specifications?: Json
          stock_status?: Database["public"]["Enums"]["product_stock_status"]
          updated_at?: string
          usable_capacity_kwh?: number | null
          usable_factor_override?: number | null
          voltage_class?: string | null
          warranty_years?: number | null
        }
        Relationships: [
          {
            foreignKeyName: "products_brand_id_fkey"
            columns: ["brand_id"]
            isOneToOne: false
            referencedRelation: "brands"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "products_product_family_id_fkey"
            columns: ["product_family_id"]
            isOneToOne: false
            referencedRelation: "product_families"
            referencedColumns: ["id"]
          },
        ]
      }
      profiles: {
        Row: {
          city: string | null
          created_at: string
          full_name: string | null
          id: string
          phone: string | null
          role: Database["public"]["Enums"]["user_role"]
          updated_at: string
        }
        Insert: {
          city?: string | null
          created_at?: string
          full_name?: string | null
          id: string
          phone?: string | null
          role?: Database["public"]["Enums"]["user_role"]
          updated_at?: string
        }
        Update: {
          city?: string | null
          created_at?: string
          full_name?: string | null
          id?: string
          phone?: string | null
          role?: Database["public"]["Enums"]["user_role"]
          updated_at?: string
        }
        Relationships: []
      }
      recommendation_settings: {
        Row: {
          acceptable_battery_shortfall_percent: number
          battery_safety_margin_percent: number
          battery_usable_factor: number
          configured_accessories_cost: number
          configured_installation_cost: number
          configured_structure_cost: number
          created_at: string
          expert_review_battery_threshold_kwh: number
          extended_backup_step_percent: number
          id: string
          is_active: boolean
          minimum_budget_coverage_percent: number
          preliminary_recommendation_disclaimer: string
          updated_at: string
        }
        Insert: {
          acceptable_battery_shortfall_percent?: number
          battery_safety_margin_percent?: number
          battery_usable_factor?: number
          configured_accessories_cost?: number
          configured_installation_cost?: number
          configured_structure_cost?: number
          created_at?: string
          expert_review_battery_threshold_kwh?: number
          extended_backup_step_percent?: number
          id?: string
          is_active?: boolean
          minimum_budget_coverage_percent?: number
          preliminary_recommendation_disclaimer?: string
          updated_at?: string
        }
        Update: {
          acceptable_battery_shortfall_percent?: number
          battery_safety_margin_percent?: number
          battery_usable_factor?: number
          configured_accessories_cost?: number
          configured_installation_cost?: number
          configured_structure_cost?: number
          created_at?: string
          expert_review_battery_threshold_kwh?: number
          extended_backup_step_percent?: number
          id?: string
          is_active?: boolean
          minimum_budget_coverage_percent?: number
          preliminary_recommendation_disclaimer?: string
          updated_at?: string
        }
        Relationships: []
      }
      smart_tool_results: {
        Row: {
          created_at: string
          id: string
          input_data: Json
          result_data: Json
          tool_type: Database["public"]["Enums"]["smart_tool_type"]
          user_id: string
        }
        Insert: {
          created_at?: string
          id?: string
          input_data?: Json
          result_data?: Json
          tool_type: Database["public"]["Enums"]["smart_tool_type"]
          user_id: string
        }
        Update: {
          created_at?: string
          id?: string
          input_data?: Json
          result_data?: Json
          tool_type?: Database["public"]["Enums"]["smart_tool_type"]
          user_id?: string
        }
        Relationships: []
      }
      survey_bookings: {
        Row: {
          address: string
          booking_type: Database["public"]["Enums"]["booking_type"]
          cancellation_note: string | null
          cancellation_reason: string | null
          cancelled_at: string | null
          cancelled_by: string | null
          city: string
          created_at: string
          full_name: string
          id: string
          notes: string | null
          phone: string
          preferred_date: string | null
          preferred_time_slot: string | null
          status: Database["public"]["Enums"]["booking_status"]
          system_design_id: string | null
          updated_at: string
          user_id: string
        }
        Insert: {
          address: string
          booking_type: Database["public"]["Enums"]["booking_type"]
          cancellation_note?: string | null
          cancellation_reason?: string | null
          cancelled_at?: string | null
          cancelled_by?: string | null
          city: string
          created_at?: string
          full_name: string
          id?: string
          notes?: string | null
          phone: string
          preferred_date?: string | null
          preferred_time_slot?: string | null
          status?: Database["public"]["Enums"]["booking_status"]
          system_design_id?: string | null
          updated_at?: string
          user_id: string
        }
        Update: {
          address?: string
          booking_type?: Database["public"]["Enums"]["booking_type"]
          cancellation_note?: string | null
          cancellation_reason?: string | null
          cancelled_at?: string | null
          cancelled_by?: string | null
          city?: string
          created_at?: string
          full_name?: string
          id?: string
          notes?: string | null
          phone?: string
          preferred_date?: string | null
          preferred_time_slot?: string | null
          status?: Database["public"]["Enums"]["booking_status"]
          system_design_id?: string | null
          updated_at?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "survey_bookings_system_design_id_fkey"
            columns: ["system_design_id"]
            isOneToOne: false
            referencedRelation: "system_designs"
            referencedColumns: ["id"]
          },
        ]
      }
      system_designs: {
        Row: {
          backup_hours: number | null
          created_at: string
          design_data: Json
          estimated_price: number | null
          id: string
          recommended_solar_kw: number | null
          selected_battery_id: string | null
          selected_inverter_id: string | null
          selected_panel_id: string | null
          status: Database["public"]["Enums"]["system_design_status"]
          total_load_watts: number
          updated_at: string
          user_id: string
        }
        Insert: {
          backup_hours?: number | null
          created_at?: string
          design_data?: Json
          estimated_price?: number | null
          id?: string
          recommended_solar_kw?: number | null
          selected_battery_id?: string | null
          selected_inverter_id?: string | null
          selected_panel_id?: string | null
          status?: Database["public"]["Enums"]["system_design_status"]
          total_load_watts?: number
          updated_at?: string
          user_id: string
        }
        Update: {
          backup_hours?: number | null
          created_at?: string
          design_data?: Json
          estimated_price?: number | null
          id?: string
          recommended_solar_kw?: number | null
          selected_battery_id?: string | null
          selected_inverter_id?: string | null
          selected_panel_id?: string | null
          status?: Database["public"]["Enums"]["system_design_status"]
          total_load_watts?: number
          updated_at?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "system_designs_selected_battery_id_fkey"
            columns: ["selected_battery_id"]
            isOneToOne: false
            referencedRelation: "commercial_product_spec_diagnostics"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "system_designs_selected_battery_id_fkey"
            columns: ["selected_battery_id"]
            isOneToOne: false
            referencedRelation: "products"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "system_designs_selected_inverter_id_fkey"
            columns: ["selected_inverter_id"]
            isOneToOne: false
            referencedRelation: "commercial_product_spec_diagnostics"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "system_designs_selected_inverter_id_fkey"
            columns: ["selected_inverter_id"]
            isOneToOne: false
            referencedRelation: "products"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "system_designs_selected_panel_id_fkey"
            columns: ["selected_panel_id"]
            isOneToOne: false
            referencedRelation: "commercial_product_spec_diagnostics"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "system_designs_selected_panel_id_fkey"
            columns: ["selected_panel_id"]
            isOneToOne: false
            referencedRelation: "products"
            referencedColumns: ["id"]
          },
        ]
      }
    }
    Views: {
      commercial_product_spec_diagnostics: {
        Row: {
          category: Database["public"]["Enums"]["product_category"] | null
          commercial_spec_status: string | null
          id: string | null
          missing_fields: string[] | null
          model: string | null
          name: string | null
        }
        Insert: {
          category?: Database["public"]["Enums"]["product_category"] | null
          commercial_spec_status?: string | null
          id?: string | null
          missing_fields?: never
          model?: string | null
          name?: string | null
        }
        Update: {
          category?: Database["public"]["Enums"]["product_category"] | null
          commercial_spec_status?: string | null
          id?: string | null
          missing_fields?: never
          model?: string | null
          name?: string | null
        }
        Relationships: []
      }
    }
    Functions: {
      admin_transition_maintenance_visit: {
        Args: {
          p_new_status: string
          p_notes?: string
          p_payload?: Json
          p_plan_id: string
          p_visit_id: string
        }
        Returns: Json
      }
      cancel_maintenance_request: {
        Args: {
          p_cancellation_note?: string
          p_cancellation_reason?: string
          p_request_id: string
        }
        Returns: {
          address: string
          cancellation_note: string | null
          cancellation_reason: string | null
          cancelled_at: string | null
          cancelled_by: string | null
          city: string
          created_at: string
          customer_name: string
          frequency: string
          id: string
          idempotency_key: string | null
          maintenance_plan_id: string | null
          notes: string | null
          phone: string
          plan_id: string
          plan_price: number
          plan_title: string
          preferred_date: string
          preferred_time_slot: string
          reference_number: string
          service_type: string
          status: string
          updated_at: string
          user_id: string
        }
        SetofOptions: {
          from: "*"
          to: "maintenance_requests"
          isOneToOne: true
          isSetofReturn: false
        }
      }
      create_premium_care_plan: {
        Args: {
          p_address: string
          p_city: string
          p_customer_name: string
          p_frequency: string
          p_idempotency_key: string
          p_notes?: string
          p_phone: string
          p_plan_price: number
          p_plan_title: string
          p_preferred_date: string
          p_preferred_time_slot: string
          p_service_type: string
        }
        Returns: Json
      }
      enqueue_premium_care_visit_reminders: {
        Args: { p_as_of_date?: string }
        Returns: number
      }
      safe_maintenance_date: { Args: { value: string }; Returns: string }
      show_limit: { Args: never; Returns: number }
      show_trgm: { Args: { "": string }; Returns: string[] }
      submit_maintenance_feedback: {
        Args: {
          p_comments?: string
          p_needs_follow_up?: boolean
          p_overall_rating: number
          p_professionalism_rating?: number
          p_punctuality_rating?: number
          p_service_quality_rating?: number
          p_visit_id: string
        }
        Returns: Json
      }
    }
    Enums: {
      booking_status: "pending" | "confirmed" | "completed" | "cancelled"
      booking_type:
        | "solar_survey"
        | "preventive_maintenance"
        | "installation"
        | "net_metering"
      product_category:
        | "solar_panel"
        | "inverter"
        | "battery"
        | "mounting_structure"
        | "accessory"
      product_stock_status:
        | "in_stock"
        | "out_of_stock"
        | "preorder"
        | "on_request"
      smart_tool_type:
        | "load_calculator"
        | "roof_space"
        | "roi_calculator"
        | "battery_backup"
        | "solar_size"
      system_design_status: "draft" | "completed" | "archived"
      user_role: "customer" | "admin" | "installer"
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
      booking_status: ["pending", "confirmed", "completed", "cancelled"],
      booking_type: [
        "solar_survey",
        "preventive_maintenance",
        "installation",
        "net_metering",
      ],
      product_category: [
        "solar_panel",
        "inverter",
        "battery",
        "mounting_structure",
        "accessory",
      ],
      product_stock_status: [
        "in_stock",
        "out_of_stock",
        "preorder",
        "on_request",
      ],
      smart_tool_type: [
        "load_calculator",
        "roof_space",
        "roi_calculator",
        "battery_backup",
        "solar_size",
      ],
      system_design_status: ["draft", "completed", "archived"],
      user_role: ["customer", "admin", "installer"],
    },
  },
} as const
