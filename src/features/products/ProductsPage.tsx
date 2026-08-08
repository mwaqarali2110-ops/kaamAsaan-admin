import { zodResolver } from "@hookform/resolvers/zod";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useEffect, useMemo, useState } from "react";
import { useForm } from "react-hook-form";
import { FiCopy, FiEdit2, FiImage, FiPlus, FiSearch, FiTrash2 } from "react-icons/fi";
import { z } from "zod";
import { EmptyState, ErrorState, LoadingState } from "../../components/AsyncState";
import { Modal } from "../../components/Modal";
import { PageHeader } from "../../components/PageHeader";
import { StorageImage } from "../../components/StorageImage";
import { StatusBadge } from "../../components/StatusBadge";
import { supabase } from "../../lib/supabase";
import { normalizePublicStorageUrl, uploadPublicFile } from "../../lib/storage";
import { displayBrandName, normalizeBrandName } from "../../lib/brand";
import { errorMessage, formatMoney, slugify } from "../../lib/utils";
import type { Brand, PriceUnit, Product, ProductSubCategory, StockStatus } from "../../types/database";

const categories = ["solar_panel", "inverter", "battery"] as const;
type ManagedProductCategory = typeof categories[number];

const categoryLabels: Record<ManagedProductCategory, string> = {
  solar_panel: "Solar Panels",
  inverter: "Inverters",
  battery: "Batteries",
};
const stockStatuses = ["ready_stock", "eta", "in_transit", "booking_open", "out_of_stock", "on_request", "in_stock", "preorder"] as const;
const priceUnits = ["per_watt", "total_price"] as const;
const MAX_RESIDENTIAL_BATTERY_CAPACITY_KWH = 200;

const subCategoryOptions: Record<ManagedProductCategory, Array<{ value: NonNullable<ProductSubCategory>; label: string }>> = {
  solar_panel: [],
  inverter: [
    { value: "hybrid_inverter", label: "Hybrid inverter" },
    { value: "on_grid_inverter", label: "On-grid inverter" },
  ],
  battery: [
    { value: "lithium_battery", label: "Solar / lithium battery" },
    { value: "ess", label: "ESS" },
  ],
};

const optionalNumber = z.preprocess((value) => value === "" || value == null ? null : Number(value), z.number().nonnegative().nullable());
const optionalPositiveInteger = z.preprocess((value) => value === "" || value == null ? null : Number(value), z.number().int().min(1).nullable());
const nullableText = z.preprocess((value) => {
  if (value === "" || value == null) return null;
  return typeof value === "string" ? value.trim() || null : value;
}, z.string().nullable());

const schema = z.object({
  brand_id: z.string().min(1, "Select a brand."),
  category: z.enum(categories),
  sub_category: nullableText,
  name: z.string().min(2, "Product name is required."),
  slug: z.string().nullable(),
  sku: nullableText,
  model: nullableText,
  capacity_watt: optionalNumber,
  capacity_kw: optionalNumber,
  battery_capacity_kwh: optionalNumber,
  capacity_kwh: optionalNumber,
  usable_capacity_kwh: optionalNumber,
  usable_factor_override: optionalNumber,
  panel_wattage: optionalNumber,
  phase: z.enum(["single", "three"]).nullable(),
  voltage_class: z.enum(["LV", "HV", "NONE"]).nullable(),
  compatibility_groups: z.string(),
  parallel_supported: z.boolean(),
  max_parallel_units: z.coerce.number().int().min(1),
  same_model_parallel_only: z.boolean(),
  max_parallel_modules: optionalNumber,
  commercial_max_parallel_modules: optionalPositiveInteger,
  maximum_recommended_pv_kwp: optionalNumber,
  compatible_inverter_brand_ids: z.string(),
  compatible_battery_brand_ids: z.string(),
  panel_width_mm: optionalNumber,
  panel_height_mm: optionalNumber,
  same_brand_compatibility_enabled: z.boolean(),
  package_eligible: z.boolean(),
  priority: z.coerce.number().int().min(0),
  capacity_value: optionalNumber,
  capacity_unit: nullableText,
  price: optionalNumber,
  price_unit: z.enum(priceUnits),
  rate_per_watt: optionalNumber,
  currency_code: z.string().length(3, "Use a 3-letter currency code."),
  warranty_years: optionalNumber,
  warranty: nullableText,
  eta_note: nullableText,
  description: nullableText,
  image_url: nullableText,
  specifications: z.string().refine((value) => {
    try { JSON.parse(value); return true; } catch { return false; }
  }, "Specifications must be valid JSON."),
  stock_status: z.enum(stockStatuses),
  is_featured: z.boolean(),
  is_active: z.boolean(),
  is_visible: z.boolean(),
}).superRefine((values, context) => {
  if (values.category === "battery") {
    const capacityKwh = values.capacity_kwh ?? values.battery_capacity_kwh;
    if (capacityKwh == null || capacityKwh <= 0) {
      context.addIssue({ code: "custom", path: ["capacity_kwh"], message: "Battery capacity is required and must be greater than 0 kWh." });
    } else if (capacityKwh > MAX_RESIDENTIAL_BATTERY_CAPACITY_KWH) {
      context.addIssue({ code: "custom", path: ["capacity_kwh"], message: `Residential battery capacity cannot exceed ${MAX_RESIDENTIAL_BATTERY_CAPACITY_KWH} kWh per product.` });
    }
    if (capacityKwh != null && values.usable_capacity_kwh != null && values.usable_capacity_kwh > capacityKwh) {
      context.addIssue({ code: "custom", path: ["usable_capacity_kwh"], message: "Usable capacity cannot exceed nominal capacity." });
    }
    if (values.usable_factor_override != null && (values.usable_factor_override <= 0 || values.usable_factor_override > 1)) {
      context.addIssue({ code: "custom", path: ["usable_factor_override"], message: "Usable factor must be greater than 0 and no more than 1." });
    }
    if (values.parallel_supported && (values.max_parallel_modules == null || values.max_parallel_modules < 2)) {
      context.addIssue({ code: "custom", path: ["max_parallel_modules"], message: "Set at least 2 modules when battery parallel support is enabled." });
    }
    if (
      values.commercial_max_parallel_modules != null
      && values.max_parallel_modules != null
      && values.commercial_max_parallel_modules > values.max_parallel_modules
    ) {
      context.addIssue({
        code: "custom",
        path: ["commercial_max_parallel_modules"],
        message: "Commercial maximum cannot exceed the technical maximum.",
      });
    }
    if (values.commercial_max_parallel_modules != null && values.commercial_max_parallel_modules < 1) {
      context.addIssue({
        code: "custom",
        path: ["commercial_max_parallel_modules"],
        message: "Commercial maximum must be at least 1 module.",
      });
    }
    if (values.voltage_class !== "LV" && values.voltage_class !== "HV") {
      context.addIssue({ code: "custom", path: ["voltage_class"], message: "Select LV or HV for a battery." });
    }
  }
  if (values.category === "inverter" && (values.capacity_kw == null || values.capacity_kw <= 0)) {
    context.addIssue({
      code: "custom",
      path: ["capacity_kw"],
      message: "Inverter capacity is required and must be greater than 0 kW.",
    });
  }
  if (values.category === "inverter" && (values.maximum_recommended_pv_kwp == null || values.maximum_recommended_pv_kwp <= 0)) {
    context.addIssue({ code: "custom", path: ["maximum_recommended_pv_kwp"], message: "Maximum recommended PV is required for commercial recommendations." });
  }
  if (values.category === "inverter" && !values.phase) {
    context.addIssue({ code: "custom", path: ["phase"], message: "Select the inverter phase." });
  }
  if (values.category === "solar_panel" && (values.panel_wattage == null || values.panel_wattage <= 0)) {
    context.addIssue({ code: "custom", path: ["panel_wattage"], message: "Panel wattage is required." });
  }
});

type Values = z.infer<typeof schema>;
type InputValues = z.input<typeof schema>;

const emptyValues: InputValues = {
  brand_id: "",
  category: "solar_panel",
  sub_category: null,
  name: "",
  slug: "",
  sku: "",
  model: "",
  capacity_watt: null,
  capacity_kw: null,
  battery_capacity_kwh: null,
  capacity_kwh: null,
  usable_capacity_kwh: null,
  usable_factor_override: null,
  panel_wattage: null,
  phase: null,
  voltage_class: "NONE",
  compatibility_groups: "",
  parallel_supported: false,
  max_parallel_units: 1,
  same_model_parallel_only: true,
  max_parallel_modules: null,
  commercial_max_parallel_modules: null,
  maximum_recommended_pv_kwp: null,
  compatible_inverter_brand_ids: "",
  compatible_battery_brand_ids: "",
  panel_width_mm: null,
  panel_height_mm: null,
  same_brand_compatibility_enabled: true,
  package_eligible: false,
  priority: 0,
  capacity_value: null,
  capacity_unit: "",
  price: null,
  price_unit: "per_watt",
  rate_per_watt: null,
  currency_code: "PKR",
  warranty_years: null,
  warranty: "",
  eta_note: "",
  description: "",
  image_url: "",
  specifications: "{}",
  stock_status: "on_request",
  is_featured: false,
  is_active: true,
  is_visible: true,
};

const categoryLabel = (category: ManagedProductCategory) => categoryLabels[category];
const normalizeCategory = (value?: string | null) => (value ?? "").toLowerCase().replace(/[\s-]+/g, "_");
const slugPattern = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;
const optionalMigratedProductColumns = new Set([
  "sub_category",
  "capacity_value",
  "capacity_unit",
  "price_unit",
  "rate_per_watt",
  "eta_note",
  "warranty",
  "is_visible",
  "capacity_kwh",
  "usable_capacity_kwh",
  "usable_factor_override",
  "panel_wattage",
  "phase",
  "voltage_class",
  "compatibility_groups",
  "parallel_supported",
  "max_parallel_units",
  "same_model_parallel_only",
  "max_parallel_modules",
  "commercial_max_parallel_modules",
  "maximum_recommended_pv_kwp",
  "compatible_inverter_brand_ids",
  "compatible_battery_brand_ids",
  "panel_width_mm",
  "panel_height_mm",
  "commercial_spec_status",
  "same_brand_compatibility_enabled",
  "package_eligible",
  "priority",
]);

const productPresets = {
  lv_hybrid: { label: "LV Hybrid Inverter", category: "inverter", sub_category: "hybrid_inverter", voltage_class: "LV", phase: "single" },
  hv_hybrid: { label: "HV Hybrid Inverter", category: "inverter", sub_category: "hybrid_inverter", voltage_class: "HV", phase: "single" },
  single_phase: { label: "Single-Phase Inverter", category: "inverter", sub_category: "hybrid_inverter", voltage_class: "NONE", phase: "single" },
  three_phase: { label: "Three-Phase Inverter", category: "inverter", sub_category: "hybrid_inverter", voltage_class: "NONE", phase: "three" },
  lv_battery: { label: "LV Battery", category: "battery", sub_category: "lithium_battery", voltage_class: "LV", phase: null },
  hv_battery: { label: "HV Battery", category: "battery", sub_category: "lithium_battery", voltage_class: "HV", phase: null },
  solar_panel: { label: "Solar Panel", category: "solar_panel", sub_category: null, voltage_class: "NONE", phase: null },
} as const;

function cleanText(value?: string | null) {
  const trimmed = value?.trim();
  return trimmed ? trimmed : null;
}

function normalizeSlug(values: Pick<Values, "slug" | "name" | "model">) {
  const submittedSlug = cleanText(values.slug);
  if (submittedSlug && slugPattern.test(submittedSlug)) return submittedSlug;
  const detailSource = cleanText(values.model) ?? submittedSlug;
  const generated = slugify([values.name, detailSource].filter(Boolean).join(" "));
  if (generated && slugPattern.test(generated)) return generated;
  throw new Error("Enter a product name or model that can generate a URL-safe slug.");
}

function warrantyLabel(values: Pick<Values, "warranty" | "warranty_years">) {
  const explicitLabel = cleanText(values.warranty);
  if (explicitLabel) return explicitLabel;
  if (values.warranty_years == null) return null;
  return `${Number(values.warranty_years)} years`;
}

function formatProductSaveError(error: unknown) {
  const message = errorMessage(error);
  const code = error && typeof error === "object" && "code" in error ? String((error as { code?: unknown }).code ?? "") : "";
  const lowerMessage = message.toLowerCase();

  if (lowerMessage.includes("schema cache") && lowerMessage.includes("column")) {
    return "The product table schema is missing a dashboard field. Core fields were not saved; check the console for the exact missing column.";
  }
  if (code === "23505" || lowerMessage.includes("duplicate key")) {
    if (lowerMessage.includes("slug")) return "A product with this slug already exists. Use a unique URL-safe slug.";
    if (lowerMessage.includes("sku")) return "A product with this SKU already exists. Use a unique SKU or leave it blank.";
    return "A product with one of these unique values already exists. Check the slug and SKU.";
  }
  if (code === "23514" || lowerMessage.includes("violates check constraint")) {
    return "One or more numeric fields are outside the allowed range. Use positive capacity values and non-negative prices/warranty values.";
  }
  if (code === "42501" || lowerMessage.includes("row-level security") || lowerMessage.includes("permission denied")) {
    return "Supabase rejected this update because your account does not have admin permission for products.";
  }
  return message;
}

function resolveManagedCategory(product: Pick<Product, "category" | "sub_category" | "name" | "model">): ManagedProductCategory | null {
  const productCategory = normalizeCategory(product.category);
  const productSubCategory = normalizeCategory(product.sub_category);
  const productText = `${product.name} ${product.model ?? ""}`.toLowerCase();

  if (productCategory === "battery" || productCategory === "batteries" || productCategory === "solar_battery" || productSubCategory.includes("battery") || /\b(?:battery|batteries|kwh|lithium|lifepo4|lfp)\b/i.test(productText)) return "battery";
  if (productCategory === "inverter" || productCategory === "inverters" || productCategory === "hybrid_inverter" || productSubCategory.includes("inverter") || /\b(?:inverter|hybrid|on[ -]?grid)\b/i.test(productText)) return "inverter";
  if (productCategory === "solar_panel" || productCategory === "solar_panels" || productCategory === "panel" || /\b(?:solar panel|pv panel|module|\d{3,4}\s*w)\b/i.test(productText)) return "solar_panel";
  return null;
}

function productMatchesCategory(product: Product, selected: "all" | ManagedProductCategory) {
  const resolved = resolveManagedCategory(product);
  return resolved != null && (selected === "all" || resolved === selected);
}

function defaultSubCategory(category: ManagedProductCategory): ProductSubCategory {
  if (category === "inverter") return "hybrid_inverter";
  if (category === "battery") return "lithium_battery";
  return null;
}

function defaultPriceUnit(category: ManagedProductCategory): PriceUnit {
  return category === "solar_panel" ? "per_watt" : "total_price";
}

function stockStatusLabel(status: StockStatus) {
  return status.replace(/_/g, " ").replace(/\b\w/g, (character) => character.toUpperCase());
}

async function fetchProducts() {
  const { data, error } = await supabase
    .from("products")
    .select("*, brands:brands!products_brand_id_fkey(id, name)")
    .order("created_at", { ascending: false });
  if (error) throw error;
  return data as Product[];
}

async function fetchBrands() {
  const { data, error } = await supabase.from("brands").select("*").order("name");
  if (error) throw error;
  return data as Brand[];
}

function missingSchemaColumn(error: unknown) {
  const message = errorMessage(error);
  if (!message.toLowerCase().includes("schema cache")) return null;
  return message.match(/'([^']+)' column of 'products'/)?.[1] ?? null;
}

async function writeProduct(payload: Record<string, unknown>, productId?: string) {
  const cleanPayload = { ...payload };
  const strippedColumns: string[] = [];

  for (let attempt = 0; attempt <= optionalMigratedProductColumns.size; attempt += 1) {
    const request = productId
      ? supabase.from("products").update(cleanPayload).eq("id", productId)
      : supabase.from("products").insert(cleanPayload);
    const { error } = await request;
    if (!error) {
      if (strippedColumns.length > 0) {
        console.warn("Product saved without optional columns missing from Supabase schema cache", {
          productId,
          strippedColumns,
        });
      }
      return;
    }

    const column = missingSchemaColumn(error);
    if (!column || !optionalMigratedProductColumns.has(column) || !(column in cleanPayload)) {
      throw error;
    }

    delete cleanPayload[column];
    strippedColumns.push(column);
    console.warn("Retrying product save without unsupported optional column", {
      productId,
      column,
      error,
    });
  }
}

export function ProductsPage() {
  const queryClient = useQueryClient();
  const products = useQuery({
    queryKey: ["products"],
    queryFn: fetchProducts,
    staleTime: 0,
    refetchOnMount: "always",
    refetchOnWindowFocus: true,
  });
  const brands = useQuery({ queryKey: ["brands"], queryFn: fetchBrands });
  const [search, setSearch] = useState("");
  const [category, setCategory] = useState<"all" | ManagedProductCategory>("all");
  const [brand, setBrand] = useState("all");
  const [editing, setEditing] = useState<Product | null>(null);
  const [copying, setCopying] = useState<Product | null>(null);
  const [modalOpen, setModalOpen] = useState(false);
  const [formError, setFormError] = useState("");
  const [toast, setToast] = useState("");
  const [uploading, setUploading] = useState(false);
  const form = useForm<InputValues, unknown, Values>({ resolver: zodResolver(schema), defaultValues: emptyValues });
  const selectedCategory = form.watch("category") as ManagedProductCategory;
  const selectedBrandId = form.watch("brand_id");
  const publishStatus = form.watch("is_active") ? "published" : "draft";
  const parallelSupported = form.watch("parallel_supported");
  const currentSubCategoryOptions = subCategoryOptions[selectedCategory] ?? [];
  const allProducts = products.data ?? [];

  const brandFilterOptions = useMemo(() => {
    const options = new Map<string, string>();
    allProducts
      .filter((product) => productMatchesCategory(product, category))
      .forEach((product) => {
        const label = displayBrandName(product.brands?.name);
        const value = normalizeBrandName(label);
        if (value) options.set(value, label);
      });
    return [...options.entries()]
      .map(([value, label]) => ({ value, label }))
      .sort((left, right) => left.label.localeCompare(right.label));
  }, [allProducts, category]);

  const formBrandOptions = useMemo(() => {
    const usedBrandIds = new Set(allProducts
      .filter((product) => resolveManagedCategory(product) === selectedCategory)
      .map((product) => product.brand_id));
    const options = new Map<string, Brand>();
    (brands.data ?? [])
      .filter((item) => item.id === selectedBrandId || item.category == null || item.category === selectedCategory || usedBrandIds.has(item.id))
      .forEach((item) => {
        const key = normalizeBrandName(displayBrandName(item.name));
        const current = options.get(key);
        const score = (candidate: Brand) => candidate.id === selectedBrandId ? 3 : usedBrandIds.has(candidate.id) ? 2 : candidate.category === selectedCategory ? 1 : 0;
        if (!current || score(item) > score(current)) options.set(key, item);
      });
    return [...options.values()].sort((left, right) => displayBrandName(left.name).localeCompare(displayBrandName(right.name)));
  }, [allProducts, brands.data, selectedBrandId, selectedCategory]);

  useEffect(() => {
    if (!modalOpen) return;
    const source = editing ?? copying;
    if (!source) form.reset(emptyValues);
    else {
      const sourceCategory = resolveManagedCategory(source) ?? "solar_panel";
      form.reset({
      brand_id: source.brand_id,
      category: sourceCategory,
      sub_category: source.sub_category ?? defaultSubCategory(sourceCategory),
      name: copying ? `${source.name} Copy` : source.name,
      slug: copying ? "" : source.slug,
      sku: copying ? "" : source.sku ?? "",
      model: copying ? "" : source.model ?? "",
      capacity_watt: source.capacity_watt ?? null,
      capacity_kw: source.capacity_kw ?? null,
      battery_capacity_kwh: source.battery_capacity_kwh ?? source.capacity_kwh ?? null,
      capacity_kwh: source.capacity_kwh ?? source.battery_capacity_kwh ?? null,
      usable_capacity_kwh: source.usable_capacity_kwh ?? null,
      usable_factor_override: source.usable_factor_override ?? null,
      panel_wattage: source.panel_wattage ?? source.capacity_watt ?? null,
      phase: source.phase ?? null,
      voltage_class: source.voltage_class ?? "NONE",
      compatibility_groups: (source.compatibility_groups ?? []).join(", "),
      parallel_supported: source.parallel_supported ?? false,
      max_parallel_units: source.max_parallel_units ?? 1,
      same_model_parallel_only: source.same_model_parallel_only ?? true,
      max_parallel_modules: source.max_parallel_modules ?? null,
      commercial_max_parallel_modules: source.commercial_max_parallel_modules ?? null,
      maximum_recommended_pv_kwp: source.maximum_recommended_pv_kwp ?? null,
      compatible_inverter_brand_ids: (source.compatible_inverter_brand_ids ?? []).join(", "),
      compatible_battery_brand_ids: (source.compatible_battery_brand_ids ?? []).join(", "),
      panel_width_mm: source.panel_width_mm ?? null,
      panel_height_mm: source.panel_height_mm ?? null,
      same_brand_compatibility_enabled: source.same_brand_compatibility_enabled ?? true,
      package_eligible: copying ? false : source.package_eligible ?? false,
      priority: source.priority ?? 0,
      capacity_value: source.capacity_value ?? null,
      capacity_unit: source.capacity_unit ?? "",
      price: source.price ?? null,
      price_unit: source.price_unit ?? defaultPriceUnit(sourceCategory),
      rate_per_watt: source.rate_per_watt ?? null,
      currency_code: source.currency_code,
      warranty_years: source.warranty_years ?? null,
      warranty: source.warranty ?? "",
      eta_note: source.eta_note ?? "",
      description: source.description ?? "",
      image_url: source.image_url ?? "",
      specifications: JSON.stringify(source.specifications ?? {}, null, 2),
      stock_status: source.stock_status,
      is_featured: source.is_featured,
      is_active: copying ? false : source.is_active,
      is_visible: copying ? false : source.is_visible ?? source.is_active,
      });
    }
  }, [copying, editing, form, modalOpen]);

  useEffect(() => {
    if (!modalOpen) return;
    const allowed = subCategoryOptions[selectedCategory] ?? [];
    const selectedSubCategory = form.getValues("sub_category");
    if (allowed.length === 0) {
      form.setValue("sub_category", null, { shouldDirty: true });
    } else if (!selectedSubCategory || !allowed.some((option) => option.value === selectedSubCategory)) {
      form.setValue("sub_category", defaultSubCategory(selectedCategory), { shouldDirty: true });
    }
    if (form.getValues("price_unit") !== defaultPriceUnit(selectedCategory) && !editing) {
      form.setValue("price_unit", defaultPriceUnit(selectedCategory), { shouldDirty: true });
    }
  }, [editing, form, modalOpen, selectedCategory]);

  useEffect(() => {
    if (brand !== "all" && !brandFilterOptions.some((option) => option.value === brand)) setBrand("all");
  }, [brand, brandFilterOptions]);

  const save = useMutation({
    mutationFn: async (values: Values) => {
      const panelWattage = values.category === "solar_panel" ? values.panel_wattage ?? values.capacity_watt : null;
      const batteryCapacity = values.category === "battery" ? values.capacity_kwh ?? values.battery_capacity_kwh : null;
      const inverterCapacity = values.category === "inverter" ? values.capacity_kw : null;
      const parsedSpecifications = JSON.parse(values.specifications) as Record<string, unknown>;
      const compatibilityGroups = [...new Set(values.compatibility_groups
        .split(/[,\n]+/)
        .map((group) => group.trim().toUpperCase())
        .filter(Boolean))];
      const parseBrandIds = (value: string) => [...new Set(value
        .split(/[,\n]+/)
        .map((id) => id.trim())
        .filter(Boolean))];
      const payload = {
        brand_id: values.brand_id,
        category: values.category,
        name: values.name.trim(),
        slug: normalizeSlug(values),
        sku: cleanText(values.sku),
        model: cleanText(values.model),
        capacity_watt: panelWattage,
        capacity_kw: inverterCapacity,
        battery_capacity_kwh: batteryCapacity,
        capacity_kwh: batteryCapacity,
        capacity_value: values.category === "battery" ? batteryCapacity : values.capacity_value,
        capacity_unit: values.category === "battery" ? "kWh" : cleanText(values.capacity_unit),
        usable_capacity_kwh: values.category === "battery" ? values.usable_capacity_kwh : null,
        usable_factor_override: values.category === "battery" ? values.usable_factor_override : null,
        panel_wattage: panelWattage,
        phase: values.category === "inverter" ? values.phase : null,
        voltage_class: values.category === "inverter" || values.category === "battery" ? values.voltage_class : "NONE",
        compatibility_groups: values.category === "inverter" || values.category === "battery" ? compatibilityGroups : [],
        parallel_supported: values.category === "inverter" || values.category === "battery" ? values.parallel_supported : false,
        max_parallel_units: values.category === "inverter" && values.parallel_supported ? values.max_parallel_units : 1,
        same_model_parallel_only: values.same_model_parallel_only,
        max_parallel_modules: values.category === "battery" && values.parallel_supported ? values.max_parallel_modules : null,
        commercial_max_parallel_modules: values.category === "battery" && values.parallel_supported ? values.commercial_max_parallel_modules : null,
        maximum_recommended_pv_kwp: values.category === "inverter" ? values.maximum_recommended_pv_kwp : null,
        compatible_inverter_brand_ids: values.category === "battery" ? parseBrandIds(values.compatible_inverter_brand_ids) : [],
        compatible_battery_brand_ids: values.category === "inverter" ? parseBrandIds(values.compatible_battery_brand_ids) : [],
        panel_width_mm: values.category === "solar_panel" ? values.panel_width_mm : null,
        panel_height_mm: values.category === "solar_panel" ? values.panel_height_mm : null,
        commercial_spec_status: values.package_eligible ? "ready" : "needs_review",
        same_brand_compatibility_enabled: values.same_brand_compatibility_enabled,
        package_eligible: values.package_eligible,
        priority: values.priority,
        price: values.price,
        rate_per_watt: values.rate_per_watt,
        currency_code: values.currency_code.trim().toUpperCase(),
        warranty_years: values.warranty_years,
        warranty: warrantyLabel(values),
        eta_note: cleanText(values.eta_note),
        description: cleanText(values.description),
        image_url: normalizePublicStorageUrl("product-images", values.image_url) || null,
        specifications: parsedSpecifications,
        stock_status: values.stock_status,
        is_featured: values.is_featured,
        is_active: values.is_active,
      };
      try {
        await writeProduct(payload, editing?.id);
      } catch (error) {
        console.error("Product save failed", {
          mode: editing ? "edit" : "add",
          productId: editing?.id,
          payload,
          error,
        });
        throw error;
      }
    },
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ["products"] });
      await queryClient.invalidateQueries({ queryKey: ["products", "price-manager"] });
      setModalOpen(false);
      setToast(editing ? "Product updated successfully." : copying ? "Product duplicated as a draft." : "Product added successfully.");
    },
    onError: (reason) => {
      console.error("Product form submit error", reason);
      setFormError(formatProductSaveError(reason));
    },
  });

  const remove = useMutation({
    mutationFn: async (id: string) => { const { error } = await supabase.from("products").delete().eq("id", id); if (error) throw error; },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["products"] }),
  });

  const toggle = useMutation({
    mutationFn: async (product: Product) => {
      const next = !product.is_active;
      await writeProduct({ is_active: next }, product.id);
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["products"] }),
  });

  async function handleUpload(file?: File) {
    if (!file) return;
    setUploading(true);
    setFormError("");
    try {
      form.setValue("image_url", await uploadPublicFile("product-images", file), { shouldDirty: true });
    } catch (reason) {
      setFormError(errorMessage(reason));
    } finally {
      setUploading(false);
    }
  }

  function openForm(product?: Product) {
    setFormError("");
    setToast("");
    setCopying(null);
    setEditing(product ?? null);
    setModalOpen(true);
  }

  function duplicateProduct(product: Product) {
    setFormError("");
    setToast("");
    setEditing(null);
    setCopying(product);
    setModalOpen(true);
  }

  function applyPreset(key: keyof typeof productPresets | "") {
    if (!key) return;
    const preset = productPresets[key];
    form.setValue("category", preset.category, { shouldDirty: true });
    form.setValue("sub_category", preset.sub_category, { shouldDirty: true });
    form.setValue("voltage_class", preset.voltage_class, { shouldDirty: true });
    form.setValue("phase", preset.phase, { shouldDirty: true });
    form.setValue("is_active", true, { shouldDirty: true });
    form.setValue("is_visible", true, { shouldDirty: true });
    form.setValue("package_eligible", true, { shouldDirty: true });
    form.setValue("price_unit", preset.category === "solar_panel" ? "per_watt" : "total_price", { shouldDirty: true });
  }

  const filtered = allProducts.filter((product) => {
    const term = search.toLowerCase();
    const haystack = `${product.name} ${product.model ?? ""} ${product.brands?.name ?? ""} ${product.sub_category ?? ""}`.toLowerCase();
    const productBrand = normalizeBrandName(displayBrandName(product.brands?.name));
    return productMatchesCategory(product, category) && (brand === "all" || productBrand === brand) && haystack.includes(term);
  });

  return (
    <>
      <PageHeader title="Products Management" description="Manage Solar Panels, Inverters, and Batteries by category and brand." action={<button className="btn-primary" onClick={() => openForm()}><FiPlus /> Add product</button>} />
      {toast && <div className="mb-4 rounded-lg border border-emerald-100 bg-emerald-50 px-4 py-3 text-sm font-semibold text-emerald-700">{toast}</div>}
      <div className="panel mb-4 grid gap-3 p-3 sm:grid-cols-[minmax(0,1fr)_13rem_13rem]">
        <label className="relative flex-1"><FiSearch className="absolute left-3 top-3 text-slate-400" /><input className="field pl-9" placeholder="Search products, models, or brands" value={search} onChange={(e) => setSearch(e.target.value)} /></label>
        <select className="field" aria-label="Filter by category" value={category} onChange={(e) => { setCategory(e.target.value as typeof category); setBrand("all"); }}><option value="all">All categories</option>{categories.map((item) => <option value={item} key={item}>{categoryLabel(item)}</option>)}</select>
        <select className="field" aria-label="Filter by brand" value={brand} onChange={(e) => setBrand(e.target.value)}><option value="all">All brands</option>{brandFilterOptions.map((item) => <option value={item.value} key={item.value}>{item.label}</option>)}</select>
      </div>
      <section className="panel overflow-hidden">
        {products.isLoading ? <LoadingState /> : products.error ? <ErrorState message={products.error.message} /> : filtered.length === 0 ? <EmptyState label="No products found." /> : (
          <div className="overflow-x-auto"><table className="min-w-full text-left text-sm">
            <thead className="bg-slate-50 text-xs uppercase text-slate-500"><tr><th className="px-4 py-3">Product</th><th className="px-4 py-3">Category</th><th className="px-4 py-3">Brand</th><th className="px-4 py-3">Price</th><th className="px-4 py-3">Stock</th><th className="px-4 py-3">Status</th><th className="px-4 py-3 text-right">Actions</th></tr></thead>
            <tbody className="divide-y divide-slate-100">{filtered.map((product) => <tr key={product.id} className="hover:bg-slate-50/70">
              <td className="px-4 py-3"><div className="flex items-center gap-3"><StorageImage bucket="product-images" value={product.image_url} className="h-10 w-10 rounded-md border border-slate-100 object-contain" alt={product.name} fallback={<div className="flex h-10 w-10 items-center justify-center rounded-md bg-slate-100 text-slate-400"><FiImage /></div>} /><div><div className="font-bold text-ink">{product.name}</div><div className="text-xs text-slate-500">{product.model || "No model"}</div></div></div></td>
              <td className="px-4 py-3 font-semibold text-slate-700">{categoryLabel(resolveManagedCategory(product) ?? "solar_panel")}</td>
              <td className="px-4 py-3 font-semibold text-slate-700">{displayBrandName(product.brands?.name)}</td>
              <td className="px-4 py-3 font-semibold">{formatMoney(product.price, product.currency_code)}</td>
              <td className="px-4 py-3 text-slate-600">{stockStatusLabel(product.stock_status)}</td>
              <td className="px-4 py-3"><button onClick={() => toggle.mutate(product)} aria-label={`${product.is_active ? "Unpublish" : "Publish"} ${product.name}`}><StatusBadge active={product.is_active} label={product.is_active ? "Published" : "Draft"} /></button></td>
              <td className="px-4 py-3"><div className="flex justify-end gap-2"><button className="btn-secondary px-3" onClick={() => duplicateProduct(product)} aria-label="Duplicate"><FiCopy /></button><button className="btn-secondary px-3" onClick={() => openForm(product)} aria-label="Edit"><FiEdit2 /></button><button className="btn-danger" onClick={() => confirm("Delete this product permanently?") && remove.mutate(product.id)} aria-label="Delete"><FiTrash2 /></button></div></td>
            </tr>)}</tbody>
          </table></div>
        )}
      </section>
      <Modal title={editing ? "Edit product" : copying ? "Duplicate product" : "Add product"} open={modalOpen} onClose={() => setModalOpen(false)} size="lg">
        {formError && <div className="mb-4 rounded-md bg-red-50 p-3 text-sm text-red-700">{formError}</div>}
        <form className="grid gap-4 md:grid-cols-2" onSubmit={form.handleSubmit((values) => save.mutate(values))}>
          <label className="md:col-span-2 text-sm font-bold text-ink">Start from a preset<select className="field mt-2" defaultValue="" onChange={(event) => applyPreset(event.target.value as keyof typeof productPresets | "")}><option value="">Choose a preset (optional)</option>{Object.entries(productPresets).map(([key, preset]) => <option key={key} value={key}>{preset.label}</option>)}</select><span className="mt-1 block text-xs font-normal text-slate-500">Presets fill only the practical package fields; you can change every value.</span></label>
          <SelectField label="Category" {...form.register("category", { onChange: () => form.setValue("brand_id", "", { shouldDirty: true }) })}>{categories.map((item) => <option value={item} key={item}>{categoryLabel(item)}</option>)}</SelectField>
          <SelectField label="Brand" error={form.formState.errors.brand_id?.message} {...form.register("brand_id")}><option value="">Select brand</option>{formBrandOptions.map((brand) => <option value={brand.id} key={brand.id}>{displayBrandName(brand.name)}</option>)}</SelectField>
          <TextField label="Product name" error={form.formState.errors.name?.message} {...form.register("name")} onBlur={(event) => !form.getValues("slug") && form.setValue("slug", slugify(event.target.value))} />
          <TextField label="Model" {...form.register("model")} />

          {selectedCategory === "inverter" && <>
            <TextField label="Inverter size (kW)" type="number" min="0.01" step="0.01" error={form.formState.errors.capacity_kw?.message} {...form.register("capacity_kw")} />
            <TextField label="Maximum recommended PV (kWp)" type="number" min="0.01" step="0.01" error={form.formState.errors.maximum_recommended_pv_kwp?.message} {...form.register("maximum_recommended_pv_kwp")} />
            <SelectField label="Phase" {...form.register("phase")}><option value="single">Single phase</option><option value="three">Three phase</option></SelectField>
            <SelectField label="Battery voltage class" {...form.register("voltage_class")}><option value="NONE">No battery / on-grid</option><option value="LV">LV</option><option value="HV">HV</option></SelectField>
            <TextField label="Compatibility groups" placeholder="KSTAR-HV, UNIVERSAL-HV" {...form.register("compatibility_groups")} />
            <TextField label="Compatible battery brand IDs" placeholder="UUID, UUID" {...form.register("compatible_battery_brand_ids")} />
            <label className="flex items-center gap-2 text-sm font-semibold"><input type="checkbox" {...form.register("parallel_supported")} /> Parallel supported</label>
            {parallelSupported && <TextField label="Maximum parallel units" type="number" min="1" {...form.register("max_parallel_units")} />}
            {parallelSupported && <label className="flex items-center gap-2 text-sm font-semibold"><input type="checkbox" {...form.register("same_model_parallel_only")} /> Same model only</label>}
          </>}

          {selectedCategory === "battery" && <>
            <TextField label="Battery Capacity (kWh)" type="number" min="0.01" max={MAX_RESIDENTIAL_BATTERY_CAPACITY_KWH} step="0.01" error={form.formState.errors.capacity_kwh?.message} {...form.register("capacity_kwh")} />
            <TextField label="Usable capacity (kWh, optional)" type="number" min="0.01" max={MAX_RESIDENTIAL_BATTERY_CAPACITY_KWH} step="0.01" error={form.formState.errors.usable_capacity_kwh?.message} {...form.register("usable_capacity_kwh")} />
            <TextField label="Usable factor override (optional)" type="number" min="0.01" max="1" step="0.01" error={form.formState.errors.usable_factor_override?.message} {...form.register("usable_factor_override")} />
            <SelectField label="Voltage class" {...form.register("voltage_class")}><option value="LV">LV</option><option value="HV">HV</option></SelectField>
            <TextField label="Compatibility groups" placeholder="KSTAR-HV, GOODWE-HV" {...form.register("compatibility_groups")} />
            <TextField label="Compatible inverter brand IDs" placeholder="UUID, UUID" {...form.register("compatible_inverter_brand_ids")} />
            <label className="flex items-center gap-2 text-sm font-semibold"><input type="checkbox" {...form.register("parallel_supported")} /> Supports parallel battery banks</label>
            {parallelSupported && <TextField label="Technical maximum parallel modules" type="number" min="2" error={form.formState.errors.max_parallel_modules?.message} {...form.register("max_parallel_modules")} />}
            {parallelSupported && <TextField label="Commercial maximum parallel modules (optional)" type="number" min="1" error={form.formState.errors.commercial_max_parallel_modules?.message} {...form.register("commercial_max_parallel_modules")} />}
          </>}

          {selectedCategory === "solar_panel" && <>
            <TextField label="Panel wattage (W)" type="number" min="1" error={form.formState.errors.panel_wattage?.message} {...form.register("panel_wattage")} />
            <TextField label="Panel width (mm, optional)" type="number" min="1" {...form.register("panel_width_mm")} />
            <TextField label="Panel height (mm, optional)" type="number" min="1" {...form.register("panel_height_mm")} />
            <SelectField label="Price unit" {...form.register("price_unit")}>{priceUnits.map((item) => <option value={item} key={item}>{item.replace(/_/g, " ")}</option>)}</SelectField>
            {form.watch("price_unit") === "per_watt" && <TextField label="Rate per watt" type="number" min="0" step="0.01" {...form.register("rate_per_watt")} />}
          </>}

          <TextField label="Price" type="number" step="0.01" {...form.register("price")} />
          <TextField label="Package priority" type="number" min="0" {...form.register("priority")} />
          <SelectField label="Stock status" {...form.register("stock_status")}>{stockStatuses.map((item) => <option value={item} key={item}>{stockStatusLabel(item)}</option>)}</SelectField>
          <SelectField label="Publish status" value={publishStatus} onChange={(event) => {
            const published = event.target.value === "published";
            form.setValue("is_active", published, { shouldDirty: true });
            form.setValue("is_visible", published, { shouldDirty: true });
          }}><option value="draft">Draft</option><option value="published">Published</option></SelectField>
          <label className="text-sm font-bold text-ink">Product image<input className="field mt-2" type="file" accept="image/*" onChange={(e) => handleUpload(e.target.files?.[0])} /><span className="mt-1 block text-xs font-normal text-slate-500">{uploading ? "Uploading..." : "Uploads to product-images"}</span></label>

          {(selectedCategory === "inverter" || selectedCategory === "battery") && <label className="md:col-span-2 flex items-center gap-2 text-sm font-semibold"><input type="checkbox" {...form.register("same_brand_compatibility_enabled")} /> Allow same-brand compatibility when voltage matches</label>}
          <label className="flex items-center gap-2 text-sm font-semibold"><input type="checkbox" {...form.register("package_eligible")} /> Package eligible</label>
          <div className="md:col-span-2 rounded-lg border border-slate-200 bg-slate-50 p-3 text-xs text-slate-600">A product appears in customer packages only when the product is Active + Package eligible and its brand has live package generation enabled.</div>
          <div className="md:col-span-2 flex justify-end gap-3 border-t border-slate-100 pt-4"><button type="button" className="btn-secondary" onClick={() => setModalOpen(false)}>Cancel</button><button className="btn-primary" disabled={save.isPending || uploading}>{save.isPending ? "Saving..." : "Save product"}</button></div>
        </form>
      </Modal>
    </>
  );
}

function TextField({ label, error, ...props }: React.InputHTMLAttributes<HTMLInputElement> & { label: string; error?: string }) {
  return <label className="text-sm font-bold text-ink">{label}<input className="field mt-2" {...props} />{error && <span className="mt-1 block text-xs text-red-600">{error}</span>}</label>;
}

function SelectField({ label, error, children, ...props }: React.SelectHTMLAttributes<HTMLSelectElement> & { label: string; error?: string }) {
  return <label className="text-sm font-bold text-ink">{label}<select className="field mt-2" {...props}>{children}</select>{error && <span className="mt-1 block text-xs text-red-600">{error}</span>}</label>;
}
