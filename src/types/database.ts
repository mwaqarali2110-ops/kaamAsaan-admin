export type UserRole = "customer" | "admin" | "installer";
export type ProductCategory = "solar_panel" | "inverter" | "battery";
export type BrandCategory = ProductCategory | "mounting_structure" | "accessory" | "ev_charger";
export type ProductSubCategory = "hybrid_inverter" | "on_grid_inverter" | "lithium_battery" | "combo_deal" | "ess" | "mounting_structure" | "accessory" | null;
export type PriceUnit = "per_watt" | "total_price";
export type StockStatus = "ready_stock" | "eta" | "in_transit" | "booking_open" | "out_of_stock" | "on_request" | "in_stock" | "preorder";
export type BookingStatus =
  | "pending"
  | "confirmed"
  | "assigned"
  | "scheduled"
  | "survey_in_progress"
  | "survey_scheduled"
  | "survey_completed"
  | "proposal_preparation"
  | "quotation_shared"
  | "installation_planning"
  | "installation_started"
  | "installation_completed"
  | "cancelled"
  | "completed";
export type BookingType = "solar_survey" | "preventive_maintenance" | "installation" | "net_metering";
export type SmartToolType = "load_calculator" | "roof_space" | "roi_calculator" | "battery_backup" | "solar_size";
export type PackagePhase = "single" | "three";
export type VoltageClass = "LV" | "HV" | "NONE";
export type ProductFamilyCategory = "inverter" | "battery" | "panel";
export type ProductFamilyStatus = "draft" | "ready" | "inactive" | "admin_review";
export type PackageTemplateStatus = "draft" | "live" | "inactive";

export interface Profile {
  id: string;
  full_name: string | null;
  phone: string | null;
  city: string | null;
  role: UserRole;
  created_at: string;
}

export interface Brand {
  id: string;
  name: string;
  slug: string;
  canonical_slug?: string | null;
  category: BrandCategory | null;
  logo_url: string | null;
  aliases?: string[] | null;
  package_generation_enabled?: boolean | null;
  default_compatibility_group?: string | null;
  package_image_url?: string | null;
  priority?: number | null;
  is_active: boolean;
  created_at: string;
  updated_at?: string | null;
}

export interface Product {
  id: string;
  brand_id: string;
  category: ProductCategory;
  sub_category: ProductSubCategory;
  name: string;
  slug: string;
  sku: string | null;
  model: string | null;
  capacity_value: number | null;
  capacity_unit: string | null;
  capacity_watt: number | null;
  capacity_kw: number | null;
  battery_capacity_kwh: number | null;
  capacity_kwh?: number | null;
  usable_capacity_kwh?: number | null;
  usable_factor_override?: number | null;
  panel_wattage?: number | null;
  phase?: PackagePhase | null;
  voltage_class?: VoltageClass | null;
  compatibility_groups?: string[] | null;
  parallel_supported?: boolean | null;
  max_parallel_units?: number | null;
  same_model_parallel_only?: boolean | null;
  max_parallel_modules?: number | null;
  commercial_max_parallel_modules?: number | null;
  maximum_recommended_pv_kwp?: number | null;
  compatible_inverter_brand_ids?: string[] | null;
  compatible_battery_brand_ids?: string[] | null;
  panel_width_mm?: number | null;
  panel_height_mm?: number | null;
  commercial_spec_status?: "ready" | "needs_review" | "invalid" | null;
  same_brand_compatibility_enabled?: boolean | null;
  package_eligible?: boolean | null;
  product_family_id?: string | null;
  priority?: number | null;
  price: number | null;
  price_unit: PriceUnit | null;
  rate_per_watt: number | null;
  eta_note: string | null;
  currency_code: string;
  warranty_years: number | null;
  warranty: string | null;
  description: string | null;
  image_url: string | null;
  specifications: Record<string, unknown>;
  stock_status: StockStatus;
  is_featured: boolean;
  is_active: boolean;
  is_visible: boolean | null;
  created_at: string;
  updated_at: string;
  accessory_subcategory?: string | null;
  short_spec?: string | null;
  secondary_spec?: string | null;
  compare_at_price?: number | null;
  stock_quantity?: number | null;
  gallery_images?: string[] | null;
  usage_instructions?: string | null;
  package_contents?: string | null;
  badge?: "best_seller" | "best_value" | "new" | null;
  brands?: Pick<Brand, "id" | "name" | "slug" | "aliases" | "priority" | "logo_url" | "package_generation_enabled" | "package_image_url" | "default_compatibility_group"> | null;
}

export interface ProductFamily {
  id: string;
  brand_id: string;
  name: string;
  slug: string;
  category: ProductFamilyCategory;
  voltage_type: VoltageClass;
  phase: PackagePhase | "both" | null;
  battery_required: boolean;
  status: ProductFamilyStatus;
  notes: string | null;
  is_active: boolean;
  priority: number;
  created_at: string;
  updated_at: string;
  brands?: Pick<Brand, "id" | "name" | "slug" | "aliases" | "priority" | "logo_url" | "package_generation_enabled" | "package_image_url" | "is_active"> | null;
}

export interface FamilyCompatibility {
  id: string;
  inverter_family_id: string;
  battery_family_id: string;
  status: "preferred" | "compatible" | "incompatible";
  priority: number;
  notes: string | null;
  is_active: boolean;
  created_at: string;
  updated_at: string;
}

export interface PackageTemplate {
  id: string;
  name: string;
  slug: string;
  customer_title: string | null;
  primary_inverter_family_id: string;
  battery_selection_mode: "all_compatible" | "selected_families" | "none";
  allowed_battery_family_ids: string[];
  preferred_battery_family_id: string | null;
  panel_selection_mode: "all_active" | "selected_brands" | "selected_products";
  selected_panel_brand_ids: string[];
  selected_panel_product_ids: string[];
  preferred_panel_product_id: string | null;
  package_image_url: string | null;
  description: string | null;
  priority: number;
  enable_basic: boolean;
  enable_recommended: boolean;
  enable_better: boolean;
  allow_parallel_inverters: boolean;
  minimum_basic_sizing_percentage: number;
  maximum_oversizing_percentage: number | null;
  status: PackageTemplateStatus;
  is_active: boolean;
  created_at: string;
  updated_at: string;
}

export interface SurveyBooking {
  id: string;
  reference_code?: string | null;
  user_id: string;
  system_design_id?: string | null;
  full_name: string;
  phone: string;
  customer_email?: string | null;
  city: string;
  address: string;
  booking_type: BookingType;
  service_type?: string | null;
  selected_package_snapshot?: SurveyPackageSnapshot | Record<string, unknown> | string | null;
  preferred_date: string | null;
  preferred_time_slot: string | null;
  confirmed_survey_at?: string | null;
  assigned_team_name?: string | null;
  assigned_team_contact?: string | null;
  current_milestone?: SurveyMilestoneState | null;
  journey_status?: SurveyJourneyLifecycle | null;
  milestone_updated_at?: string | null;
  progress_note?: string | null;
  status: BookingStatus;
  notes: string | null;
  cancellation_reason: string | null;
  cancellation_note: string | null;
  cancelled_at: string | null;
  cancelled_by: string | null;
  created_at: string;
  updated_at?: string | null;
  promo_request_key?: string | null;
  promo_redemption?: PromoRedemption | PromoRedemption[] | null;
  status_history?: SurveyBookingStatusHistory[] | null;
}

export type SurveyMilestone = SolarJourneyMilestone;
export type SurveyJourneyLifecycle = SolarJourneyLifecycle;
export type SurveyMilestoneState = SurveyMilestone | Exclude<SurveyJourneyLifecycle, "active">;

export interface SurveyBookingStatusHistory {
  id: string;
  booking_id: string;
  previous_milestone: SurveyMilestoneState | null;
  new_milestone: SurveyMilestoneState;
  note: string | null;
  updated_by: string | null;
  created_at: string;
}

export type ProductOrderServiceOption = "product_only" | "product_installation";
export type ProductOrderStatus =
  | "order_received"
  | "order_confirmed"
  | "payment_received"
  | "in_transit"
  | "product_received"
  | "product_installed"
  | "cancelled"
  | "on_hold";

export interface ProductOrder {
  id: string;
  reference_code: string;
  user_id: string;
  product_id?: string | null;
  product_name: string;
  product_brand?: string | null;
  product_category: string;
  product_image_url?: string | null;
  quantity: number;
  service_option: ProductOrderServiceOption;
  unit_price: number;
  transportation_charge: number;
  installation_charge: number;
  promo_id?: string | null;
  promo_code?: string | null;
  discount_amount: number;
  subtotal: number;
  total: number;
  status: ProductOrderStatus;
  current_milestone?: string | null;
  full_name: string;
  phone: string;
  city: string;
  delivery_address?: string | null;
  notes?: string | null;
  created_at: string;
  updated_at?: string | null;
  status_history?: ProductOrderStatusHistory[] | null;
}

export interface ServicePricingSettings {
  id: boolean;
  transportation_charge: number;
  product_installation_charge: number;
  cleaning_base_visit_charge: number;
  cleaning_standard_rate_per_kw: number;
  cleaning_elevated_rate_per_kw: number;
  cleaning_elevated_height_rate: number;
  cleaning_minimum_charge: number;
  cleaning_tax_rate: number;
  updated_at: string;
}

export interface ProductOrderStatusHistory {
  id: string;
  order_id: string;
  previous_milestone: string | null;
  new_milestone: string;
  note: string | null;
  updated_by: string | null;
  created_at: string;
}

export interface SurveyPackageSnapshot {
  packageId: string | null;
  packageName: string;
  packageBrand: string;
  isCustomized: boolean;
  systemSizeKw: number;
  panel: { productId: string | null; brand: string; model: string; wattage: number; quantity: number; totalCapacityKw: number } | null;
  inverter: { productId: string | null; brand: string; model: string; capacityKw: number; quantity: number } | null;
  battery: { productId: string | null; brand: string; model: string; unitCapacityKwh: number; quantity: number; totalCapacityKwh: number } | null;
  grossTotal: number;
  discountAmount: number;
  finalTotal: number;
  promoCode?: string | null;
}

export type PromoDiscountType = "percentage" | "fixed";
export type PromoTarget = "installation" | "panels" | "inverter" | "battery";

export interface PromoCode {
  id: string;
  code: string;
  description: string | null;
  discount_type: PromoDiscountType;
  discount_value: number;
  max_discount_amount: number | null;
  applies_to: PromoTarget;
  starts_at: string;
  expires_at: string;
  is_active: boolean;
  created_by: string | null;
  admin_notes: string | null;
  created_at: string;
  updated_at: string;
  usage_count?: number;
}

export interface PromoRedemption {
  id: string;
  promo_code_id: string;
  survey_booking_id: string;
  user_id: string;
  normalized_code: string;
  applies_to: PromoTarget;
  discount_type: PromoDiscountType;
  discount_value: number;
  max_discount_amount: number | null;
  eligible_component_amount: number;
  discount_amount: number;
  gross_total: number;
  final_total: number;
  price_breakdown: Record<string, number>;
  created_at: string;
}

export interface SmartToolResult {
  id: string;
  user_id: string;
  tool_type: SmartToolType;
  input_data: Record<string, unknown>;
  result_data: Record<string, unknown>;
  created_at: string;
}

export interface CompatibilityRule {
  id: string;
  notes: string | null;
  is_active: boolean;
  inverter: Pick<Brand, "id" | "name"> | null;
  battery: Pick<Brand, "id" | "name"> | null;
}

export type MaintenancePlanStatus = "request_received" | "active" | "suspended" | "cancelled" | "completed" | "expired" | "closed";
export type MaintenanceVisitStatus = "upcoming" | "confirmation_pending" | "customer_contacted" | "team_assigned" | "scheduled" | "dispatched" | "in_progress" | "completed" | "feedback_pending" | "feedback_received" | "cancelled" | "rescheduled";

export interface MaintenanceRequest {
  id: string; user_id: string; reference_number: string; plan_title: string; plan_price: number;
  customer_name: string; phone: string; address: string; city: string; notes: string | null;
  status: string; created_at: string; updated_at: string;
}

export interface MaintenancePlan {
  id: string; user_id: string; maintenance_request_id: string; reference: string; plan_type: string;
  price: number; start_date: string; end_date: string; total_visits: number; visit_interval_months: number;
  current_visit_number: number; status: MaintenancePlanStatus; assigned_team_name: string | null;
  assigned_team_phone: string | null; created_at: string; updated_at: string; cancelled_at: string | null;
  cancellation_reason: string | null;
}

export interface MaintenanceVisit {
  id: string; plan_id: string; visit_number: number; target_date: string; window_start: string; window_end: string;
  scheduled_date: string | null; scheduled_time_slot: string | null; status: MaintenanceVisitStatus;
  assigned_team_name: string | null; assigned_team_phone: string | null; completed_at: string | null;
  completion_notes: string | null; work_performed: string | null; mc4_tightening_completed: boolean | null;
  earthing_water_filled: boolean | null; nut_bolts_tightened: boolean | null; panel_cleaning_completed: boolean | null;
  diagnostic_findings: string | null; production_observations: string | null; report_url: string | null;
  created_at: string; updated_at: string;
}

export interface MaintenanceFeedback {
  id: string; plan_id: string; visit_id: string; overall_rating: number; service_quality_rating: number | null;
  professionalism_rating: number | null; punctuality_rating: number | null; comments: string | null;
  needs_follow_up: boolean; created_at: string;
}

export interface MaintenanceStatusHistory {
  id: string; plan_id: string; visit_id: string | null; previous_status: string | null; new_status: string;
  changed_by_role: string; notes: string | null; created_at: string;
}
import type { SolarJourneyLifecycle, SolarJourneyMilestone } from "../lib/solarJourneyMilestones";
