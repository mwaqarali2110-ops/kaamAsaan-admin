import type { SurveyBooking, SurveyPackageSnapshot } from "../../types/database";

type UnknownRecord = Record<string, unknown>;

const asObject = (value: unknown): UnknownRecord | null => {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  return value as UnknownRecord;
};

export const parseJsonObject = (value: unknown): UnknownRecord | null => {
  const direct = asObject(value);
  if (direct) return direct;
  if (typeof value !== "string" || !value.trim()) return null;
  try {
    return asObject(JSON.parse(value));
  } catch {
    return null;
  }
};

const valueAt = (source: UnknownRecord | null, ...keys: string[]) => {
  for (const key of keys) {
    const value = source?.[key];
    if (value !== undefined && value !== null) return value;
  }
  return null;
};

const textAt = (source: UnknownRecord | null, ...keys: string[]) => {
  const value = valueAt(source, ...keys);
  return typeof value === "string" && value.trim() ? value.trim() : "";
};

const numberAt = (source: UnknownRecord | null, ...keys: string[]) => {
  const value = Number(valueAt(source, ...keys));
  return Number.isFinite(value) && value >= 0 ? value : 0;
};

const nestedProduct = (source: UnknownRecord | null, directKey: string, matchKey: string) => {
  const direct = asObject(valueAt(source, directKey));
  if (direct) return asObject(valueAt(direct, "product")) ?? direct;
  const match = asObject(valueAt(source, matchKey));
  return asObject(valueAt(match, "product")) ?? match;
};

const productBrand = (product: UnknownRecord | null) => textAt(product, "brandName", "brand", "manufacturer");
const productModel = (product: UnknownRecord | null) => textAt(product, "model", "name");

const normalizePackage = (source: UnknownRecord | null): SurveyPackageSnapshot | null => {
  if (!source) return null;
  const panelSource = nestedProduct(source, "panel", "panelProduct") ?? nestedProduct(source, "selectedPanels", "panels");
  const inverterSource = nestedProduct(source, "inverter", "inverterProduct") ?? asObject(valueAt(source, "selectedInverter"));
  const batterySource = nestedProduct(source, "battery", "batteryProduct") ?? asObject(valueAt(source, "selectedBattery"));
  const panelQuantity = Math.round(
    numberAt(source, "panelQuantity", "requiredPanels", "panelsQuantity") || numberAt(panelSource, "quantity"),
  );
  const batteryQuantity = Math.round(numberAt(source, "batteryQuantity") || numberAt(batterySource, "quantity"));
  const systemSizeKw = numberAt(source, "systemSizeKw", "totalSolarKw", "actualPanelKw", "recommendedSolarKw");
  const packageName = textAt(source, "packageName", "title", "name");
  const packageBrand = textAt(source, "packageBrand", "brand") || productBrand(inverterSource);

  if (!packageName && !panelSource && !inverterSource && !batterySource && systemSizeKw === 0) return null;

  const panelWattage = numberAt(panelSource, "wattage", "panelWattage", "capacityWatt", "capacity_watt");
  const totalBatteryKwh = numberAt(source, "totalBatteryKwh", "totalBatteryCapacityKwh", "batteryKwh");
  const unitBatteryKwh = numberAt(source, "batteryUnitCapacityKwh", "batterySizeKwh") ||
    numberAt(batterySource, "unitCapacityKwh", "batteryCapacityKwh", "capacityKwh", "capacityValue");

  return {
    packageId: textAt(source, "packageId", "id") || null,
    packageName: packageName || "Selected Solar Package",
    packageBrand: packageBrand || "Brand unavailable",
    isCustomized: Boolean(valueAt(source, "isCustomized")),
    systemSizeKw,
    panel: panelSource || panelQuantity > 0 ? {
      productId: textAt(panelSource, "productId", "id") || null,
      brand: productBrand(panelSource) || textAt(source, "panelBrand") || "Brand unavailable",
      model: productModel(panelSource) || "Model unavailable",
      wattage: panelWattage,
      quantity: panelQuantity,
      totalCapacityKw: numberAt(source, "totalPanelCapacityKw", "totalCapacityKw") || numberAt(panelSource, "totalCapacityKw") || systemSizeKw,
    } : null,
    inverter: inverterSource ? {
      productId: textAt(inverterSource, "productId", "id") || null,
      brand: productBrand(inverterSource) || packageBrand || "Brand unavailable",
      model: productModel(inverterSource) || "Model unavailable",
      capacityKw: numberAt(source, "inverterSizeKw", "inverterKw") || numberAt(inverterSource, "capacityKw", "capacityValue"),
      quantity: Math.max(1, Math.round(numberAt(source, "inverterQuantity") || numberAt(inverterSource, "quantity") || 1)),
    } : null,
    battery: batterySource || batteryQuantity > 0 ? {
      productId: textAt(batterySource, "productId", "id") || null,
      brand: productBrand(batterySource) || textAt(source, "batteryBrand") || "Brand unavailable",
      model: productModel(batterySource) || "Model unavailable",
      unitCapacityKwh: unitBatteryKwh,
      quantity: batteryQuantity || (batterySource ? 1 : 0),
      totalCapacityKwh: totalBatteryKwh || numberAt(batterySource, "totalCapacityKwh") || unitBatteryKwh * (batteryQuantity || 1),
    } : null,
    grossTotal: numberAt(source, "grossTotal", "originalEstimatedAmount", "totalPrice"),
    discountAmount: numberAt(source, "discountAmount"),
    finalTotal: numberAt(source, "finalTotal", "finalEstimatedAmount", "totalPrice"),
    promoCode: textAt(source, "promoCode") || textAt(asObject(valueAt(source, "promo")), "code") || null,
  };
};

export const bookingMetadata = (booking: SurveyBooking) => parseJsonObject(booking.notes);

export const bookingServiceType = (booking: SurveyBooking) => {
  if (booking.service_type?.trim()) return booking.service_type.trim().toLowerCase();
  const metadata = bookingMetadata(booking);
  const structured = textAt(metadata, "serviceType").toLowerCase();
  if (structured) return structured;
  const context = textAt(metadata, "bookingContext").toLowerCase();
  if (context) return context;
  return booking.booking_type;
};

export const isSolarSurveyBooking = (booking: SurveyBooking) =>
  ["solar_package", "solar_survey", "design_system_survey"].includes(bookingServiceType(booking));

export const canonicalPackageSnapshot = (booking: SurveyBooking): SurveyPackageSnapshot | null => {
  const normalized = normalizePackage(parseJsonObject(booking.selected_package_snapshot));
  if (normalized) return normalized;

  const metadata = bookingMetadata(booking);
  const solarPackage = normalizePackage(asObject(valueAt(metadata, "solarPackage")));
  if (solarPackage) return solarPackage;

  const selectedPackage = normalizePackage(asObject(valueAt(metadata, "selectedRecommendedPackage")));
  if (selectedPackage) return selectedPackage;

  return normalizePackage(asObject(valueAt(metadata, "systemSummary")));
};

export const operationalNote = (booking: SurveyBooking) =>
  bookingMetadata(booking) ? null : booking.notes?.trim() || null;
