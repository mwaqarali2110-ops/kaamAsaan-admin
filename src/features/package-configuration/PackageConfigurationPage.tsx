import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useEffect, useMemo, useState } from "react";
import {
  FiAlertTriangle,
  FiArchive,
  FiCheckCircle,
  FiCopy,
  FiEdit2,
  FiEye,
  FiImage,
  FiMoreVertical,
  FiPlus,
  FiSave,
  FiTrash2,
  FiZap,
} from "react-icons/fi";
import { EmptyState, ErrorState, LoadingState } from "../../components/AsyncState";
import { Modal } from "../../components/Modal";
import { PageHeader } from "../../components/PageHeader";
import { generateCatalogPackageDiagnostics, generateCatalogPackages, normalizePackageText, type PackageCompatibilityException, type PackageEngineProduct, type PackagePhase } from "../../lib/packageEngine";
import { normalizePublicStorageUrl, removePublicFile, uploadPublicFile } from "../../lib/storage";
import { supabase } from "../../lib/supabase";
import { errorMessage, formatMoney } from "../../lib/utils";
import type { Brand, FamilyCompatibility, PackageTemplate, Product, ProductFamily, VoltageClass } from "../../types/database";

type ConfigurationData = {
  brands: Brand[];
  products: Product[];
  productFamilies: ProductFamily[];
  familyCompatibility: FamilyCompatibility[];
  packageTemplates: PackageTemplate[];
  exceptions: PackageCompatibilityException[];
  packageSchemaAvailable: boolean;
  schemaErrors: string[];
};

type PackageBrandRow = {
  brand: Brand;
  families: ProductFamily[];
  templates: PackageTemplate[];
  inverters: Product[];
  compatibleBatteryFamilies: ProductFamily[];
  compatibleBatteryProducts: Product[];
  batteryBrandCount: number;
  batterySizeCount: number;
  status: "Draft" | "Live" | "Setup Incomplete";
  missingItems: string[];
  generationWarnings: string[];
};

type PackageEditContext = {
  packageId: string | null;
  brandId: string;
};

type BrandFormValues = {
  name: string;
  slug: string;
  aliases: string;
  logoUrl: string;
  packageImageUrl: string;
  active: boolean;
  live: boolean;
  inverters: DraftInverterEntry[];
  batteries: DraftBatteryEntry[];
};

type DraftInverterEntry = { id: string; name: string; capacityKw: number; phase: PackagePhase; voltageType: VoltageClass; price: number; active: boolean; packageEligible: boolean };
type DraftBatteryEntry = { id: string; brand: string; model: string; capacityKwh: number; voltageType: Exclude<VoltageClass, "NONE">; preferred: boolean; active: boolean; compatibleWith: "LV" | "HV" };

type InverterFormValues = {
  mode: "existing" | "new";
  existingProductId: string;
  name: string;
  model: string;
  capacityKw: number;
  voltageType: VoltageClass;
  phase: PackagePhase;
  parallelSupported: boolean;
  maxParallelUnits: number;
  price: number;
  imageUrl: string;
  active: boolean;
  packageEligible: boolean;
};

type InverterEditValues = {
  name: string;
  model: string;
  capacityKw: number;
  voltageType: Exclude<VoltageClass, "NONE"> | "";
  phase: PackagePhase;
  parallelSupported: boolean;
  active: boolean;
  packageEligible: boolean;
};

type BatteryBrandSelections = Partial<Record<Exclude<VoltageClass, "NONE">, string[]>>;

type PreviewValues = {
  requiredSolarKw: number;
  requiredInverterKw: number;
  requiredBatteryKwh: number;
  runningLoadKw: number;
  backupHours: number;
  phase: PackagePhase;
};

const missingSchemaCodes = new Set(["42703", "42P01", "PGRST204", "PGRST205"]);
const packageBrandNames = new Set(["fox", "solis", "goodwe", "kstar", "itel"]);
const presetInverterSizes = [3, 5, 6, 8, 10, 12, 15, 20];
const presetBatterySizes = [5, 8, 10, 12, 14, 16, 20];
const MAX_RESIDENTIAL_BATTERY_CAPACITY_KWH = 200;
const PACKAGE_IMAGE_BUCKET = "package-images";
const BRAND_LOGO_BUCKET = "brand-logos";
const getPackageImageUrl = (value?: string | null) => {
  const trimmed = value?.trim();
  if (!trimmed || trimmed.startsWith("blob:") || /localhost/i.test(trimmed)) return "";
  if (/\/storage\/v1\/object\/(?:public|sign)\//i.test(trimmed) && !trimmed.includes(`/storage/v1/object/public/${PACKAGE_IMAGE_BUCKET}/`) && !trimmed.includes(`/storage/v1/object/sign/${PACKAGE_IMAGE_BUCKET}/`)) return "";
  return normalizePublicStorageUrl(PACKAGE_IMAGE_BUCKET, trimmed) || trimmed;
};
const getBrandLogoUrl = (value?: string | null) => normalizePublicStorageUrl(BRAND_LOGO_BUCKET, value) || value?.trim() || "";
const appendImageVersion = (url?: string | null, updatedAt?: string | null) => {
  const cleanUrl = getPackageImageUrl(url);
  if (!cleanUrl) return "";
  try {
    const parsed = new URL(cleanUrl);
    parsed.searchParams.set("v", updatedAt || Date.now().toString());
    return parsed.toString();
  } catch {
    return cleanUrl;
  }
};

const normalizeSlug = (value = "") => normalizePackageText(value).replace(/[^a-z0-9]+/g, "");
const displayVoltage = (value?: VoltageClass | null) => value === "NONE" ? "No Battery" : value ?? "—";
const normalizeVoltageArchitecture = (value: unknown): "LV" | "HV" | null => {
  if (typeof value !== "string") return null;
  const normalized = value.toLowerCase().replace(/[_-]+/g, " ").trim();
  if (!normalized || normalized === "none" || normalized === "no battery" || normalized === "—" || normalized === "-") return null;
  if (normalized === "lv" || normalized === "low voltage" || normalized === "lowvoltage") return "LV";
  if (normalized === "hv" || normalized === "high voltage" || normalized === "highvoltage") return "HV";
  return null;
};
const productSpecValue = (product: Product, keys: string[]) => {
  for (const key of keys) {
    const value = product.specifications?.[key];
    if (typeof value === "string") return value;
  }
  return null;
};
const isBatteryProduct = (product: Product) => {
  const category = String(product.category ?? "").toLowerCase().trim();
  return category === "battery" || category === "batteries";
};
const resolveVoltageArchitecture = (product: Product, families: ProductFamily[] = []): "LV" | "HV" | null => {
  const direct = product as Product & { voltage_type?: string | null; battery_voltage_type?: string | null };
  return normalizeVoltageArchitecture(direct.voltage_class) ??
    normalizeVoltageArchitecture(direct.voltage_type) ??
    normalizeVoltageArchitecture(direct.battery_voltage_type) ??
    normalizeVoltageArchitecture(productSpecValue(product, ["voltage_type", "battery_voltage_type", "battery_type", "voltage_architecture"])) ??
    normalizeVoltageArchitecture(families.find((family) => family.id === product.product_family_id)?.voltage_type);
};
const resolveBatteryArchitecture = (product: Product, families: ProductFamily[] = []): "LV" | "HV" | null => {
  const direct = product as Product & { voltage_type?: string | null; battery_voltage_type?: string | null };
  return normalizeVoltageArchitecture(direct.voltage_type) ??
    normalizeVoltageArchitecture(direct.battery_voltage_type) ??
    normalizeVoltageArchitecture(direct.voltage_class) ??
    normalizeVoltageArchitecture(productSpecValue(product, ["voltage_type", "battery_voltage_type", "battery_type", "battery_architecture", "voltage_architecture"])) ??
    normalizeVoltageArchitecture(families.find((family) => family.id === product.product_family_id)?.voltage_type);
};
const uniqueProductsById = (products: Product[]) => [...new Map(products.map((product) => [product.id, product])).values()];
const uniqueInverterDisplayProducts = (products: Product[], families: ProductFamily[] = []) => [...new Map(uniqueProductsById(products).map((product) => [
  [
    normalizePackageText(product.name),
    normalizePackageText(product.model ?? ""),
    product.capacity_kw ?? "",
    resolveVoltageArchitecture(product, families) ?? "",
    product.phase ?? explicitPhase(product) ?? "",
  ].join("|"),
  product,
])).values()];
const activePackageInverters = (products: Product[]) => uniqueProductsById(products)
  .filter((product) => product.is_active !== false && product.package_eligible !== false && (product.capacity_kw ?? 0) > 0);
const generationArchitectureWarning = (brandName: string, missing: Array<"LV" | "HV">) => missing.map((voltage) =>
  `${voltage} battery compatibility is not configured. ${brandName} ${voltage} battery-backed packages will not be generated.`
);
const familyGroup = (family: ProductFamily) => family.slug.toUpperCase().replace(/[^A-Z0-9]+/g, "-");
const currency = (value: number | null | undefined) => value == null ? "Price on request" : formatMoney(value, "PKR");
const packageTemplateBrandId = (template: PackageTemplate | undefined, families: ProductFamily[]) =>
  families.find((family) => family.id === template?.primary_inverter_family_id)?.brand_id ?? null;
const primaryTemplateIdForRow = (row: PackageBrandRow) => {
  const canonicalSlug = `${normalizeSlug(row.brand.canonical_slug || row.brand.slug || row.brand.name)}-package`;
  return row.templates.find((template) => template.slug === canonicalSlug)?.id ?? row.templates[0]?.id ?? null;
};

const mapInverterFormToProductPayload = (brandId: string, family: ProductFamily, values: InverterFormValues, slug: string) => ({
  brand_id: brandId,
  category: "inverter",
  name: values.name.trim(),
  slug,
  model: values.model.trim() || null,
  capacity_kw: Number(values.capacityKw),
  phase: values.phase,
  voltage_class: values.voltageType,
  compatibility_groups: [familyGroup(family)],
  parallel_supported: values.parallelSupported,
  max_parallel_units: values.parallelSupported ? values.maxParallelUnits : 1,
  package_eligible: values.packageEligible,
  product_family_id: family.id,
  price: values.price > 0 ? Number(values.price) : null,
  currency_code: "PKR",
  image_url: values.imageUrl.trim() || null,
  specifications: { product_type: "hybrid_inverter", phase: `${values.phase}_phase`, voltage: values.voltageType },
  stock_status: "in_stock",
  is_active: values.active,
});

async function fetchConfigurationData(): Promise<ConfigurationData> {
  const [productsResult, brandsResult, brandSchemaResult, productSchemaResult, familiesSchemaResult, compatibilitySchemaResult, templatesSchemaResult, exceptionSchemaResult] = await Promise.all([
    supabase.from("products").select("*, brands:brands!products_brand_id_fkey(*)").order("name"),
    supabase.from("brands").select("*").order("name"),
    supabase.from("brands").select("package_generation_enabled, default_compatibility_group, package_image_url, priority, canonical_slug").limit(1),
    supabase.from("products").select("package_eligible, product_family_id, compatibility_groups, voltage_class, capacity_kwh, panel_wattage, priority").limit(1),
    supabase.from("product_families").select("id").limit(1),
    supabase.from("family_compatibility").select("id").limit(1),
    supabase.from("package_templates").select("id").limit(1),
    supabase.from("product_compatibility_exceptions").select("id").limit(1),
  ]);

  if (productsResult.error) throw productsResult.error;
  if (brandsResult.error) throw brandsResult.error;

  const schemaErrors = [brandSchemaResult.error, productSchemaResult.error, familiesSchemaResult.error, compatibilitySchemaResult.error, templatesSchemaResult.error, exceptionSchemaResult.error].filter(Boolean);
  const packageSchemaAvailable = schemaErrors.length === 0;
  if (!packageSchemaAvailable && !schemaErrors.every((error) => missingSchemaCodes.has(String(error?.code ?? "")))) {
    throw schemaErrors[0];
  }

  let productFamilies: ProductFamily[] = [];
  let familyCompatibility: FamilyCompatibility[] = [];
  let packageTemplates: PackageTemplate[] = [];
  let exceptions: PackageCompatibilityException[] = [];

  if (packageSchemaAvailable) {
    const [familiesResult, compatibilityResult, templatesResult, exceptionsResult] = await Promise.all([
      supabase.from("product_families").select("*, brands:brands!product_families_brand_id_fkey(id, name, slug, aliases, priority, package_generation_enabled, package_image_url, is_active)").order("name"),
      supabase.from("family_compatibility").select("*").order("priority", { ascending: false }),
      supabase.from("package_templates").select("*").order("priority", { ascending: false }).order("name"),
      supabase.from("product_compatibility_exceptions").select("source_product_id, target_product_id, status, is_active"),
    ]);
    if (familiesResult.error) throw familiesResult.error;
    if (compatibilityResult.error) throw compatibilityResult.error;
    if (templatesResult.error) throw templatesResult.error;
    if (exceptionsResult.error) throw exceptionsResult.error;
    productFamilies = familiesResult.data as unknown as ProductFamily[];
    familyCompatibility = compatibilityResult.data as unknown as FamilyCompatibility[];
    packageTemplates = templatesResult.data as unknown as PackageTemplate[];
    const familyRules = (compatibilityResult.data ?? []).map((rule) => {
      const batteryFamily = productFamilies.find((family) => family.id === rule.battery_family_id);
      return {
        sourceFamilyId: rule.inverter_family_id,
        targetFamilyId: rule.battery_family_id,
        targetBrandId: batteryFamily?.brand_id,
        voltageType: batteryFamily?.voltage_type,
        status: rule.status,
        active: rule.is_active,
      };
    }) as PackageCompatibilityException[];
    const productRules = (exceptionsResult.data ?? []).map((rule) => ({
      sourceProductId: rule.source_product_id,
      targetProductId: rule.target_product_id,
      status: rule.status,
      active: rule.is_active,
    })) as PackageCompatibilityException[];
    exceptions = [...familyRules, ...productRules];
  }

  return {
    products: productsResult.data as unknown as Product[],
    brands: brandsResult.data as unknown as Brand[],
    productFamilies,
    familyCompatibility,
    packageTemplates,
    exceptions,
    packageSchemaAvailable,
    schemaErrors: schemaErrors.map((error) => `${error?.code ?? "unknown"}: ${error?.message ?? "Schema check failed"}`),
  };
}

function packageBrandRows(data: ConfigurationData): PackageBrandRow[] {
  const brandById = new Map(data.brands.map((brand) => [brand.id, brand]));
  const familyById = new Map(data.productFamilies.map((family) => [family.id, family]));
  const relevantBrandIds = new Set<string>();

  data.productFamilies
    .filter((family) => family.category === "inverter")
    .forEach((family) => relevantBrandIds.add(family.brand_id));
  data.packageTemplates.forEach((template) => {
    const family = familyById.get(template.primary_inverter_family_id);
    if (family) relevantBrandIds.add(family.brand_id);
  });
  data.brands
    .filter((brand) => {
      const key = normalizePackageText(brand.name);
      const hasInverterProducts = data.products.some((product) => product.brand_id === brand.id && product.category === "inverter");
      return packageBrandNames.has(key) || Boolean(getPackageImageUrl(brand.package_image_url) && hasInverterProducts) || Boolean(brand.package_generation_enabled && hasInverterProducts && getPackageImageUrl(brand.package_image_url));
    })
    .forEach((brand) => relevantBrandIds.add(brand.id));

  const rawRows = [...relevantBrandIds]
    .map((brandId) => {
      const brand = brandById.get(brandId);
      if (!brand) return null;
      const families = data.productFamilies.filter((family) => family.brand_id === brand.id && family.category === "inverter");
      const templates = data.packageTemplates.filter((template) => families.some((family) => family.id === template.primary_inverter_family_id));
      const inverters = uniqueProductsById(data.products.filter((product) => product.brand_id === brand.id && product.category === "inverter"));
      const activeInverters = activePackageInverters(inverters);
      const requiredArchitectures = [...new Set(activeInverters
        .map((product) => resolveVoltageArchitecture(product, families))
        .filter((voltage): voltage is "LV" | "HV" => voltage === "LV" || voltage === "HV"))];
      const mappings = data.familyCompatibility.filter((mapping) => mapping.is_active && mapping.status !== "incompatible" && families.some((family) => family.id === mapping.inverter_family_id));
      const compatibleBatteryFamilies = mappings.map((mapping) => familyById.get(mapping.battery_family_id)).filter((family): family is ProductFamily => Boolean(family));
      const compatibleBatteryProducts = data.products.filter((product) =>
        product.category === "battery" &&
        product.is_active !== false &&
        product.package_eligible !== false &&
        compatibleBatteryFamilies.some((family) => family.id === product.product_family_id)
      );
      const batteryBrands = new Set(compatibleBatteryProducts.map((product) => product.brand_id));
      const batterySizes = new Set(compatibleBatteryProducts.map((product) => product.capacity_kwh ?? product.battery_capacity_kwh).filter(Boolean));
      const mappedArchitectures = [...new Set(mappings
        .map((mapping) => families.find((family) => family.id === mapping.inverter_family_id)?.voltage_type)
        .filter((voltage): voltage is "LV" | "HV" => voltage === "LV" || voltage === "HV"))];
      const missingArchitectures = requiredArchitectures.filter((voltage) => !mappedArchitectures.includes(voltage));
      const missingItems = [
        !getPackageImageUrl(brand.package_image_url) ? "Package image required" : null,
        activeInverters.length === 0 ? "Add at least one inverter" : null,
      ].filter((item): item is string => Boolean(item));
      const generationWarnings = [
        ...generationArchitectureWarning(brand.name, missingArchitectures),
        activeInverters.some((product) => !resolveVoltageArchitecture(product, families)) ? "Some inverters are excluded from battery package generation because their LV/HV architecture is not configured." : null,
      ].filter((item): item is string => Boolean(item));
      const hasLiveTemplate = templates.some((template) => template.status === "live" && template.is_active);
      const status: PackageBrandRow["status"] = missingItems.length > 0 ? "Setup Incomplete" : brand.is_active !== false && hasLiveTemplate ? "Live" : "Draft";
      return { brand, families, templates, inverters, compatibleBatteryFamilies, compatibleBatteryProducts, batteryBrandCount: batteryBrands.size, batterySizeCount: batterySizes.size, status, missingItems, generationWarnings };
    })
    .filter((row): row is PackageBrandRow => Boolean(row))
    .sort((left, right) => {
      const rank = (row: PackageBrandRow) => packageBrandNames.has(normalizePackageText(row.brand.name)) ? 0 : 1;
      return rank(left) - rank(right) || (right.brand.priority ?? 0) - (left.brand.priority ?? 0) || left.brand.name.localeCompare(right.brand.name);
    });

  const canonicalBrand = (value: string) => {
    const normalized = normalizePackageText(value);
    if (normalized.includes("goodwe") || normalized.includes("goodwee")) return "goodwe";
    if (normalized.includes("foxess") || normalized === "fox") return "fox";
    if (normalized.includes("kstar")) return "kstar";
    if (normalized.includes("itel")) return "itel";
    if (normalized.includes("solis")) return "solis";
    return normalized;
  };
  const grouped = new Map<string, PackageBrandRow>();
  rawRows.forEach((row) => {
    const key = canonicalBrand([row.brand.name, ...(row.brand.aliases ?? [])].join(" "));
    const existing = grouped.get(key);
    if (!existing) { grouped.set(key, row); return; }
    const preferred = row.inverters.length + row.compatibleBatteryProducts.length > existing.inverters.length + existing.compatibleBatteryProducts.length ? row : existing;
    const inverters = uniqueProductsById([...existing.inverters, ...row.inverters]);
    const batteries = [...new Map([...existing.compatibleBatteryProducts, ...row.compatibleBatteryProducts].map((item) => [item.id, item])).values()];
    const families = [...new Map([...existing.families, ...row.families].map((item) => [item.id, item])).values()];
    const activeInverters = activePackageInverters(inverters);
    const compatibleFamilies = [...new Map([...existing.compatibleBatteryFamilies, ...row.compatibleBatteryFamilies].map((item) => [item.id, item])).values()];
    const activeMappings = data.familyCompatibility.filter((mapping) => mapping.is_active && mapping.status !== "incompatible");
    const requiredArchitectures = [...new Set(activeInverters
      .map((product) => resolveVoltageArchitecture(product, families))
      .filter((voltage): voltage is "LV" | "HV" => voltage === "LV" || voltage === "HV"))];
    const mappedArchitectures = [...new Set(activeMappings
      .map((mapping) => families.find((family) => family.id === mapping.inverter_family_id)?.voltage_type)
      .filter((voltage): voltage is "LV" | "HV" => voltage === "LV" || voltage === "HV"))];
    const missingArchitectures = requiredArchitectures.filter((voltage) => !mappedArchitectures.includes(voltage));
    const mergedMissingItems = [
      !getPackageImageUrl(preferred.brand.package_image_url) ? "Package image required" : null,
      activeInverters.length === 0 ? "Add at least one inverter" : null,
    ].filter((item): item is string => Boolean(item));
    const mergedGenerationWarnings = [
      ...generationArchitectureWarning(preferred.brand.name, missingArchitectures),
      activeInverters.some((product) => !resolveVoltageArchitecture(product, families)) ? "Some inverters are excluded from battery package generation because their LV/HV architecture is not configured." : null,
    ].filter((item): item is string => Boolean(item));
    grouped.set(key, {
      ...preferred,
      families,
      inverters,
      compatibleBatteryProducts: batteries,
      compatibleBatteryFamilies: compatibleFamilies,
      batteryBrandCount: new Set(batteries.map((item) => item.brand_id)).size,
      batterySizeCount: new Set(batteries.map((item) => item.capacity_kwh ?? item.battery_capacity_kwh).filter(Boolean)).size,
      status: mergedMissingItems.length > 0 ? "Setup Incomplete" : preferred.status === "Live" ? "Live" : "Draft",
      missingItems: mergedMissingItems,
      generationWarnings: mergedGenerationWarnings,
    });
  });
  return [...grouped.values()];
}

function explicitPhase(product: Product) {
  const configured = product.specifications?.phase;
  if (typeof configured === "string") {
    if (/^(?:three[_\s-]*phase|3[_\s-]*phase)$/i.test(configured)) return "three" as const;
    if (/^(?:single[_\s-]*phase|1[_\s-]*phase)$/i.test(configured)) return "single" as const;
  }
  const text = [product.name, product.model].filter(Boolean).join(" ");
  if (/\b(?:three[\s-]*phase|3[\s-]*(?:phase|p))\b/i.test(text)) return "three" as const;
  if (/\b(?:single[\s-]*phase|1[\s-]*(?:phase|p))\b/i.test(text)) return "single" as const;
  return null;
}

function mapEngineProduct(product: Product, data: ConfigurationData, includeDrafts = false): PackageEngineProduct | null {
  const category = product.category === "solar_panel" ? "panel" : product.category;
  if (category !== "panel" && category !== "inverter" && category !== "battery") return null;
  const family = product.product_family_id ? data.productFamilies.find((item) => item.id === product.product_family_id) : null;
  const mappingGroups = category === "battery" && family
    ? data.familyCompatibility
      .filter((mapping) => mapping.battery_family_id === family.id && mapping.is_active && mapping.status !== "incompatible")
      .map((mapping) => data.productFamilies.find((item) => item.id === mapping.inverter_family_id))
      .filter((item): item is ProductFamily => Boolean(item))
      .map(familyGroup)
    : [];
  return {
    id: product.id, category, brandId: product.brand_id, brandName: product.brands?.name ?? "Unknown brand",
    productFamilyId: product.product_family_id ?? null,
    brandAliases: product.brands?.aliases ?? [], brandPriority: product.brands?.priority ?? 0,
    brandPackageGenerationEnabled: includeDrafts ? true : product.brands?.package_generation_enabled ?? false,
    brandPackageImageUrl: product.brands?.package_image_url, name: product.name, model: product.model,
    brandLogo: product.brands?.logo_url,
    imageUrl: product.image_url, price: product.price, active: includeDrafts ? true : product.is_active,
    packageEligible: includeDrafts ? true : product.package_eligible ?? false, priority: product.priority ?? 0,
    available: product.stock_status !== "out_of_stock", stockStatus: product.stock_status, capacityKw: product.capacity_kw ?? undefined,
    capacityKwh: product.capacity_kwh ?? product.battery_capacity_kwh ?? undefined,
    usableCapacityKwh: product.usable_capacity_kwh, panelWattage: product.panel_wattage ?? product.capacity_watt ?? undefined,
    pricePerWatt: product.rate_per_watt, phase: product.phase ?? explicitPhase(product),
    voltageClass: category === "battery" ? resolveBatteryArchitecture(product, data.productFamilies) : resolveVoltageArchitecture(product, data.productFamilies),
    compatibilityGroups: [...new Set([...(product.compatibility_groups ?? []), ...(family ? [familyGroup(family)] : []), ...mappingGroups])],
    parallelSupported: product.parallel_supported ?? false, maxParallelUnits: product.max_parallel_units ?? 1,
    sameModelParallelOnly: product.same_model_parallel_only ?? true, maxParallelModules: product.max_parallel_modules,
    commercialMaxParallelModules: product.commercial_max_parallel_modules,
    sameBrandCompatibilityEnabled: false,
  };
}

async function ensureFamily(brand: Brand, voltageType: VoltageClass, category: "inverter" | "battery", phase?: PackagePhase | null) {
  const slug = `${normalizeSlug(brand.slug || brand.name)}-${voltageType.toLowerCase()}-${category}`;
  const existing = await supabase
    .from("product_families")
    .select("*")
    .eq("brand_id", brand.id)
    .eq("slug", slug)
    .eq("category", category)
    .maybeSingle();
  if (existing.error) throw existing.error;
  if (existing.data) {
    const { error } = await supabase.from("product_families").update({
      name: `${brand.name} ${displayVoltage(voltageType)} ${category === "battery" ? "Battery" : "Inverters"}`,
      voltage_type: voltageType,
      phase: category === "inverter" ? phase : null,
      battery_required: category === "inverter" ? voltageType !== "NONE" : false,
      is_active: true,
      status: "ready",
      updated_at: new Date().toISOString(),
    }).eq("id", existing.data.id);
    if (error) throw error;
    return existing.data as ProductFamily;
  }
  const { data, error } = await supabase.from("product_families").insert({
    brand_id: brand.id,
    name: `${brand.name} ${displayVoltage(voltageType)} ${category === "battery" ? "Battery" : "Inverters"}`,
    slug,
    category,
    voltage_type: voltageType,
    phase: category === "inverter" ? phase : null,
    battery_required: category === "inverter" ? voltageType !== "NONE" : false,
    status: "ready",
    is_active: true,
  }).select("*").single();
  if (error) throw error;
  return data as ProductFamily;
}

async function ensureBrandTemplate(brand: Brand, family: ProductFamily, live: boolean) {
  const slug = `${normalizeSlug(brand.slug || brand.name)}-package`;
  const payload = {
    name: `${brand.name} Package`,
    slug,
    customer_title: `${brand.name} Solar Package`,
    primary_inverter_family_id: family.id,
    battery_selection_mode: family.battery_required ? "all_compatible" : "none",
    panel_selection_mode: "all_active",
    package_image_url: getPackageImageUrl(brand.package_image_url),
    enable_basic: true,
    enable_recommended: true,
    enable_better: true,
    status: live ? "live" : "draft",
    is_active: true,
    minimum_basic_sizing_percentage: 90,
  };
  const existing = await supabase.from("package_templates").select("id, package_image_url, updated_at").eq("slug", slug).maybeSingle();
  if (existing.error) throw existing.error;
  if (existing.data) {
    const { data, error } = await supabase.from("package_templates").update(payload).eq("id", existing.data.id).select("id, package_image_url, updated_at").single();
    if (error) throw error;
    return data as Pick<PackageTemplate, "id" | "package_image_url" | "updated_at">;
  }
  const { data, error } = await supabase.from("package_templates").insert(payload).select("id, package_image_url, updated_at").single();
  if (error) throw error;
  return data as Pick<PackageTemplate, "id" | "package_image_url" | "updated_at">;
}

export function PackageConfigurationPage() {
  const queryClient = useQueryClient();
  const data = useQuery({ queryKey: ["package-configuration"], queryFn: fetchConfigurationData });
  const [brandModalOpen, setBrandModalOpen] = useState(false);
  const [selectedPackageContext, setSelectedPackageContext] = useState<PackageEditContext | null>(null);
  const [previewBrand, setPreviewBrand] = useState<PackageBrandRow | null>(null);

  const rows = useMemo(() => data.data ? packageBrandRows(data.data) : [], [data.data]);
  const selectedBrand = useMemo(() => {
    if (!selectedPackageContext) return null;
    return rows.find((row) =>
      row.brand.id === selectedPackageContext.brandId &&
      (!selectedPackageContext.packageId || row.templates.some((template) => template.id === selectedPackageContext.packageId))
    ) ?? rows.find((row) => row.brand.id === selectedPackageContext.brandId) ?? null;
  }, [rows, selectedPackageContext]);
  const schemaReady = Boolean(data.data?.packageSchemaAvailable);
  const openPackageEditor = (row: PackageBrandRow) => {
    const packageId = primaryTemplateIdForRow(row);
    setSelectedPackageContext({ packageId, brandId: row.brand.id });
  };

  const saveBrand = useMutation({
    mutationFn: async (values: BrandFormValues) => {
      if (!values.name.trim()) throw new Error("Package name and inverter brand are required.");
      if (values.live && !values.packageImageUrl.trim()) throw new Error("Package image is required before publishing.");
      const slug = normalizeSlug(values.slug || values.name);
      const { data: existingBrands, error: existingError } = await supabase.from("brands").select("id, name, slug, canonical_slug, aliases");
      if (existingError) throw existingError;
      const normalizedBrand = normalizeSlug(values.name.replace(/\s*package\s*$/i, ""));
      const existingBrand = (existingBrands ?? []).find((brand) => [brand.name, brand.slug, brand.canonical_slug, ...(brand.aliases ?? [])].some((value) => normalizeSlug(value ?? "") === normalizedBrand)) as Brand | undefined;
      const brandFamilies = existingBrand ? await supabase.from("product_families").select("id").eq("brand_id", existingBrand.id).eq("category", "inverter") : { data: [], error: null };
      if (brandFamilies.error) throw brandFamilies.error;
      const familyIds = (brandFamilies.data ?? []).map((family) => family.id);
      if (familyIds.length > 0) {
        const existingPackage = await supabase.from("package_templates").select("id").in("primary_inverter_family_id", familyIds).limit(1);
        if (existingPackage.error) throw existingPackage.error;
        if ((existingPackage.data?.length ?? 0) > 0) throw new Error(`${existingBrand?.name ?? values.name.replace(/\s*package\s*$/i, "")} Package already exists.`);
      }
      const aliases = values.aliases.split(",").map((alias) => alias.trim().toLowerCase()).filter(Boolean);
      let savedBrand: Brand;
      if (existingBrand) {
        const repairedSlug = normalizeSlug(values.slug || existingBrand.name);
        const { data: updated, error } = await supabase.from("brands").update({ name: existingBrand.name, slug: repairedSlug, canonical_slug: repairedSlug, aliases: [...new Set(aliases)], logo_url: values.logoUrl.trim() || null, package_image_url: getPackageImageUrl(values.packageImageUrl) || null, package_generation_enabled: values.live, is_active: values.active }).eq("id", existingBrand.id).select("*").single();
        if (error) throw error;
        savedBrand = updated as Brand;
      } else {
        const { data: inserted, error } = await supabase.from("brands").insert({ name: values.name.trim(), slug, canonical_slug: slug, aliases: [...new Set(aliases)], logo_url: values.logoUrl.trim() || null, package_image_url: getPackageImageUrl(values.packageImageUrl) || null, package_generation_enabled: values.live, is_active: values.active }).select("*").single();
        if (error) throw error;
        savedBrand = inserted as Brand;
      }
      const inverterFamilies = new Map<string, ProductFamily>();
      for (const inverter of values.inverters) {
        const family = await ensureFamily(savedBrand, inverter.voltageType, "inverter", inverter.phase);
        inverterFamilies.set(inverter.voltageType, family);
        const { error: inverterError } = await supabase.from("products").insert({
          brand_id: savedBrand.id, category: "inverter", name: inverter.name.trim(), slug: `${slug}-${normalizeSlug(inverter.name)}-${Date.now()}`,
          capacity_kw: inverter.capacityKw, phase: inverter.phase, voltage_class: inverter.voltageType,
          compatibility_groups: [familyGroup(family)], package_eligible: inverter.packageEligible, product_family_id: family.id, price: inverter.price || null,
          currency_code: "PKR", stock_status: "in_stock", is_active: inverter.active,
        });
        if (inverterError) throw inverterError;
      }
      for (const battery of values.batteries) {
        const existingBrand = (await supabase.from("brands").select("*").ilike("name", battery.brand.trim()).maybeSingle()).data as Brand | null;
        const batteryBrand = existingBrand ?? (await supabase.from("brands").insert({ name: battery.brand.trim(), slug: normalizeSlug(battery.brand), canonical_slug: normalizeSlug(battery.brand), category: "battery", aliases: [], is_active: true, package_generation_enabled: false }).select("*").single()).data as Brand;
        if (!batteryBrand) throw new Error(`Unable to create battery brand ${battery.brand}.`);
        const batteryFamily = await ensureFamily(batteryBrand, battery.voltageType, "battery", null);
        const targetFamily = inverterFamilies.get(battery.compatibleWith);
        if (!targetFamily) throw new Error(`Add a ${battery.compatibleWith} inverter before assigning this battery.`);
        const { error: batteryError } = await supabase.from("products").insert({ brand_id: batteryBrand.id, category: "battery", name: battery.model.trim() || `${battery.brand} ${battery.capacityKwh}kWh Battery`, slug: `${normalizeSlug(battery.brand)}-${battery.capacityKwh}-${Date.now()}`, battery_capacity_kwh: battery.capacityKwh, capacity_kwh: battery.capacityKwh, voltage_class: battery.voltageType, compatibility_groups: [familyGroup(batteryFamily), familyGroup(targetFamily)], package_eligible: true, product_family_id: batteryFamily.id, is_active: battery.active, stock_status: "in_stock" });
        if (batteryError) throw batteryError;
        const { error: mappingError } = await supabase.from("family_compatibility").upsert({ inverter_family_id: targetFamily.id, battery_family_id: batteryFamily.id, status: battery.preferred ? "preferred" : "compatible", is_active: battery.active }, { onConflict: "inverter_family_id,battery_family_id" });
        if (mappingError) throw mappingError;
      }
      if (values.live) {
        const family = inverterFamilies.get("LV") ?? inverterFamilies.get("HV") ?? await ensureFamily(savedBrand, "LV", "inverter", null);
        await ensureBrandTemplate(savedBrand, family, values.batteries.length > 0 || values.inverters.every((item) => item.voltageType === "NONE"));
      }
    },
    onSuccess: async () => {
      setBrandModalOpen(false);
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: ["package-configuration"] }),
        queryClient.invalidateQueries({ queryKey: ["products"] }),
        queryClient.invalidateQueries({ queryKey: ["brands"] }),
      ]);
    },
  });

  const deactivateBrand = useMutation({
    mutationFn: async (brandId: string) => {
      const { error } = await supabase.from("brands").update({ is_active: false, package_generation_enabled: false }).eq("id", brandId);
      if (error) throw error;
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["package-configuration"] }),
  });

  const deleteBrand = useMutation({
    mutationFn: async (row: PackageBrandRow) => {
      const references = await supabase.from("products").select("id").eq("brand_id", row.brand.id).limit(1);
      if (references.error) throw references.error;
      if ((references.data?.length ?? 0) > 0 || row.inverters.length > 0 || row.families.length > 0 || row.templates.length > 0) {
        throw new Error("This package brand has products or package records attached. Deactivate it instead, so existing catalog data is preserved.");
      }
      const { error } = await supabase.from("brands").delete().eq("id", row.brand.id);
      if (error) throw error;
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["package-configuration"] }),
  });

  return <>
    <PageHeader
      title="Package Management"
      description="Manage inverter-brand package images, inverter products and compatible batteries."
      action={<button className="btn-primary" onClick={() => setBrandModalOpen(true)} disabled={!schemaReady}><FiPlus /> Add Package</button>}
    />

    {data.isLoading ? <LoadingState /> : data.error ? <ErrorState message={data.error.message} /> : data.data ? <>
      {!schemaReady ? <MigrationBanner details={data.data.schemaErrors} /> : null}

      {rows.length === 0 ? <EmptyState label="No inverter packages configured yet. Add an inverter package, upload its image and configure its compatible batteries." /> : <section className="overflow-hidden rounded-xl border border-slate-200 bg-white shadow-sm">
        <div className="hidden grid-cols-[minmax(240px,1.4fr)_1fr_1.2fr_0.8fr_170px] gap-4 border-b border-slate-200 bg-slate-50 px-5 py-3 text-xs font-black uppercase tracking-wide text-slate-500 lg:grid">
          <span>Package</span><span>Inverter Options</span><span>Compatible Batteries</span><span>Status</span><span>Actions</span>
        </div>
        {rows.map((row) => <PackageListRow
          key={row.brand.id}
          row={row}
          onEdit={() => openPackageEditor(row)}
          onPreview={() => setPreviewBrand(row)}
          onDuplicate={() => setBrandModalOpen(true)}
          onDeactivate={() => deactivateBrand.mutate(row.brand.id)}
          onDelete={() => deleteBrand.mutate(row)}
        />)}
      </section>}

      {deleteBrand.error ? <div className="mt-4 rounded-lg border border-amber-200 bg-amber-50 p-3 text-sm font-semibold text-amber-900">{deleteBrand.error.message}</div> : null}

      <BrandModal
        open={brandModalOpen}
        data={data.data}
        onClose={() => setBrandModalOpen(false)}
        disabled={!schemaReady}
        saving={saveBrand.isPending}
        error={saveBrand.error?.message}
        onSave={(values) => saveBrand.mutate(values)}
      />
      <BrandConfigurationModal
        open={Boolean(selectedPackageContext && selectedBrand)}
        row={selectedBrand}
        expectedPackageId={selectedPackageContext?.packageId ?? null}
        expectedBrandId={selectedPackageContext?.brandId ?? null}
        data={data.data}
        onClose={() => setSelectedPackageContext(null)}
      />
      <PreviewModal
        open={Boolean(previewBrand)}
        row={previewBrand}
        data={data.data}
        onClose={() => setPreviewBrand(null)}
      />
    </> : null}
  </>;
}

function PackageListRow({ row, onEdit, onPreview, onDuplicate, onDeactivate, onDelete }: { row: PackageBrandRow; onEdit: () => void; onPreview: () => void; onDuplicate: () => void; onDeactivate: () => void; onDelete: () => void }) {
  const [menuOpen, setMenuOpen] = useState(false);
  const packageImageUrl = getPackageImageUrl(row.brand.package_image_url);
  return <div className="grid min-h-[82px] gap-3 border-b border-slate-100 px-5 py-3 last:border-b-0 lg:grid-cols-[minmax(260px,1.5fr)_1fr_1.25fr_0.85fr_150px] lg:items-center lg:gap-4">
    <div className="flex min-w-0 items-center gap-3">
      <div className="flex h-12 w-16 shrink-0 items-center justify-center overflow-hidden rounded-lg border border-slate-100 bg-slate-50">
        {packageImageUrl ? <img src={packageImageUrl} alt={`${row.brand.name} package`} className="h-full w-full object-contain p-1" /> : <FiImage className="text-xl text-slate-300" />}
      </div>
      <div className="min-w-0"><div className="truncate font-black text-ink">{row.brand.name} Package</div><div className="truncate text-xs font-semibold text-slate-500">{row.brand.package_image_url ? "Package image configured" : "Package image missing"}</div></div>
    </div>
    <div><span className="text-[10px] font-black uppercase tracking-wide text-slate-400 lg:hidden">Inverter Options</span><div className="font-black text-ink">{row.inverters.filter((item) => item.package_eligible !== false).length} options</div></div>
    <div><span className="text-[10px] font-black uppercase tracking-wide text-slate-400 lg:hidden">Compatible Batteries</span><div className="font-black text-ink">{row.batteryBrandCount} brands · {row.batterySizeCount} sizes</div></div>
    <div><span className="text-[10px] font-black uppercase tracking-wide text-slate-400 lg:hidden">Status</span><StatusBadge status={row.status} /></div>
    <div className="flex items-center gap-2 lg:justify-end"><button className="btn-secondary" onClick={onEdit}><FiEdit2 /> Edit Package</button><div className="relative"><button className="rounded-md border border-slate-200 p-2 text-slate-600 hover:bg-slate-50" onClick={() => setMenuOpen((open) => !open)} title="More actions"><FiMoreVertical /></button>{menuOpen ? <div className="absolute right-0 z-10 mt-2 w-48 rounded-lg border border-slate-200 bg-white p-1 text-sm shadow-lg"><button className="flex w-full items-center gap-2 rounded px-3 py-2 text-left hover:bg-slate-50" onClick={onPreview}><FiEye /> Preview Compatibility</button><button className="flex w-full items-center gap-2 rounded px-3 py-2 text-left hover:bg-slate-50" onClick={onDuplicate}><FiCopy /> Duplicate Package</button><button className="flex w-full items-center gap-2 rounded px-3 py-2 text-left hover:bg-slate-50" onClick={() => confirm(`Deactivate ${row.brand.name}?`) && onDeactivate()}><FiArchive /> Deactivate</button></div> : null}</div></div>
  </div>;
}

function PackageBrandCard({ row, onEdit, onPreview, onDuplicate, onDeactivate, onDelete }: { row: PackageBrandRow; onEdit: () => void; onPreview: () => void; onDuplicate: () => void; onDeactivate: () => void; onDelete: () => void }) {
  const packageImageUrl = getPackageImageUrl(row.brand.package_image_url);
  return <article className="grid gap-3 border-b border-slate-100 px-5 py-4 last:border-b-0 lg:grid-cols-[minmax(240px,1.4fr)_1fr_1.2fr_0.8fr_170px] lg:items-center lg:gap-4">
    <div className="flex min-w-0 items-center gap-3">
      <div className="flex h-24 w-28 shrink-0 items-center justify-center overflow-hidden rounded-xl border border-slate-100 bg-slate-50">
        {packageImageUrl ? <img src={packageImageUrl} alt={`${row.brand.name} package`} className="h-full w-full object-contain p-2" /> : <FiImage className="text-3xl text-slate-300" />}
      </div>
      <div className="min-w-0 flex-1">
        <div className="flex items-start justify-between gap-2">
          <div>
            <h2 className="truncate text-lg font-black text-ink">{row.brand.name} Package</h2>
          </div>
          <StatusBadge status={row.status} />
        </div>
        <div className="mt-4 grid grid-cols-2 gap-2 lg:mt-0 lg:block">
          <MiniStat label="Inverters" value={`${row.inverters.filter((item) => item.package_eligible !== false).length} options`} />
          <MiniStat label="Compatible Batteries" value={`${row.batteryBrandCount} brands · ${row.batterySizeCount} sizes`} />
        </div>
        {row.missingItems.length > 0 ? <p className="mt-3 text-xs font-semibold text-amber-700">Package setup incomplete · {row.missingItems[0]}</p> : null}
      </div>
    </div>
    <div className="flex flex-wrap items-center justify-end gap-2 lg:col-span-4 lg:col-start-5">
      <div className="flex gap-2">
        <button className="btn-secondary" onClick={onEdit}><FiEdit2 /> Edit Package</button>
        <button className="btn-secondary" onClick={onPreview}><FiEye /> Preview Compatibility</button>
      </div>
      <div className="flex items-center gap-1 text-slate-500">
        <details className="relative"><summary className="flex cursor-pointer list-none items-center gap-1 rounded-md border border-slate-200 px-2 py-2 text-xs font-bold text-slate-600"><FiMoreVertical /> More</summary><div className="absolute right-0 z-10 mt-2 w-44 rounded-lg border border-slate-200 bg-white p-1 text-sm shadow-lg"><button className="flex w-full items-center gap-2 rounded px-3 py-2 text-left hover:bg-slate-50" onClick={onDuplicate}><FiCopy /> Duplicate Package</button><button className="flex w-full items-center gap-2 rounded px-3 py-2 text-left hover:bg-slate-50" onClick={() => confirm(`Deactivate ${row.brand.name}?`) && onDeactivate()}><FiArchive /> Deactivate</button><button className="flex w-full items-center gap-2 rounded px-3 py-2 text-left text-red-600 hover:bg-red-50" onClick={() => confirm(`Delete ${row.brand.name}?`) && onDelete()}><FiTrash2 /> Delete</button></div></details>
      </div>
    </div>
  </article>;
}

function BrandConfigurationModal({ open, row, expectedPackageId, expectedBrandId, data, onClose }: { open: boolean; row: PackageBrandRow | null; expectedPackageId: string | null; expectedBrandId: string | null; data: ConfigurationData; onClose: () => void }) {
  const queryClient = useQueryClient();
  const [details, setDetails] = useState<BrandFormValues | null>(null);
  const [inverterOpen, setInverterOpen] = useState(false);
  const [batteryOpen, setBatteryOpen] = useState(false);
  const [editingInverter, setEditingInverter] = useState<Product | null>(null);
  const [advancedOpen, setAdvancedOpen] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [uploadError, setUploadError] = useState("");
  const [selectedImageFile, setSelectedImageFile] = useState<File | null>(null);
  const [selectedLogoFile, setSelectedLogoFile] = useState<File | null>(null);
  const [localPreviewUrl, setLocalPreviewUrl] = useState("");
  const [localLogoPreviewUrl, setLocalLogoPreviewUrl] = useState("");
  const [imageLoadFailed, setImageLoadFailed] = useState(false);
  const [logoLoadFailed, setLogoLoadFailed] = useState(false);
  const [feedback, setFeedback] = useState("");
  const [savedPackageImageUrl, setSavedPackageImageUrl] = useState("");
  const [savedPackageImageUpdatedAt, setSavedPackageImageUpdatedAt] = useState<string | null>(null);
  const currentTemplate = expectedPackageId ? row?.templates.find((template) => template.id === expectedPackageId) : row?.templates[0];
  const currentTemplateBrandId = packageTemplateBrandId(currentTemplate, data.productFamilies);
  const identityMismatch = Boolean(
    row &&
    ((expectedBrandId && row.brand.id !== expectedBrandId) ||
      (expectedPackageId && (!currentTemplate || currentTemplateBrandId !== row.brand.id)))
  );
  const identityError = "Package data mismatch detected. Please close and reopen this package.";

  useEffect(() => {
    if (localPreviewUrl) URL.revokeObjectURL(localPreviewUrl);
    if (localLogoPreviewUrl) URL.revokeObjectURL(localLogoPreviewUrl);
    setDetails(null);
    setSelectedImageFile(null);
    setSelectedLogoFile(null);
    setSavedPackageImageUrl(row?.brand.package_image_url ?? "");
    setSavedPackageImageUpdatedAt(row?.brand.updated_at ?? null);
    setLocalPreviewUrl("");
    setLocalLogoPreviewUrl("");
    setImageLoadFailed(false);
    setLogoLoadFailed(false);
    setUploadError("");
    setFeedback("");
    saveDetails.reset();
    publish.reset();
  }, [open, row?.brand.id, expectedPackageId, expectedBrandId]);

  useEffect(() => () => { if (localPreviewUrl) URL.revokeObjectURL(localPreviewUrl); }, [localPreviewUrl]);
  useEffect(() => () => { if (localLogoPreviewUrl) URL.revokeObjectURL(localLogoPreviewUrl); }, [localLogoPreviewUrl]);

  const values = details ?? (row ? {
    name: row.brand.name,
    slug: row.brand.slug?.length > 1 ? row.brand.slug : normalizeSlug(row.brand.name),
    aliases: (row.brand.aliases ?? []).join(", "),
    logoUrl: getBrandLogoUrl(row.brand.logo_url),
    packageImageUrl: savedPackageImageUrl || getPackageImageUrl(row.brand.package_image_url),
    active: row.brand.is_active,
    live: row.status === "Live",
    inverters: [],
    batteries: [],
  } : null);
  const missingItems = row ? row.missingItems.filter((item) => !(item === "Package image required" && Boolean(savedPackageImageUrl || values?.packageImageUrl))) : [];
  const invalidatePackageMediaQueries = async () => {
    await Promise.all([
      queryClient.invalidateQueries({ queryKey: ["package-configuration"] }),
      queryClient.invalidateQueries({ queryKey: ["package-configuration", row?.brand.id] }),
      queryClient.invalidateQueries({ queryKey: ["package-templates"] }),
      queryClient.invalidateQueries({ queryKey: ["brands"] }),
      queryClient.invalidateQueries({ queryKey: ["products"] }),
      queryClient.invalidateQueries({ queryKey: ["package-management"] }),
      queryClient.invalidateQueries({ queryKey: ["recommended-packages"] }),
    ]);
    await queryClient.refetchQueries({ queryKey: ["package-configuration"], type: "active" });
  };

  const savePackageMedia = async ({ live }: { live: boolean }) => {
    if (!row || !values) throw new Error("Package configuration is not loaded.");
    if (identityMismatch || (expectedBrandId && row.brand.id !== expectedBrandId)) {
      await queryClient.invalidateQueries({ queryKey: ["package-configuration"] });
      throw new Error(identityError);
    }
    if (expectedPackageId && (!currentTemplate || currentTemplateBrandId !== row.brand.id)) {
      await queryClient.invalidateQueries({ queryKey: ["package-configuration"] });
      throw new Error(identityError);
    }
    const previousPackageImageUrl = getPackageImageUrl(savedPackageImageUrl || row.brand.package_image_url);
    const desiredSlug = normalizeSlug(values.slug || row.brand.canonical_slug || row.brand.slug || values.name);
    let packageImageUrl = getPackageImageUrl(values.packageImageUrl);
    let officialLogoUrl = values.logoUrl;
    let uploadedPackageImageUrl = "";
    let uploadedLogoUrl = "";

    if (import.meta.env.DEV) console.debug("Package media save started", {
      targetBrandId: row.brand.id,
      targetPackageTemplateIds: row.templates.map((template) => template.id),
      canonicalSlug: desiredSlug,
      oldPackageImageUrl: previousPackageImageUrl,
      selectedPackageImageFile: selectedImageFile ? { name: selectedImageFile.name, type: selectedImageFile.type, size: selectedImageFile.size } : null,
      selectedLogoFile: selectedLogoFile ? { name: selectedLogoFile.name, type: selectedLogoFile.type, size: selectedLogoFile.size } : null
    });

    if (selectedImageFile) {
      uploadedPackageImageUrl = await uploadPublicFile(PACKAGE_IMAGE_BUCKET, selectedImageFile, desiredSlug);
      packageImageUrl = getPackageImageUrl(uploadedPackageImageUrl);
      if (!packageImageUrl) throw new Error("Package was not published because the new image could not be saved.");
    }
    if (selectedLogoFile) {
      uploadedLogoUrl = await uploadPublicFile(BRAND_LOGO_BUCKET, selectedLogoFile, desiredSlug);
      officialLogoUrl = getBrandLogoUrl(uploadedLogoUrl);
      if (!officialLogoUrl) throw new Error("Official brand logo could not be saved.");
    }

    if (live && !packageImageUrl) throw new Error("Package was not published because the new image could not be saved.");

    const now = new Date().toISOString();
    const aliases = values.aliases.split(",").map((alias) => alias.trim().toLowerCase()).filter(Boolean);
    const { data: slugOwner, error: slugLookupError } = await supabase.from("brands").select("id").eq("slug", desiredSlug).neq("id", row.brand.id).maybeSingle();
    if (slugLookupError) throw slugLookupError;
    if (slugOwner) {
      const { data: ownerProducts, error: ownerProductsError } = await supabase.from("products").select("category").eq("brand_id", slugOwner.id);
      if (ownerProductsError) throw ownerProductsError;
      if ((ownerProducts ?? []).every((product) => product.category !== "inverter")) {
        const { error } = await supabase.from("brands").update({ slug: `${desiredSlug}-battery`, canonical_slug: `${desiredSlug}battery`, updated_at: now }).eq("id", slugOwner.id);
        if (error) throw error;
      } else {
        throw new Error(`Brand slug ${desiredSlug} is already used by another inverter brand.`);
      }
    }

    const { data: updatedBrand, error: brandError } = await supabase.from("brands").update({
      name: values.name.trim(),
      slug: desiredSlug,
      canonical_slug: desiredSlug,
      aliases,
      logo_url: getBrandLogoUrl(officialLogoUrl) || null,
      package_image_url: packageImageUrl || null,
      package_generation_enabled: live ? true : values.live,
      is_active: values.active,
      updated_at: now,
    }).eq("id", row.brand.id).select("id, name, slug, canonical_slug, logo_url, package_image_url, updated_at").single();
    if (brandError) throw brandError;
    if (selectedImageFile && getPackageImageUrl(updatedBrand.package_image_url) !== packageImageUrl) {
      throw new Error("Package image update did not persist on the brand row.");
    }

    const currentTemplateFamily = currentTemplate
      ? data.productFamilies.find((family) => family.id === currentTemplate.primary_inverter_family_id && family.brand_id === row.brand.id)
      : null;
    const firstFamily = currentTemplateFamily ?? row.families[0] ?? await ensureFamily(row.brand, "LV", "inverter", null);
    let templateIds = row.templates
      .filter((template) => packageTemplateBrandId(template, data.productFamilies) === row.brand.id)
      .map((template) => template.id);
    if (expectedPackageId && !templateIds.includes(expectedPackageId)) templateIds = [expectedPackageId, ...templateIds];
    if (templateIds.length === 0) {
      const ensuredTemplate = await ensureBrandTemplate({ ...row.brand, package_image_url: packageImageUrl || null, logo_url: getBrandLogoUrl(officialLogoUrl) || null } as Brand, firstFamily, live);
      templateIds = ensuredTemplate?.id ? [ensuredTemplate.id] : [];
    }
    const { data: updatedTemplates, error: templatesError } = templateIds.length
      ? await supabase.from("package_templates").update({
          primary_inverter_family_id: firstFamily.id,
          package_image_url: packageImageUrl || null,
          status: live ? "live" : values.live ? "live" : "draft",
          is_active: true,
          updated_at: now,
        }).in("id", templateIds).select("id, package_image_url, updated_at")
      : { data: [], error: null };
    if (templatesError) throw templatesError;

    const persistedTemplates = (updatedTemplates ?? []) as Pick<PackageTemplate, "id" | "package_image_url" | "updated_at">[];
    if (templateIds.length > 0 && persistedTemplates.length === 0) throw new Error("Package image update did not persist on the package template.");
    if (selectedImageFile && persistedTemplates.some((template) => getPackageImageUrl(template.package_image_url) !== packageImageUrl)) {
      throw new Error("Package template returned a stale package image URL.");
    }

    const { data: refetchedBrand, error: refetchBrandError } = await supabase
      .from("brands")
      .select("id, name, slug, canonical_slug, package_image_url, updated_at")
      .eq("id", row.brand.id)
      .single();
    if (refetchBrandError) throw refetchBrandError;
    if (getPackageImageUrl(refetchedBrand.package_image_url) !== packageImageUrl) {
      throw new Error("Refetched brand still contains the previous package image.");
    }

    const { data: refetchedTemplates, error: refetchTemplatesError } = templateIds.length
      ? await supabase.from("package_templates").select("id, package_image_url, updated_at").in("id", templateIds)
      : { data: [], error: null };
    if (refetchTemplatesError) throw refetchTemplatesError;
    const refreshedTemplates = (refetchedTemplates ?? []) as Pick<PackageTemplate, "id" | "package_image_url" | "updated_at">[];
    if (selectedImageFile && refreshedTemplates.some((template) => getPackageImageUrl(template.package_image_url) !== packageImageUrl)) {
      throw new Error("Refetched package template still contains the previous package image.");
    }

    if (import.meta.env.DEV) console.debug("Package media save confirmed", {
      targetBrandId: row.brand.id,
      targetPackageTemplateIds: templateIds,
      canonicalSlug: desiredSlug,
      selectedFilename: selectedImageFile?.name ?? null,
      uploadedPackageImageUrl,
      uploadedLogoUrl,
      brandsUpdateResponse: updatedBrand,
      packageTemplatesUpdateResponse: persistedTemplates,
      refetchedPackageImageUrl: refetchedBrand.package_image_url,
      finalPreviewImageUri: appendImageVersion(refetchedBrand.package_image_url, refetchedBrand.updated_at),
    });

    if (selectedImageFile && previousPackageImageUrl && previousPackageImageUrl !== packageImageUrl) {
      try {
        await removePublicFile(PACKAGE_IMAGE_BUCKET, previousPackageImageUrl);
      } catch (reason) {
        if (import.meta.env.DEV) console.warn("Previous package image could not be removed after replacement", { previousPackageImageUrl, reason });
      }
    }

    return {
      packageImageUrl,
      packageImageUpdatedAt: refetchedBrand.updated_at ?? now,
      logoUrl: getBrandLogoUrl(updatedBrand.logo_url) || "",
    };
  };

  const saveDetails = useMutation({
    mutationFn: async () => {
      return savePackageMedia({ live: values?.live ?? false });
    },
    onSuccess: async (saved) => {
      setSelectedImageFile(null);
      setSelectedLogoFile(null);
      if (localPreviewUrl) {
        URL.revokeObjectURL(localPreviewUrl);
        setLocalPreviewUrl("");
      }
      if (saved?.packageImageUrl) setSavedPackageImageUrl(saved.packageImageUrl);
      if (saved?.packageImageUpdatedAt) setSavedPackageImageUpdatedAt(saved.packageImageUpdatedAt);
      if (saved?.logoUrl && values) setDetails({ ...values, logoUrl: saved.logoUrl });
      setImageLoadFailed(false);
      setFeedback(selectedImageFile ? "Package image updated successfully. Draft saved successfully." : "Draft saved successfully. Your package configuration has been saved but is not live yet.");
      await invalidatePackageMediaQueries();
    },
    onError: (reason) => { setFeedback(""); if (selectedImageFile || selectedLogoFile) setUploadError("Image upload failed. Your package was not saved."); else setUploadError(errorMessage(reason)); },
  });

  const publish = useMutation({
    mutationFn: async () => {
      if (!row || !values) throw new Error("Package configuration is not loaded.");
      if (missingItems.length > 0) throw new Error(`${row.brand.name} configuration is incomplete: ${missingItems.join(", ")}`);
      return savePackageMedia({ live: true });
    },
    onSuccess: async (saved) => {
      setSelectedImageFile(null);
      setSelectedLogoFile(null);
      if (localPreviewUrl) {
        URL.revokeObjectURL(localPreviewUrl);
        setLocalPreviewUrl("");
      }
      if (saved?.packageImageUrl) setSavedPackageImageUrl(saved.packageImageUrl);
      if (saved?.packageImageUpdatedAt) setSavedPackageImageUpdatedAt(saved.packageImageUpdatedAt);
      if (saved?.logoUrl && values) setDetails({ ...values, logoUrl: saved.logoUrl });
      setImageLoadFailed(false);
      setFeedback(`${selectedImageFile ? "Package image updated successfully. " : ""}Package published successfully. ${row?.brand.name ?? "Package"} Package is now live and available for package generation.`);
      await invalidatePackageMediaQueries();
    },
    onError: (reason) => { setFeedback(""); if (selectedImageFile) setUploadError("Package was not published because the new image could not be saved."); else if (selectedLogoFile) setUploadError("Image upload failed. Your package was not published."); else setUploadError(errorMessage(reason)); },
  });

  useEffect(() => {
    saveDetails.reset();
    publish.reset();
    setUploadError("");
    setFeedback("");
  }, [open, row?.brand.id]);
  const displayedImage = row && values ? localPreviewUrl || appendImageVersion(savedPackageImageUrl || values.packageImageUrl, savedPackageImageUpdatedAt) : "";
  const displayedLogo = values ? localLogoPreviewUrl || values.logoUrl : "";
  useEffect(() => {
    setImageLoadFailed(false);
    if (import.meta.env.DEV && row) console.debug("Package preview image URI changed", {
      targetBrandId: row.brand.id,
      brandName: row.brand.name,
      finalPreviewImageUri: displayedImage
    });
  }, [displayedImage, row?.brand.id, row?.brand.name]);
  useEffect(() => setLogoLoadFailed(false), [displayedLogo]);

  if (!row || !values) return null;
  const packageInverters = activePackageInverters(row.inverters).filter((product) => resolveVoltageArchitecture(product, row.families));
  const compatibilitySummaries = (["LV", "HV"] as const).map((voltage) => {
    const families = row.families.filter((family) =>
      family.category === "inverter" &&
      family.battery_required &&
      family.voltage_type === voltage &&
      packageInverters.some((product) => product.product_family_id === family.id)
    );
    if (families.length === 0) return null;
    const familyIds = new Set(families.map((family) => family.id));
    const mappings = data.familyCompatibility.filter((mapping) => familyIds.has(mapping.inverter_family_id) && mapping.is_active && mapping.status !== "incompatible");
    const brands = mappings
      .map((mapping) => data.productFamilies.find((item) => item.id === mapping.battery_family_id))
      .filter((item): item is ProductFamily => Boolean(item && item.voltage_type === voltage))
      .map((batteryFamily) => data.brands.find((brand) => brand.id === batteryFamily.brand_id)?.name)
      .filter((name): name is string => Boolean(name));
    return { voltage, families, brands: [...new Set(brands)] };
  }).filter((summary): summary is { voltage: "LV" | "HV"; families: ProductFamily[]; brands: string[] } => Boolean(summary));

  function selectImage(file?: File) {
    if (!file) return;
    if (!["image/png", "image/jpeg", "image/jpg", "image/webp"].includes(file.type)) { setUploadError("Please select a PNG, JPG or WebP image."); return; }
    if (file.size > 5 * 1024 * 1024) { setUploadError("Image size must be less than 5 MB."); return; }
    if (localPreviewUrl) URL.revokeObjectURL(localPreviewUrl);
    setSelectedImageFile(file);
    setLocalPreviewUrl(URL.createObjectURL(file));
    setSavedPackageImageUpdatedAt(null);
    setImageLoadFailed(false);
    setUploadError("");
    setFeedback("");
  }

  function selectLogo(file?: File) {
    if (!file) return;
    if (!["image/png", "image/jpeg", "image/jpg", "image/webp", "image/svg+xml"].includes(file.type)) { setUploadError("Please select a PNG, JPG, WebP or SVG logo."); return; }
    if (file.size > 2 * 1024 * 1024) { setUploadError("Logo size must be less than 2 MB."); return; }
    if (localLogoPreviewUrl) URL.revokeObjectURL(localLogoPreviewUrl);
    setSelectedLogoFile(file);
    setLocalLogoPreviewUrl(URL.createObjectURL(file));
    setLogoLoadFailed(false);
    setUploadError("");
    setFeedback("");
  }

  async function removeImage() {
    if (!row || !values || !confirm("Remove this package image?")) return;
    setUploadError("");
    try {
      if (identityMismatch) throw new Error(identityError);
      const oldUrl = savedPackageImageUrl || values.packageImageUrl;
      const now = new Date().toISOString();
      const { error } = await supabase.from("brands").update({ package_image_url: null, updated_at: now }).eq("id", row.brand.id);
      if (error) throw error;
      const firstFamily = row.families[0];
      if (firstFamily) await ensureBrandTemplate({ ...row.brand, package_image_url: null } as Brand, firstFamily, false);
      const templateIds = row.templates.map((template) => template.id);
      if (templateIds.length) {
        const { error: templatesError } = await supabase.from("package_templates").update({ package_image_url: null, updated_at: now }).in("id", templateIds);
        if (templatesError) throw templatesError;
      }
      await removePublicFile(PACKAGE_IMAGE_BUCKET, oldUrl);
      setSavedPackageImageUrl("");
      setSavedPackageImageUpdatedAt(now);
      setDetails({ ...values, packageImageUrl: "" });
      setSelectedImageFile(null);
      setImageLoadFailed(false);
      if (localPreviewUrl) URL.revokeObjectURL(localPreviewUrl);
      setLocalPreviewUrl("");
      await invalidatePackageMediaQueries();
    } catch (reason) {
      setUploadError(`Unable to remove package image: ${errorMessage(reason)}`);
    }
  }

  async function removeLogo() {
    if (!row || !values || !confirm("Remove this brand logo?")) return;
    setUploadError("");
    try {
      if (identityMismatch) throw new Error(identityError);
      const oldUrl = values.logoUrl;
      const { error } = await supabase.from("brands").update({ logo_url: null }).eq("id", row.brand.id);
      if (error) throw error;
      await removePublicFile(BRAND_LOGO_BUCKET, oldUrl);
      setDetails({ ...values, logoUrl: "" });
      setSelectedLogoFile(null);
      setLogoLoadFailed(false);
      if (localLogoPreviewUrl) URL.revokeObjectURL(localLogoPreviewUrl);
      setLocalLogoPreviewUrl("");
      await queryClient.invalidateQueries({ queryKey: ["package-configuration"] });
    } catch (reason) {
      setUploadError(`Unable to remove brand logo: ${errorMessage(reason)}`);
    }
  }

  async function removeCompatibilityVoltage(voltage: "LV" | "HV", families: ProductFamily[]) {
    if (!row) return;
    if (!confirm(`Remove all compatible battery brands for ${row.brand.name} ${displayVoltage(voltage)} inverters?`)) return;
    setFeedback("");
    setUploadError("");
    try {
      for (const family of families) {
        const { error } = await supabase.from("family_compatibility").delete().eq("inverter_family_id", family.id);
        if (error) throw error;
      }
      setFeedback(`Compatible battery brands removed for ${row.brand.name} ${displayVoltage(voltage)} inverters.`);
      await queryClient.invalidateQueries({ queryKey: ["package-configuration"] });
    } catch (reason) {
      setUploadError(`Unable to remove compatible battery brands: ${errorMessage(reason)}`);
    }
  }

  async function removeInverterFromPackage(product: Product) {
    if (!confirm("Remove inverter from package?")) return;
    setFeedback("");
    setUploadError("");
    try {
      const { error } = await supabase.from("products").update({ package_eligible: false }).eq("id", product.id);
      if (error) throw error;
      setFeedback(`${product.name} removed from package configuration.`);
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: ["package-configuration"] }),
        queryClient.invalidateQueries({ queryKey: ["products"] }),
      ]);
    } catch (reason) {
      setUploadError(`Unable to remove inverter from package: ${errorMessage(reason)}`);
    }
  }

  async function toggleInverterStatus(product: Product, updates: { is_active?: boolean; package_eligible?: boolean }) {
    setFeedback("");
    setUploadError("");
    try {
      const { error } = await supabase.from("products").update(updates).eq("id", product.id);
      if (error) throw error;
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: ["package-configuration"] }),
        queryClient.invalidateQueries({ queryKey: ["products"] }),
      ]);
    } catch (reason) {
      setUploadError(`Unable to update inverter status: ${errorMessage(reason)}`);
    }
  }

  return <Modal title={`${row.brand.name} Package Configuration`} open={open} onClose={onClose} size="lg">
    <div className="mb-5 flex flex-wrap justify-end gap-2">
      <button className="btn-secondary" onClick={() => { setFeedback(""); setUploadError(""); saveDetails.mutate(); }} disabled={identityMismatch || saveDetails.isPending || publish.isPending}>{saveDetails.isPending ? "Saving..." : <><FiSave /> Save Draft</>}</button>
      <button className="btn-primary" onClick={() => { setFeedback(""); setUploadError(""); publish.mutate(); }} disabled={identityMismatch || publish.isPending || saveDetails.isPending}>{publish.isPending ? "Publishing..." : <><FiCheckCircle /> Publish Package</>}</button>
    </div>

    {feedback ? <div className="mb-4 rounded-lg border border-emerald-200 bg-emerald-50 p-3 text-sm font-semibold text-emerald-700">✓ {feedback}</div> : null}
    {identityMismatch ? <div className="mb-4 rounded-lg border border-red-200 bg-red-50 p-3 text-sm font-semibold text-red-700">{identityError}</div> : null}
    {(saveDetails.error || publish.error || uploadError) ? <div className="mb-4 rounded-lg border border-red-200 bg-red-50 p-3 text-sm font-semibold text-red-700">{saveDetails.error?.message ?? publish.error?.message ?? uploadError}</div> : null}
    {missingItems.length > 0 ? <div className="mb-4 rounded-lg border border-amber-200 bg-amber-50 p-3 text-sm text-amber-900">
      <strong>{row.brand.name} configuration is incomplete:</strong>
      <ul className="mt-2 list-disc pl-5">{missingItems.map((item) => <li key={item}>{item}</li>)}</ul>
    </div> : null}
    {row.generationWarnings.length > 0 ? <div className="mb-4 rounded-lg border border-amber-200 bg-amber-50 p-3 text-sm text-amber-900">
      <strong>Package generation readiness warnings:</strong>
      <ul className="mt-2 list-disc pl-5">{row.generationWarnings.map((item) => <li key={item}>{item}</li>)}</ul>
    </div> : null}

    <section className="rounded-xl border border-slate-200 p-4">
      <h3 className="font-black text-ink">Package Image & Details</h3>
      <div className="mt-4 grid gap-4 md:grid-cols-[180px_minmax(0,1fr)]">
        <div className="flex h-36 items-center justify-center rounded-xl border border-slate-200 bg-slate-50">
          {displayedImage && !imageLoadFailed ? <img src={displayedImage} alt={`${row.brand.name} package`} onError={() => { setImageLoadFailed(true); if (import.meta.env.DEV) console.debug("Package image could not be loaded", displayedImage); }} className="h-full w-full object-contain p-3" /> : <div className="text-center text-slate-400"><FiImage className="mx-auto text-4xl text-slate-300" />{imageLoadFailed ? <span className="mt-2 block text-xs">Package image could not be loaded.</span> : null}</div>}
        </div>
        <div className="grid gap-3 md:grid-cols-2">
          <TextField label="Brand name" value={values.name} onChange={(name) => setDetails({ ...values, name })} />
          <TextField label="Brand slug" value={values.slug} onChange={(slug) => setDetails({ ...values, slug })} />
          <TextField label="Brand aliases" value={values.aliases} onChange={(aliases) => setDetails({ ...values, aliases })} />
          <label className="text-sm font-bold text-ink">Package Image<input className="field mt-2" type="file" accept="image/png,image/jpeg,image/jpg,image/webp" onChange={(event) => selectImage(event.target.files?.[0])} />{uploading || ((saveDetails.isPending || publish.isPending) && selectedImageFile) ? <span className="mt-1 block text-xs font-normal text-slate-500">Uploading image...</span> : selectedImageFile ? <span className="mt-1 block text-xs font-normal text-amber-700">Image ready to save</span> : null}<button type="button" className="mt-2 text-xs font-bold text-red-600" onClick={removeImage}>Remove Image</button></label>
          <div className="md:col-span-2 rounded-xl border border-slate-200 p-3">
            <div className="grid gap-3 md:grid-cols-[120px_minmax(0,1fr)]">
              <div className="flex h-20 items-center justify-center rounded-lg border border-slate-200 bg-white">
                {displayedLogo && !logoLoadFailed ? <img src={displayedLogo} alt={`${row.brand.name} logo`} onError={() => setLogoLoadFailed(true)} className="max-h-14 max-w-full object-contain p-2" /> : <div className="text-center text-xs font-bold text-slate-400">No logo</div>}
              </div>
              <label className="text-sm font-bold text-ink">Brand Logo
                <input className="field mt-2" type="file" accept="image/png,image/jpeg,image/jpg,image/webp,image/svg+xml" onChange={(event) => selectLogo(event.target.files?.[0])} />
                {selectedLogoFile ? <span className="mt-1 block text-xs font-normal text-amber-700">Logo ready to save</span> : displayedLogo ? <span className="mt-1 block text-xs font-normal text-emerald-700">Logo configured</span> : <span className="mt-1 block text-xs font-normal text-slate-500">Upload the official brand logo shown on mobile package cards.</span>}
                <button type="button" className="mt-2 text-xs font-bold text-red-600" onClick={removeLogo} disabled={!displayedLogo}>Remove Logo</button>
              </label>
            </div>
          </div>
          <div className="flex items-end gap-4">
            <label className="flex items-center gap-2 text-sm font-semibold"><input type="checkbox" checked={values.active} onChange={(event) => setDetails({ ...values, active: event.target.checked })} /> Active</label>
            <label className="flex items-center gap-2 text-sm font-semibold"><input type="checkbox" checked={values.live} onChange={(event) => setDetails({ ...values, live: event.target.checked })} /> Draft / Live</label>
          </div>
        </div>
      </div>
    </section>

    <section className="mt-5 rounded-xl border border-slate-200 p-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h3 className="font-black text-ink">Inverters</h3>
          <p className="mt-1 text-sm text-slate-500">Add the inverter products that may be used in {row.brand.name} packages.</p>
        </div>
        <button className="btn-primary" onClick={() => setInverterOpen(true)}><FiPlus /> Add Inverter</button>
      </div>
      <SimpleProductTable
        products={row.inverters}
        families={row.families}
        onEdit={setEditingInverter}
        onRemove={(product) => void removeInverterFromPackage(product)}
        onToggleActive={(product, active) => void toggleInverterStatus(product, { is_active: active })}
        onTogglePackageEligible={(product, packageEligible) => void toggleInverterStatus(product, { package_eligible: packageEligible })}
      />
    </section>

    <section className="mt-5 rounded-xl border border-slate-200 p-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h3 className="font-black text-ink">Compatible Batteries</h3>
          <p className="mt-1 text-sm text-slate-500">Define which battery brands are compatible with each {row.brand.name} inverter architecture.</p>
        </div>
        <button className="btn-primary" onClick={() => setBatteryOpen(true)} disabled={packageInverters.length === 0}><FiPlus /> Configure Brands</button>
      </div>
      {packageInverters.length === 0 ? <p className="mt-3 text-xs font-semibold text-amber-700">Add an LV or HV inverter before configuring compatible batteries.</p> : null}
      {compatibilitySummaries.length === 0 ? <EmptyState label="No inverter battery architecture configured yet." /> : <div className="mt-4 grid gap-2">
        {compatibilitySummaries.map((summary) => <div key={summary.voltage} className="flex items-center justify-between gap-3 rounded-lg border border-slate-200 p-3 text-sm">
          <div>
            <strong>{row.brand.name} {displayVoltage(summary.voltage)} Inverters</strong>
            <div className="mt-1 text-xs text-slate-500">Compatible brands: {summary.brands.length > 0 ? summary.brands.join(", ") : `No ${displayVoltage(summary.voltage)} battery brands selected`}</div>
            <div className={`mt-1 text-xs font-bold ${summary.brands.length > 0 ? "text-emerald-700" : "text-amber-700"}`}>Battery package generation: {summary.brands.length > 0 ? "Ready" : "Not available"}</div>
          </div>
          <div className="flex items-center gap-2">
            <button className="btn-secondary" onClick={() => setBatteryOpen(true)}>Edit</button>
            <button className="text-sm font-bold text-red-600" onClick={() => void removeCompatibilityVoltage(summary.voltage, summary.families)}>Remove</button>
          </div>
        </div>)}
      </div>}
    </section>

    <section className="mt-5 rounded-xl border border-slate-200 p-4">
      <button className="flex w-full items-center justify-between text-left font-black text-ink" onClick={() => setAdvancedOpen(!advancedOpen)}>
        Package Rules <span className="text-xs font-bold text-slate-500">{advancedOpen ? "Hide" : "Show"} advanced settings</span>
      </button>
      {advancedOpen ? <div className="mt-4 grid gap-3 text-sm text-slate-600 md:grid-cols-2">
        <Rule label="Recommended inverter" value="Nearest equal or higher" />
        <Rule label="Basic inverter minimum" value="90%" />
        <Rule label="Recommended battery" value="Nearest equal or higher compatible capacity" />
        <Rule label="Panels" value="All active eligible panels" />
        <Rule label="Tiers" value="Basic, Recommended and Better enabled" />
        <Rule label="Template" value="One dynamic package per valid brand" />
      </div> : null}
    </section>

    <InverterModal open={inverterOpen} row={row} data={data} onClose={() => setInverterOpen(false)} />
    <EditInverterModal open={Boolean(editingInverter)} product={editingInverter} row={row} onClose={() => setEditingInverter(null)} onSaved={(message) => setFeedback(message)} />
    <BatteryModal open={batteryOpen} row={row} data={data} onClose={() => setBatteryOpen(false)} onSaved={(message) => setFeedback(message)} />
  </Modal>;
}

function InverterModal({ open, row, data, onClose }: { open: boolean; row: PackageBrandRow; data: ConfigurationData; onClose: () => void }) {
  const queryClient = useQueryClient();
  const existingOptions = data.products.filter((product) => product.brand_id === row.brand.id && product.category === "inverter");
  const [values, setValues] = useState<InverterFormValues>({
    mode: "new",
    existingProductId: existingOptions[0]?.id ?? "",
    name: "",
    model: "",
    capacityKw: 5,
    voltageType: "LV",
    phase: "single",
    parallelSupported: false,
    maxParallelUnits: 1,
    price: 0,
    imageUrl: "",
    active: true,
    packageEligible: true,
  });
  const save = useMutation({
    mutationFn: async () => {
      const family = await ensureFamily(row.brand, values.voltageType, "inverter", values.phase);
      const group = familyGroup(family);
      if (values.mode === "existing") {
        if (!values.existingProductId) throw new Error("Select an inverter product.");
        const { error } = await supabase.from("products").update({
          product_family_id: family.id,
          voltage_class: values.voltageType,
          phase: values.phase,
          compatibility_groups: [group],
          package_eligible: true,
          is_active: true,
        }).eq("id", values.existingProductId);
        if (error) throw error;
      } else {
        const slug = `${normalizeSlug(row.brand.name)}-${normalizeSlug(values.name)}-${Date.now()}`;
        const { error } = await supabase.from("products").insert(mapInverterFormToProductPayload(row.brand.id, family, values, slug));
        if (error) throw error;
      }
      await ensureBrandTemplate(row.brand, family, false);
    },
    onSuccess: async () => {
      onClose();
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: ["package-configuration"] }),
        queryClient.invalidateQueries({ queryKey: ["products"] }),
        queryClient.invalidateQueries({ queryKey: ["brands"] }),
      ]);
    },
  });
  return <Modal title={`Add ${row.brand.name} Inverter`} open={open} onClose={onClose} size="lg">
    <div className="grid gap-4 md:grid-cols-2">
      <TextField label="Inverter name/model" value={values.name} onChange={(name) => setValues({ ...values, name })} />
      <TextField label="Model, optional" value={values.model} onChange={(model) => setValues({ ...values, model })} />
      <label className="text-sm font-bold text-ink">Select inverter size<select className="field mt-2" value={presetInverterSizes.includes(values.capacityKw) ? values.capacityKw : "custom"} onChange={(event) => event.target.value !== "custom" && setValues({ ...values, capacityKw: Number(event.target.value) })}>{presetInverterSizes.map((size) => <option key={size} value={size}>{size} kW</option>)}<option value="custom">Custom</option></select></label>
      <NumberField label="Custom numeric kW value" value={values.capacityKw} onChange={(capacityKw) => setValues({ ...values, capacityKw })} />
      <PhaseSelect value={values.phase} onChange={(phase) => setValues({ ...values, phase })} />
      <VoltageSelect label="Battery voltage type" value={values.voltageType} onChange={(voltageType) => setValues({ ...values, voltageType })} />
      <NumberField label="Price" value={values.price} onChange={(price) => setValues({ ...values, price })} />
      <label className="flex items-center gap-2 text-sm font-semibold"><input type="checkbox" checked={values.active} onChange={(event) => setValues({ ...values, active: event.target.checked })} /> Active</label>
      <label className="flex items-center gap-2 text-sm font-semibold"><input type="checkbox" checked={values.packageEligible} onChange={(event) => setValues({ ...values, packageEligible: event.target.checked })} /> Package eligible</label>
    </div>
    {save.error ? <ErrorBox message={errorMessage(save.error)} /> : null}
  <ModalActions onCancel={onClose} onSave={() => save.mutate()} saving={save.isPending} label="Save Inverter" />
  </Modal>;
}

function EditInverterModal({ open, product, row, onClose, onSaved }: { open: boolean; product: Product | null; row: PackageBrandRow; onClose: () => void; onSaved: (message: string) => void }) {
  const queryClient = useQueryClient();
  const [values, setValues] = useState<InverterEditValues>({
    name: "",
    model: "",
    capacityKw: 0,
    voltageType: "",
    phase: "single",
    parallelSupported: false,
    active: true,
    packageEligible: true,
  });

  useEffect(() => {
    if (!open || !product) return;
    setValues({
      name: product.name ?? "",
      model: product.model ?? "",
      capacityKw: product.capacity_kw ?? 0,
      voltageType: resolveVoltageArchitecture(product, row.families) ?? "",
      phase: product.phase ?? explicitPhase(product) ?? "single",
      parallelSupported: product.parallel_supported ?? false,
      active: product.is_active !== false,
      packageEligible: product.package_eligible !== false,
    });
    save.reset();
  }, [open, product?.id]);

  const validation = !values.name.trim()
    ? "Product name is required."
    : !Number.isFinite(Number(values.capacityKw)) || Number(values.capacityKw) <= 0
      ? "Capacity must be greater than 0."
      : values.voltageType !== "LV" && values.voltageType !== "HV"
        ? "Select LV or HV architecture."
        : "";

  const save = useMutation({
    mutationFn: async () => {
      if (!product) throw new Error("Select an inverter to edit.");
      if (validation) throw new Error(validation);
      const family = await ensureFamily(row.brand, values.voltageType as Exclude<VoltageClass, "NONE">, "inverter", values.phase);
      const group = familyGroup(family);
      const { error } = await supabase.from("products").update({
        name: values.name.trim(),
        model: values.model.trim() || null,
        capacity_kw: Number(values.capacityKw),
        voltage_class: values.voltageType,
        phase: values.phase,
        parallel_supported: values.parallelSupported,
        max_parallel_units: values.parallelSupported ? Math.max(product.max_parallel_units ?? 2, 2) : 1,
        compatibility_groups: [group],
        product_family_id: family.id,
        is_active: values.active,
        package_eligible: values.packageEligible,
        updated_at: new Date().toISOString(),
      }).eq("id", product.id);
      if (error) throw error;
      await ensureBrandTemplate(row.brand, family, false);
    },
    onSuccess: async () => {
      const name = values.name.trim();
      onClose();
      onSaved(`${name} updated successfully.`);
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: ["package-configuration"] }),
        queryClient.invalidateQueries({ queryKey: ["products"] }),
        queryClient.invalidateQueries({ queryKey: ["brands"] }),
      ]);
    },
  });

  if (!product) return null;

  return <Modal title="Edit Inverter" open={open} onClose={onClose} size="lg">
    <p className="mb-4 text-sm text-slate-500">Update inverter details used in package generation and compatibility logic.</p>
    <div className="grid gap-4 md:grid-cols-2">
      <TextField label="Product name" value={values.name} onChange={(name) => setValues({ ...values, name })} />
      <TextField label="Model" value={values.model} onChange={(model) => setValues({ ...values, model })} />
      <NumberField label="Capacity (kW)" value={values.capacityKw} onChange={(capacityKw) => setValues({ ...values, capacityKw })} />
      <label className="text-sm font-bold text-ink">LV/HV architecture<select className="field mt-2" value={values.voltageType} onChange={(event) => setValues({ ...values, voltageType: event.target.value as InverterEditValues["voltageType"] })}><option value="">Select architecture</option><option value="LV">LV</option><option value="HV">HV</option></select></label>
      <PhaseSelect value={values.phase} onChange={(phase) => setValues({ ...values, phase })} />
      <label className="text-sm font-bold text-ink">Parallel<select className="field mt-2" value={values.parallelSupported ? "yes" : "no"} onChange={(event) => setValues({ ...values, parallelSupported: event.target.value === "yes" })}><option value="no">No</option><option value="yes">Yes</option></select></label>
      <label className="flex items-center gap-2 text-sm font-semibold"><input type="checkbox" checked={values.active} onChange={(event) => setValues({ ...values, active: event.target.checked })} /> Active</label>
      <label className="flex items-center gap-2 text-sm font-semibold"><input type="checkbox" checked={values.packageEligible} onChange={(event) => setValues({ ...values, packageEligible: event.target.checked })} /> Package Eligible</label>
    </div>
    {(validation || save.error) ? <ErrorBox message={save.error ? errorMessage(save.error) : validation} /> : null}
    <ModalActions onCancel={onClose} onSave={() => save.mutate()} saving={save.isPending} label="Save Inverter" disabled={Boolean(validation)} />
  </Modal>;
}

function BatteryModal({ open, row, data, onClose, onSaved }: { open: boolean; row: PackageBrandRow; data: ConfigurationData; onClose: () => void; onSaved: (message: string) => void }) {
  const queryClient = useQueryClient();
  const packageInverters = activePackageInverters(row.inverters).filter((product) => product.product_family_id && resolveVoltageArchitecture(product, row.families));
  const architectureGroups = (["LV", "HV"] as const).map((voltage) => {
    const families = row.families.filter((family) =>
      family.category === "inverter" &&
      family.battery_required &&
      family.voltage_type === voltage &&
      packageInverters.some((product) => product.product_family_id === family.id)
    );
    return families.length > 0 ? { voltage, families } : null;
  }).filter((group): group is { voltage: "LV" | "HV"; families: ProductFamily[] } => Boolean(group));
  const batteryBrands = data.brands
    .filter((brand) => data.products.some((product) => isBatteryProduct(product) && product.brand_id === brand.id))
    .sort((left, right) => left.name.localeCompare(right.name));
  const [selections, setSelections] = useState<BatteryBrandSelections>({});
  const [searchText, setSearchText] = useState("");

  useEffect(() => {
    if (!open) return;
    const nextSelections: BatteryBrandSelections = {};
    architectureGroups.forEach((group) => {
      const familyIds = new Set(group.families.map((family) => family.id));
      const mappedBrandIds = data.familyCompatibility
        .filter((mapping) => familyIds.has(mapping.inverter_family_id) && mapping.is_active && mapping.status !== "incompatible")
        .map((mapping) => data.productFamilies.find((item) => item.id === mapping.battery_family_id))
        .filter((family): family is ProductFamily => Boolean(family && family.voltage_type === group.voltage))
        .map((family) => family.brand_id);
      nextSelections[group.voltage] = [...new Set(mappedBrandIds)];
    });
    setSelections(nextSelections);
    setSearchText("");
    save.reset();
  }, [open, row.brand.id]);

  const toggleBrand = (voltage: "LV" | "HV", brandId: string) => setSelections((current) => ({
    ...current,
    [voltage]: (current[voltage] ?? []).includes(brandId)
      ? (current[voltage] ?? []).filter((id) => id !== brandId)
      : [...(current[voltage] ?? []), brandId],
  }));

  const filteredBatteryBrands = batteryBrands.filter((brand) => normalizePackageText(brand.name).includes(normalizePackageText(searchText)));
  const matchingBatteryProductsFor = (brandId: string, voltage: "LV" | "HV") => data.products.filter((product) =>
    isBatteryProduct(product) &&
    product.brand_id === brandId &&
    product.is_active !== false &&
    resolveBatteryArchitecture(product, data.productFamilies) === voltage
  );
  const unknownArchitectureBatteryCountFor = (brandId: string) => data.products.filter((product) =>
    isBatteryProduct(product) &&
    product.brand_id === brandId &&
    product.is_active !== false &&
    !resolveBatteryArchitecture(product, data.productFamilies)
  ).length;

  const save = useMutation({
    mutationFn: async () => {
      if (architectureGroups.length === 0) throw new Error("Add an LV or HV inverter before configuring compatible battery brands.");
      for (const group of architectureGroups) {
        const selectedBrandIds = selections[group.voltage] ?? [];
        const selectedBrands = batteryBrands.filter((brand) => selectedBrandIds.includes(brand.id));
        const selectedFamilies: ProductFamily[] = [];
        for (const brand of selectedBrands) {
          selectedFamilies.push(await ensureFamily(brand, group.voltage, "battery", null));
        }
        const selectedFamilyIds = new Set(selectedFamilies.map((family) => family.id));
        const managedFamilies = data.productFamilies.filter((family) => family.category === "battery" && family.voltage_type === group.voltage && batteryBrands.some((brand) => brand.id === family.brand_id));
        for (const inverterFamily of group.families) {
          for (const batteryFamily of managedFamilies) {
            if (!selectedFamilyIds.has(batteryFamily.id)) {
              const { error } = await supabase.from("family_compatibility").delete().eq("inverter_family_id", inverterFamily.id).eq("battery_family_id", batteryFamily.id);
              if (error) throw error;
            }
          }
          for (const batteryFamily of selectedFamilies) {
            const { error } = await supabase.from("family_compatibility").upsert({
              inverter_family_id: inverterFamily.id,
              battery_family_id: batteryFamily.id,
              status: "compatible",
              is_active: true,
            }, { onConflict: "inverter_family_id,battery_family_id" });
            if (error) throw error;
          }
        }
      }
    },
    onSuccess: async () => {
      onClose();
      onSaved("Compatible battery brands saved successfully.");
      await queryClient.invalidateQueries({ queryKey: ["package-configuration"] });
    },
  });

  return <Modal title={`Select Compatible Battery Brands for ${row.brand.name}`} open={open} onClose={onClose} size="lg">
    {packageInverters.length === 0 ? <ErrorBox message="Add an LV or HV inverter before configuring compatible battery brands." /> : null}
    <div className="grid gap-4">
      <p className="text-sm text-slate-500">Select the battery brands that are compatible with {row.brand.name} inverters.</p>
      <label className="text-sm font-bold text-ink">Search battery brands<input className="field mt-2" value={searchText} onChange={(event) => setSearchText(event.target.value)} placeholder="Search Fox, Pylontech, Inverex..." /></label>
      {architectureGroups.map((group) => {
        return <section key={group.voltage} className="rounded-xl border border-slate-200 p-3">
          {architectureGroups.length > 1 ? <div className="mb-3 text-sm font-black text-ink">{row.brand.name} {displayVoltage(group.voltage)} Inverters</div> : null}
          <div className="grid gap-2 md:grid-cols-2">
            {filteredBatteryBrands.map((brand) => {
              const matchingProducts = matchingBatteryProductsFor(brand.id, group.voltage);
              const unknownArchitectureCount = unknownArchitectureBatteryCountFor(brand.id);
              return <label key={`${group.voltage}-${brand.id}`} className="flex items-start gap-2 rounded-lg border border-slate-200 p-2 text-sm font-semibold">
                <input type="checkbox" checked={(selections[group.voltage] ?? []).includes(brand.id)} onChange={() => toggleBrand(group.voltage, brand.id)} />
                <span>
                  {brand.name}
                  {matchingProducts.length > 0
                    ? <span className="mt-1 block text-xs font-normal text-emerald-700">{matchingProducts.length} {displayVoltage(group.voltage)} battery product{matchingProducts.length === 1 ? "" : "s"} available</span>
                    : <span className="mt-1 block text-xs font-normal text-amber-700">No active {displayVoltage(group.voltage)} battery products currently available for this brand.</span>}
                  {unknownArchitectureCount > 0 ? <span className="mt-1 block text-xs font-normal text-slate-500">{unknownArchitectureCount} active battery product{unknownArchitectureCount === 1 ? "" : "s"} need LV/HV architecture.</span> : null}
                </span>
              </label>;
            })}
            {filteredBatteryBrands.length === 0 ? <p className="text-sm text-slate-500">No battery brands match your search.</p> : null}
          </div>
        </section>;
      })}
    </div>
    {save.error ? <ErrorBox message={errorMessage(save.error)} /> : null}
    <ModalActions onCancel={onClose} onSave={() => save.mutate()} saving={save.isPending} label="Save Compatibility" disabled={architectureGroups.length === 0} />
  </Modal>;
}
function PreviewModal({ open, row, data, onClose }: { open: boolean; row: PackageBrandRow | null; data: ConfigurationData; onClose: () => void }) {
  const values: PreviewValues = { requiredSolarKw: 9, requiredInverterKw: 9, requiredBatteryKwh: 14.7, runningLoadKw: 5.5, backupHours: 3, phase: "single" };
  const brandProducts = row ? data.products
    .filter((product) => product.category === "solar_panel" || product.brand_id === row.brand.id || row.compatibleBatteryProducts.some((battery) => battery.id === product.id))
    .map((product) => mapEngineProduct(product, data, true))
    .filter((product): product is PackageEngineProduct => Boolean(product)) : [];
  const packages = row ? generateCatalogPackages({ ...values, compatibilityExceptions: data.exceptions, products: brandProducts }).filter((pkg) => pkg.primaryBrandId === row.brand.id) : [];
  const firstReason = row ? generateCatalogPackageDiagnostics({ ...values, compatibilityExceptions: data.exceptions, products: brandProducts }).find((diagnostic) => normalizePackageText(diagnostic.templateName) === normalizePackageText(row.brand.name))?.rejectionReason : "";
  if (!row) return null;
  const productById = new Map(data.products.map((product) => [product.id, product]));
  const pkg = packages[0];
  const inverter = pkg ? productById.get(pkg.inverter.productId) : null;
  const battery = pkg?.battery ? productById.get(pkg.battery.productId) : null;
  const panel = pkg ? productById.get(pkg.panel.productId) : null;
  const packageImageUrl = getPackageImageUrl(row.brand.package_image_url);

  return <Modal title={`Preview ${row.brand.name} Package`} open={open} onClose={onClose} size="lg">
    <div className="rounded-xl border border-slate-200 bg-slate-50 p-4 text-sm text-slate-600">
      This preview checks package configuration only. Customer solar, inverter, battery and backup sizing is calculated by the Mobile App.
    </div>
    {!pkg ? <div className="mt-5 rounded-xl border border-amber-200 bg-amber-50 p-4 text-sm font-semibold text-amber-900">{firstReason || "No valid package could be generated for this brand yet."}</div> : <article className="mt-5 overflow-hidden rounded-2xl border border-amber-200 bg-amber-50">
      <div className="grid gap-4 p-5 md:grid-cols-[180px_minmax(0,1fr)]">
        <div className="flex h-36 items-center justify-center rounded-xl bg-white">
          {packageImageUrl ? <img src={packageImageUrl} alt="" className="h-full w-full object-contain p-3" /> : <FiImage className="text-4xl text-slate-300" />}
        </div>
        <div>
          <div className="text-xs font-black uppercase text-amber-700">{pkg.packageType}</div>
          <h3 className="text-xl font-black text-ink">{row.brand.name} Package</h3>
          <div className="mt-4 grid gap-2 text-sm">
            <TemplateLine label="Selected inverter" value={`${inverter?.name ?? "Unknown"} · ${pkg.inverter.totalCapacityKw} kW`} />
            <TemplateLine label="Selected battery" value={pkg.battery ? `${battery?.name ?? "Unknown"} · ${pkg.battery.totalCapacityKwh} kWh` : "Not required"} />
            <TemplateLine label="Panels" value={`${pkg.panel.quantity} × ${panel?.name ?? `${pkg.panel.panelWattage}W`} · ${pkg.panel.totalCapacityKw} kW`} />
            <TemplateLine label="Estimated price" value={currency(pkg.totalPrice)} />
            <TemplateLine label="Reason" value={pkg.recommendationReason} />
          </div>
        </div>
      </div>
    </article>}
  </Modal>;
}

function BrandModal({ open, data, onClose, disabled, saving, error, onSave }: { open: boolean; data?: ConfigurationData; onClose: () => void; disabled: boolean; saving: boolean; error?: string; onSave: (values: BrandFormValues) => void }) {
  const [values, setValues] = useState<BrandFormValues>({ name: "", slug: "", aliases: "", logoUrl: "", packageImageUrl: "", active: true, live: false, inverters: [], batteries: [] });
  const [step, setStep] = useState(1);
  const [attempted, setAttempted] = useState(false);
  const [inverterSource, setInverterSource] = useState<"new" | "existing">("new");
  const existingInverters = (data?.products ?? []).filter((product) => product.category === "inverter" && (normalizePackageText(product.brands?.name) === normalizePackageText(values.name) || normalizePackageText(product.brands?.aliases?.join(" ")).includes(normalizePackageText(values.name))));
  const [inverterDraft, setInverterDraft] = useState<DraftInverterEntry>({ id: "", name: "", capacityKw: 5, phase: "single", voltageType: "LV", price: 0, active: true, packageEligible: true });
  const [batteryDraft, setBatteryDraft] = useState<DraftBatteryEntry>({ id: "", brand: "", model: "", capacityKwh: 5, voltageType: "LV", preferred: false, active: true, compatibleWith: "LV" });
  const [batteryDraftError, setBatteryDraftError] = useState("");
  const [uploading, setUploading] = useState(false);
  const [uploadError, setUploadError] = useState("");
  const [localPreviewUrl, setLocalPreviewUrl] = useState("");
  useEffect(() => () => { if (localPreviewUrl) URL.revokeObjectURL(localPreviewUrl); }, [localPreviewUrl]);
  const validation = !values.name.trim()
    ? "Package name and inverter brand are required."
    : values.live && !values.packageImageUrl.trim()
      ? "Package image is required before publishing."
      : "";
  const stepValidation = step === 2 && values.inverters.length === 0 ? "Add at least one inverter option before continuing." : step === 3 && values.inverters.some((item) => item.voltageType !== "NONE") && values.batteries.length === 0 ? "Add at least one compatible battery option, or use No Battery for every inverter." : "";
  async function uploadImage(file?: File) {
    if (!file) return;
    if (!["image/png", "image/jpeg", "image/jpg", "image/webp"].includes(file.type)) { setUploadError("Please select a PNG, JPG or WebP image."); return; }
    if (file.size > 5 * 1024 * 1024) { setUploadError("Image size must be less than 5 MB."); return; }
    if (localPreviewUrl) URL.revokeObjectURL(localPreviewUrl);
    setLocalPreviewUrl(URL.createObjectURL(file));
    setUploading(true);
    setUploadError("");
    try {
      const url = await uploadPublicFile(PACKAGE_IMAGE_BUCKET, file, normalizeSlug(values.name));
      setValues({ ...values, packageImageUrl: url });
    } catch (reason) {
      setUploadError(errorMessage(reason));
    } finally {
      setUploading(false);
    }
  }
  const addInverter = () => {
    if (!inverterDraft.name.trim() || inverterDraft.capacityKw <= 0) return;
    setValues({ ...values, inverters: [...values.inverters, { ...inverterDraft, id: `${Date.now()}-${values.inverters.length}` }] });
    setInverterDraft({ ...inverterDraft, id: "", name: "" });
  };
  const addBattery = () => {
    if (!batteryDraft.brand.trim()) { setBatteryDraftError("Select or enter a battery brand."); return; }
    if (batteryDraft.capacityKwh <= 0 || batteryDraft.capacityKwh > MAX_RESIDENTIAL_BATTERY_CAPACITY_KWH) {
      setBatteryDraftError(`Battery capacity must be greater than 0 and no more than ${MAX_RESIDENTIAL_BATTERY_CAPACITY_KWH} kWh.`);
      return;
    }
    setBatteryDraftError("");
    setValues({ ...values, batteries: [...values.batteries, { ...batteryDraft, id: `${Date.now()}-${values.batteries.length}` }] });
    setBatteryDraft({ ...batteryDraft, id: "", model: "", brand: "" });
  };
  return <Modal title="Add Package" open={open} onClose={onClose} size="lg">
    {disabled ? <ErrorBox message="Database package configuration is not available, so package brand writes are disabled." /> : null}
    <div className="mb-5 grid grid-cols-3 gap-2">{["Package Details", "Inverter Options", "Compatible Batteries"].map((label, index) => <button key={label} className={`rounded-lg px-3 py-2 text-left text-xs font-black ${step === index + 1 ? "bg-amber-100 text-amber-900" : "bg-slate-50 text-slate-500"}`} onClick={() => setStep(index + 1)}>Step {index + 1}<span className="ml-1 hidden sm:inline">· {label}</span></button>)}</div>
    {step === 1 ? <div className="grid gap-4 md:grid-cols-2">
      <TextField label="Package Name / Inverter Brand" value={values.name} onChange={(name) => setValues({ ...values, name, slug: values.slug || normalizeSlug(name.replace(/\s*package\s*$/i, "")) })} />
      <TextField label="Brand slug" value={values.slug} onChange={(slug) => setValues({ ...values, slug })} />
      <TextField label="Brand aliases, optional" value={values.aliases} onChange={(aliases) => setValues({ ...values, aliases })} />
      <div className="flex h-28 items-center justify-center rounded-lg border border-slate-200 bg-slate-50 md:col-span-1">{localPreviewUrl || values.packageImageUrl ? <img src={localPreviewUrl || values.packageImageUrl} alt="Package preview" className="h-full w-full object-contain p-2" /> : <FiImage className="text-3xl text-slate-300" />}</div>
      <label className="text-sm font-bold text-ink">Package Image<input className="field mt-2" type="file" accept="image/png,image/jpeg,image/jpg,image/webp" onChange={(event) => uploadImage(event.target.files?.[0])} />{uploading ? <span className="mt-1 block text-xs font-normal text-slate-500">Uploading...</span> : values.packageImageUrl ? <span className="mt-1 block text-xs font-normal text-emerald-600">Image uploaded</span> : null}</label>
      <TextField label="Brand logo URL, optional" value={values.logoUrl} onChange={(logoUrl) => setValues({ ...values, logoUrl })} />
      <div className="flex items-end gap-4">
        <label className="flex items-center gap-2 text-sm font-semibold"><input type="checkbox" checked={values.active} onChange={(event) => setValues({ ...values, active: event.target.checked })} /> Active</label>
        <label className="flex items-center gap-2 text-sm font-semibold"><input type="checkbox" checked={values.live} onChange={(event) => setValues({ ...values, live: event.target.checked })} /> Publish / Live</label>
      </div>
    </div> : null}
    {step === 2 ? <div><p className="mb-4 text-sm text-slate-500">Add the inverter models and sizes that may be used for this package brand.</p><div className="mb-3 flex gap-2"><button className={`btn-secondary ${inverterSource === "new" ? "border-amber-400 bg-amber-50" : ""}`} onClick={() => setInverterSource("new")}>Add New Inverter</button><button className={`btn-secondary ${inverterSource === "existing" ? "border-amber-400 bg-amber-50" : ""}`} onClick={() => setInverterSource("existing")} disabled={existingInverters.length === 0}>Select Existing Inverter</button></div>{inverterSource === "existing" ? <label className="mb-3 block text-sm font-bold text-ink">Existing inverter<select className="field mt-2" onChange={(event) => { const product = existingInverters.find((item) => item.id === event.target.value); if (!product) return; setInverterDraft({ id: product.id, name: product.name, capacityKw: product.capacity_kw ?? 0, phase: product.phase ?? "single", voltageType: product.voltage_class ?? "NONE", price: product.price ?? 0, active: product.is_active !== false, packageEligible: product.package_eligible !== false }); }}><option value="">Select a product</option>{existingInverters.map((product) => <option key={product.id} value={product.id}>{product.name} · {product.capacity_kw ?? "—"} kW</option>)}</select></label> : null}<div className="grid gap-3 rounded-xl border border-slate-200 p-4 md:grid-cols-3"><TextField label="Inverter name / model" value={inverterDraft.name} onChange={(name) => setInverterDraft({ ...inverterDraft, name })} /><label className="text-sm font-bold text-ink">Inverter size<select className="field mt-2" value={presetInverterSizes.includes(inverterDraft.capacityKw) ? inverterDraft.capacityKw : "custom"} onChange={(event) => event.target.value !== "custom" && setInverterDraft({ ...inverterDraft, capacityKw: Number(event.target.value) })}>{presetInverterSizes.map((size) => <option key={size} value={size}>{size} kW</option>)}<option value="custom">Custom</option></select></label><NumberField label="Custom size (kW)" value={inverterDraft.capacityKw} onChange={(capacityKw) => setInverterDraft({ ...inverterDraft, capacityKw })} /><PhaseSelect value={inverterDraft.phase} onChange={(phase) => setInverterDraft({ ...inverterDraft, phase })} /><VoltageSelect label="Battery voltage" value={inverterDraft.voltageType} onChange={(voltageType) => setInverterDraft({ ...inverterDraft, voltageType })} /><NumberField label="Price" value={inverterDraft.price} onChange={(price) => setInverterDraft({ ...inverterDraft, price })} /><label className="flex items-center gap-2 text-sm font-semibold"><input type="checkbox" checked={inverterDraft.active} onChange={(event) => setInverterDraft({ ...inverterDraft, active: event.target.checked })} /> Active</label><label className="flex items-center gap-2 text-sm font-semibold"><input type="checkbox" checked={inverterDraft.packageEligible} onChange={(event) => setInverterDraft({ ...inverterDraft, packageEligible: event.target.checked })} /> Package eligible</label><button className="btn-primary" onClick={addInverter}><FiPlus /> Add Inverter</button></div><div className="mt-4 grid gap-2">{values.inverters.map((item) => <div key={item.id} className="flex items-center justify-between rounded-lg border border-slate-200 px-3 py-2 text-sm"><span className="font-bold">{item.name} · {item.capacityKw} kW · {item.phase} · {displayVoltage(item.voltageType)}</span><button className="text-red-600" onClick={() => setValues({ ...values, inverters: values.inverters.filter((entry) => entry.id !== item.id) })}>Remove</button></div>)}</div></div> : null}
    {step === 3 ? <div><p className="mb-4 text-sm text-slate-500">Select the battery brands, models and sizes that can be used with this package’s inverters.</p><div className="mb-3 flex gap-2"><button className="btn-secondary" onClick={() => setBatteryDraft({ ...batteryDraft, brand: "" })}>+ Add New Battery Brand</button></div><div className="grid gap-3 rounded-xl border border-slate-200 p-4 md:grid-cols-3"><label className="text-sm font-bold text-ink">Existing battery brand<select className="field mt-2" value={batteryDraft.brand} onChange={(event) => setBatteryDraft({ ...batteryDraft, brand: event.target.value })}><option value="">Select or type a brand below</option>{(data?.brands ?? []).filter((brand) => brand.category === "battery").map((brand) => <option key={brand.id} value={brand.name}>{brand.name}</option>)}</select></label><TextField label="New / selected battery brand" value={batteryDraft.brand} onChange={(brand) => setBatteryDraft({ ...batteryDraft, brand })} /><TextField label="Battery product / model" value={batteryDraft.model} onChange={(model) => setBatteryDraft({ ...batteryDraft, model })} /><label className="text-sm font-bold text-ink">Battery size<select className="field mt-2" value={presetBatterySizes.includes(batteryDraft.capacityKwh) ? batteryDraft.capacityKwh : "custom"} onChange={(event) => event.target.value !== "custom" && setBatteryDraft({ ...batteryDraft, capacityKwh: Number(event.target.value) })}>{presetBatterySizes.map((size) => <option key={size} value={size}>{size} kWh</option>)}<option value="custom">Custom</option></select></label><NumberField label="Custom size (kWh)" value={batteryDraft.capacityKwh} onChange={(capacityKwh) => setBatteryDraft({ ...batteryDraft, capacityKwh })} /><VoltageSelect label="Battery voltage" value={batteryDraft.voltageType} onChange={(voltageType) => setBatteryDraft({ ...batteryDraft, voltageType: voltageType === "NONE" ? "LV" : voltageType, compatibleWith: voltageType === "NONE" ? "LV" : voltageType })} noBattery={false} /><label className="text-sm font-bold text-ink">Compatible with<select className="field mt-2" value={batteryDraft.compatibleWith} onChange={(event) => setBatteryDraft({ ...batteryDraft, compatibleWith: event.target.value as "LV" | "HV" })}><option value="LV">All LV inverters</option><option value="HV">All HV inverters</option></select></label><label className="flex items-center gap-2 text-sm font-semibold"><input type="checkbox" checked={batteryDraft.preferred} onChange={(event) => setBatteryDraft({ ...batteryDraft, preferred: event.target.checked })} /> Preferred</label><button className="btn-primary" onClick={addBattery}><FiPlus /> Add Compatible Battery</button></div><div className="mt-4 grid gap-2">{values.batteries.map((item) => <div key={item.id} className="flex items-center justify-between rounded-lg border border-slate-200 px-3 py-2 text-sm"><span className="font-bold">{item.brand} · {item.model || "Battery"} · {item.capacityKwh} kWh · {item.voltageType} · {item.preferred ? "Preferred" : "Standard"}</span><button className="text-red-600" onClick={() => setValues({ ...values, batteries: values.batteries.filter((entry) => entry.id !== item.id) })}>Remove</button></div>)}</div></div> : null}
    {(attempted && (validation || stepValidation) || error || uploadError || batteryDraftError) ? <ErrorBox message={validation || stepValidation || error || uploadError || batteryDraftError || ""} /> : null}
    <div className="mt-5 flex flex-wrap items-center justify-between gap-2"><button className="btn-secondary" onClick={onClose}>Cancel</button><div className="flex gap-2">{step > 1 ? <button className="btn-secondary" onClick={() => setStep(step - 1)}>Previous</button> : null}{step < 3 ? <button className="btn-primary" onClick={() => { setAttempted(true); if (!stepValidation && !(step === 1 && validation)) setStep(step + 1); }}>Continue</button> : <><button className="btn-secondary" onClick={() => onSave({ ...values, live: false })} disabled={disabled || saving || uploading}>Save Draft</button><button className="btn-primary" onClick={() => { setAttempted(true); if (!validation && !stepValidation) onSave({ ...values, live: true }); }} disabled={disabled || saving || uploading}>Publish Package</button></>}</div></div>
  </Modal>;
}

function MigrationBanner({ details }: { details: string[] }) {
  return <section className="mb-5 rounded-lg border border-amber-300 bg-amber-50 p-4 text-sm text-amber-900">
    <div className="flex gap-3"><FiAlertTriangle className="mt-0.5 shrink-0" /><div>
      <div className="font-black">Package Management is unavailable until the database package-generation migration exists.</div>
      <div className="mt-1 text-xs font-semibold">{details[0] ?? "Package configuration schema unavailable."}</div>
    </div></div>
  </section>;
}

function SimpleProductTable({
  products,
  families = [],
  onEdit,
  onRemove,
  onToggleActive,
  onTogglePackageEligible,
}: {
  products: Product[];
  families?: ProductFamily[];
  onEdit?: (product: Product) => void;
  onRemove?: (product: Product) => void;
  onToggleActive?: (product: Product, active: boolean) => void;
  onTogglePackageEligible?: (product: Product, packageEligible: boolean) => void;
}) {
  const uniqueProducts = uniqueInverterDisplayProducts(products, families);
  if (uniqueProducts.length === 0) return <EmptyState label="No inverter products added yet." />;
  return <div className="mt-4 overflow-x-auto">
    <table className="min-w-full text-left text-sm">
      <thead className="bg-slate-50 text-xs uppercase text-slate-500">
        <tr><th className="px-3 py-2">Inverter product</th><th className="px-3 py-2">Model</th><th className="px-3 py-2">Capacity</th><th className="px-3 py-2">Voltage</th><th className="px-3 py-2">Phase</th><th className="px-3 py-2">Parallel</th><th className="px-3 py-2">Active</th><th className="px-3 py-2">Package eligible</th><th className="px-3 py-2">Actions</th></tr>
      </thead>
      <tbody className="divide-y divide-slate-100">
        {uniqueProducts.map((product) => {
          const architecture = resolveVoltageArchitecture(product, families);
          return <tr key={product.id}>
          <td className="px-3 py-2 font-bold text-ink">
            {product.name}
            {!architecture ? <div className="mt-1 text-xs font-semibold text-amber-700">LV/HV architecture not configured</div> : null}
          </td>
          <td className="px-3 py-2 text-slate-600">{product.model ?? "—"}</td>
          <td className="px-3 py-2">{product.capacity_kw ?? "—"} kW</td>
          <td className="px-3 py-2">{architecture ?? "—"}</td>
          <td className="px-3 py-2 capitalize">{product.phase ?? explicitPhase(product) ?? "—"}</td>
          <td className="px-3 py-2">{product.parallel_supported ? `Yes · ${product.max_parallel_units ?? 1}` : "No"}</td>
          <td className="px-3 py-2"><label className="inline-flex items-center gap-1 text-xs font-bold"><input type="checkbox" checked={product.is_active !== false} onChange={(event) => onToggleActive?.(product, event.target.checked)} /> {product.is_active !== false ? "Yes" : "No"}</label></td>
          <td className="px-3 py-2"><label className="inline-flex items-center gap-1 text-xs font-bold"><input type="checkbox" checked={product.package_eligible !== false} onChange={(event) => onTogglePackageEligible?.(product, event.target.checked)} /> {product.package_eligible !== false ? "Yes" : "No"}</label></td>
          <td className="px-3 py-2">
            <div className="flex items-center gap-2">
              <button className="btn-secondary px-2 py-1 text-xs" onClick={() => onEdit?.(product)}>Edit</button>
              <button className="text-xs font-bold text-red-600" onClick={() => onRemove?.(product)}>Remove</button>
            </div>
          </td>
        </tr>;
        })}
      </tbody>
    </table>
  </div>;
}

function StatusBadge({ status }: { status: PackageBrandRow["status"] }) {
  const tone = status === "Live" ? "border-emerald-200 bg-emerald-50 text-emerald-700" : "border-amber-200 bg-amber-50 text-amber-700";
  return <span className={`inline-flex rounded-full border px-2.5 py-1 text-xs font-black ${tone}`}>{status}</span>;
}

function MiniStat({ label, value }: { label: string; value: string }) {
  return <div className="rounded-lg border border-slate-100 bg-slate-50 p-2"><div className="text-[11px] font-bold uppercase text-slate-400">{label}</div><div className="mt-1 text-sm font-black text-ink">{value}</div></div>;
}

function ChipList({ items, empty }: { items: string[]; empty: string }) {
  const unique = [...new Set(items.filter(Boolean))];
  if (unique.length === 0) return <p className="mt-3 text-xs font-semibold text-amber-700">{empty}</p>;
  return <div className="mt-3 flex flex-wrap gap-1.5">{unique.slice(0, 4).map((item) => <span key={item} className="rounded-full bg-slate-100 px-2.5 py-1 text-xs font-bold text-slate-700">{item}</span>)}{unique.length > 4 ? <span className="rounded-full bg-slate-900 px-2.5 py-1 text-xs font-bold text-white">+{unique.length - 4}</span> : null}</div>;
}

function TextField({ label, value, onChange }: { label: string; value: string; onChange: (value: string) => void }) {
  return <label className="text-sm font-bold text-ink">{label}<input className="field mt-2" value={value} onChange={(event) => onChange(event.target.value)} /></label>;
}

function NumberField({ label, value, onChange, max }: { label: string; value: number; onChange: (value: number) => void; max?: number }) {
  return <label className="text-sm font-bold text-ink">{label}<input className="field mt-2" type="number" min="0" max={max} step="0.1" value={value} onChange={(event) => onChange(Number(event.target.value))} /></label>;
}

function VoltageSelect({ label, value, onChange, noBattery = true }: { label: string; value: VoltageClass; onChange: (value: VoltageClass) => void; noBattery?: boolean }) {
  return <label className="text-sm font-bold text-ink">{label}<select className="field mt-2" value={value} onChange={(event) => onChange(event.target.value as VoltageClass)}><option value="LV">LV</option><option value="HV">HV</option>{noBattery ? <option value="NONE">No Battery</option> : null}</select></label>;
}

function PhaseSelect({ value, onChange }: { value: PackagePhase; onChange: (value: PackagePhase) => void }) {
  return <label className="text-sm font-bold text-ink">Phase<select className="field mt-2" value={value} onChange={(event) => onChange(event.target.value as PackagePhase)}><option value="single">Single phase</option><option value="three">Three phase</option></select></label>;
}

function Rule({ label, value }: { label: string; value: string }) {
  return <div className="rounded-lg bg-slate-50 p-3"><div className="text-xs font-black uppercase text-slate-400">{label}</div><div className="mt-1 font-bold text-ink">{value}</div></div>;
}

function TemplateLine({ label, value }: { label: string; value: string }) {
  return <div className="flex justify-between gap-4"><span className="font-semibold text-slate-600">{label}</span><span className="text-right font-black text-ink">{value}</span></div>;
}

function ErrorBox({ message }: { message: string }) {
  return <div className="mt-4 rounded-lg border border-red-200 bg-red-50 p-3 text-sm font-semibold text-red-700"><FiAlertTriangle className="mr-2 inline" />{message}</div>;
}

function ModalActions({ onCancel, onSave, saving, label, disabled }: { onCancel: () => void; onSave: () => void; saving: boolean; label: string; disabled?: boolean }) {
  return <div className="mt-5 flex justify-end gap-2"><button className="btn-secondary" onClick={onCancel}>Cancel</button><button className="btn-primary" disabled={saving || disabled} onClick={onSave}>{saving ? "Saving..." : label}</button></div>;
}
