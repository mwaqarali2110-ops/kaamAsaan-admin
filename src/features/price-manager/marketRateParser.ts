import type { BrandCategory, PriceUnit, ProductSubCategory, StockStatus } from "../../types/database";
import { displayBrandName } from "../../lib/brand";

export type ParsedMarketRate = {
  id: string;
  brand: string;
  productName: string;
  category: BrandCategory;
  subCategory: ProductSubCategory;
  capacityValue: number | null;
  capacityUnit: string | null;
  price: number | null;
  priceUnit: PriceUnit;
  stockStatus: StockStatus;
  etaNote: string | null;
  rawLine: string;
};

const brandHints = [
  "longi",
  "jinko",
  "ja",
  "trina",
  "canadian",
  "astro",
  "risen",
  "goodwe",
  "solis",
  "huawei",
  "growatt",
  "fox",
  "foxess",
  "pylontech",
  "dyness",
  "tesla",
  "itel",
  "kstar",
  "fronus",
  "sungrow",
  "deye",
  "inverex",
  "knox",
];

function titleCase(value: string) {
  return value
    .trim()
    .replace(/\s+/g, " ")
    .replace(/\b\w/g, (char) => char.toUpperCase());
}

function parsePrice(line: string) {
  const rateMatch = line.match(/(?:rs\.?|pkr)?\s*([\d,]+(?:\.\d+)?)\s*(?:\/|per\s*)\s*w(?:att)?\b/i);
  if (rateMatch) return { price: Number(rateMatch[1].replace(/,/g, "")), priceUnit: "per_watt" as const };

  const explicitPrice = line.match(/(?:rs\.?|pkr)\s*([\d,]+(?:\.\d+)?)/i);
  if (explicitPrice) return { price: Number(explicitPrice[1].replace(/,/g, "")), priceUnit: "total_price" as const };

  const numbers = [...line.matchAll(/\b(\d{3,}(?:,\d{3})*(?:\.\d+)?)\b/g)];
  const last = numbers[numbers.length - 1]?.[1];
  return { price: last ? Number(last.replace(/,/g, "")) : null, priceUnit: "total_price" as const };
}

function parseCapacity(line: string) {
  const kwh = line.match(/\b(\d+(?:\.\d+)?)\s*k\s*w\s*h\b|\b(\d+(?:\.\d+)?)\s*kwh\b/i);
  if (kwh) return { capacityValue: Number(kwh[1] ?? kwh[2]), capacityUnit: "kWh" };

  const watt = line.match(/\b(\d{3,4})\s*w(?:att|atts)?\b/i);
  if (watt) return { capacityValue: Number(watt[1]), capacityUnit: "W" };

  const kw = line.match(/\b(\d+(?:\.\d+)?)\s*k\s*w\b|\b(\d+(?:\.\d+)?)\s*kw\b/i);
  if (kw) return { capacityValue: Number(kw[1] ?? kw[2]), capacityUnit: "kW" };

  return { capacityValue: null, capacityUnit: null };
}

function parseStatus(line: string): { stockStatus: StockStatus; etaNote: string | null } {
  const lower = line.toLowerCase();
  const eta = line.match(/\beta[:\s-]*([^|,]+)/i);
  const note = eta?.[1]?.trim() || null;

  if (lower.includes("ready") || lower.includes("available") || lower.includes("stock")) return { stockStatus: "ready_stock", etaNote: note };
  if (lower.includes("in transit") || lower.includes("transit")) return { stockStatus: "in_transit", etaNote: note };
  if (lower.includes("booking")) return { stockStatus: "booking_open", etaNote: note };
  if (lower.includes("out of stock") || lower.includes("sold out")) return { stockStatus: "out_of_stock", etaNote: note };
  if (lower.includes("eta")) return { stockStatus: "eta", etaNote: note };
  if (lower.includes("on request") || lower.includes("ask")) return { stockStatus: "on_request", etaNote: note };
  return { stockStatus: "on_request", etaNote: note };
}

function parseBrand(line: string) {
  const lower = line.toLowerCase();
  const hint = brandHints.find((item) => lower.includes(item));
  if (hint) return displayBrandName(hint === "foxess" ? "fox" : hint);
  return titleCase(line.split(/\s+/).slice(0, 2).join(" "));
}

function inferCategory(line: string, capacityUnit: string | null): { category: BrandCategory; subCategory: ProductSubCategory } {
  const lower = line.toLowerCase();
  if (capacityUnit === "W" || lower.includes("panel") || lower.includes("module")) return { category: "solar_panel", subCategory: null };
  if (capacityUnit === "kWh" || lower.includes("battery") || lower.includes("lithium")) return { category: "battery", subCategory: "lithium_battery" };
  if (lower.includes("combo") || lower.includes("ess") || lower.includes("package")) return { category: "accessory", subCategory: lower.includes("ess") ? "ess" : "combo_deal" };
  if (lower.includes("on-grid") || lower.includes("ongrid") || lower.includes("on grid")) return { category: "inverter", subCategory: "on_grid_inverter" };
  if (lower.includes("hybrid") || lower.includes("inverter") || capacityUnit === "kW") return { category: "inverter", subCategory: "hybrid_inverter" };
  return { category: "accessory", subCategory: "accessory" };
}

export function parseMarketRateText(text: string): ParsedMarketRate[] {
  return text
    .split(/\r?\n/)
    .map((line) => line.replace(/^[\s\-*•]+/, "").trim())
    .filter(Boolean)
    .map((line, index) => {
      const capacity = parseCapacity(line);
      const price = parsePrice(line);
      const category = inferCategory(line, capacity.capacityUnit);
      const status = parseStatus(line);
      const brand = parseBrand(line);

      return {
        id: `${index}-${line.slice(0, 16)}`,
        brand,
        productName: titleCase(line.replace(/(?:rs\.?|pkr)\s*[\d,]+(?:\.\d+)?/gi, "").replace(/\s+/g, " ")),
        ...category,
        ...capacity,
        ...price,
        ...status,
        rawLine: line,
      };
    });
}
