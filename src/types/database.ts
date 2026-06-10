export type UserRole = "customer" | "admin" | "installer";
export type ProductCategory = "solar_panel" | "inverter" | "battery" | "mounting_structure" | "accessory";
export type ProductSubCategory = "hybrid_inverter" | "on_grid_inverter" | "lithium_battery" | "combo_deal" | "ess" | "mounting_structure" | "accessory" | null;
export type PriceUnit = "per_watt" | "total_price";
export type StockStatus = "ready_stock" | "eta" | "in_transit" | "booking_open" | "out_of_stock" | "on_request" | "in_stock" | "preorder";
export type BookingStatus =
  | "pending"
  | "confirmed"
  | "survey_scheduled"
  | "survey_completed"
  | "proposal_preparation"
  | "quotation_shared"
  | "installation_planning"
  | "installation_completed"
  | "cancelled"
  | "completed";
export type BookingType = "solar_survey" | "preventive_maintenance" | "installation" | "net_metering";
export type SmartToolType = "load_calculator" | "roof_space" | "roi_calculator" | "battery_backup" | "solar_size";

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
  category: ProductCategory;
  logo_url: string | null;
  is_active: boolean;
  created_at: string;
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
  brands?: Pick<Brand, "id" | "name"> | null;
}

export interface SurveyBooking {
  id: string;
  full_name: string;
  phone: string;
  city: string;
  address: string;
  booking_type: BookingType;
  preferred_date: string | null;
  preferred_time_slot: string | null;
  status: BookingStatus;
  notes: string | null;
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
