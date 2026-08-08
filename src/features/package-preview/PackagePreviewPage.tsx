import { useQuery } from "@tanstack/react-query";
import { useMemo, useState } from "react";
import { FiAlertTriangle, FiCheckCircle, FiPlay, FiZap } from "react-icons/fi";
import { EmptyState, ErrorState, LoadingState } from "../../components/AsyncState";
import { PageHeader } from "../../components/PageHeader";
import { evaluateBatteryCompatibility, generateCatalogPackages, type PackageCompatibilityException, type PackageEngineProduct, type PackagePhase } from "../../lib/packageEngine";
import { supabase } from "../../lib/supabase";
import { formatMoney } from "../../lib/utils";
import type { Product } from "../../types/database";

type PreviewData = {
  products: Product[];
  exceptions: PackageCompatibilityException[];
  packageSchemaAvailable: boolean;
};

async function fetchPreviewData(): Promise<PreviewData> {
  const [productsResult, brandSchemaResult, productSchemaResult, exceptionSchemaResult] = await Promise.all([
    supabase.from("products").select("*, brands:brands!products_brand_id_fkey(*)"),
    supabase.from("brands").select("package_generation_enabled, default_compatibility_group, package_image_url, priority").limit(1),
    supabase.from("products").select("package_eligible, compatibility_groups, voltage_class, capacity_kwh, panel_wattage, priority").limit(1),
    supabase.from("product_compatibility_exceptions").select("id").limit(1),
  ]);
  if (productsResult.error) throw productsResult.error;
  const products = productsResult.data as unknown as Product[];
  const schemaErrors = [brandSchemaResult.error, productSchemaResult.error, exceptionSchemaResult.error].filter(Boolean);
  const missingSchemaCodes = new Set(["42703", "42P01", "PGRST204", "PGRST205"]);
  const packageSchemaAvailable = schemaErrors.length === 0;
  if (!packageSchemaAvailable && !schemaErrors.every((error) => missingSchemaCodes.has(String(error?.code ?? "")))) {
    throw schemaErrors[0];
  }
  let exceptions: PackageCompatibilityException[];
  if (packageSchemaAvailable) {
    const result = await supabase.from("product_compatibility_exceptions").select("source_product_id, target_product_id, status, is_active");
    if (result.error) throw result.error;
    exceptions = (result.data ?? []).map((rule) => ({
      sourceProductId: rule.source_product_id,
      targetProductId: rule.target_product_id,
      status: rule.status,
      active: rule.is_active,
    })) as PackageCompatibilityException[];
  } else {
    const result = await supabase.from("product_compatibility").select("inverter_brand_id, compatible_battery_brand_id, is_active").eq("is_active", true);
    if (result.error) throw result.error;
    exceptions = (result.data ?? []).map((rule) => ({
      sourceBrandId: rule.inverter_brand_id,
      targetBrandId: rule.compatible_battery_brand_id,
      status: "compatible",
      active: rule.is_active,
    }));
  }
  return {
    products,
    packageSchemaAvailable,
    exceptions,
  };
}

const explicitVoltageClass = (product: Product) => {
  const text = [product.name, product.model].filter(Boolean).join(" ");
  if (/\b(?:high[\s-]*voltage|hv)\b/i.test(text)) return "HV" as const;
  if (/\b(?:low[\s-]*voltage|lv)\b/i.test(text)) return "LV" as const;
  return null;
};

const explicitPhase = (product: Product) => {
  const configured = product.specifications?.phase;
  if (typeof configured === "string") {
    if (/^(?:three[_\s-]*phase|3[_\s-]*phase)$/i.test(configured)) return "three" as const;
    if (/^(?:single[_\s-]*phase|1[_\s-]*phase)$/i.test(configured)) return "single" as const;
  }
  const text = [product.name, product.model].filter(Boolean).join(" ");
  if (/\b(?:three[\s-]*phase|3[\s-]*(?:phase|p))\b/i.test(text)) return "three" as const;
  if (/\b(?:single[\s-]*phase|1[\s-]*(?:phase|p))\b/i.test(text)) return "single" as const;
  return null;
};

const mapProduct = (product: Product, includeDrafts: boolean): PackageEngineProduct | null => {
  const category = product.category === "solar_panel" ? "panel" : product.category;
  if (category !== "panel" && category !== "inverter" && category !== "battery") return null;
  const brand = product.brands;
  return {
    id: product.id,
    category,
    brandId: product.brand_id,
    brandName: brand?.name ?? "Unknown brand",
    brandAliases: brand?.aliases ?? [],
    brandPriority: brand?.priority ?? 0,
    brandPackageGenerationEnabled: includeDrafts ? true : brand?.package_generation_enabled ?? false,
    brandPackageImageUrl: brand?.package_image_url,
    name: product.name,
    model: product.model,
    imageUrl: product.image_url,
    price: product.price,
    active: includeDrafts ? true : product.is_active,
    packageEligible: includeDrafts ? true : product.package_eligible ?? false,
    priority: product.priority ?? 0,
    available: product.stock_status !== "out_of_stock",
    stockStatus: product.stock_status,
    capacityKw: product.capacity_kw ?? undefined,
    capacityKwh: product.capacity_kwh ?? product.battery_capacity_kwh ?? undefined,
    usableCapacityKwh: product.usable_capacity_kwh,
    panelWattage: product.panel_wattage ?? product.capacity_watt ?? undefined,
    pricePerWatt: product.rate_per_watt,
    phase: product.phase ?? explicitPhase(product),
    voltageClass: product.voltage_class ?? explicitVoltageClass(product),
    compatibilityGroups: product.compatibility_groups?.length
      ? product.compatibility_groups
      : brand?.default_compatibility_group
        ? [brand.default_compatibility_group]
        : [],
    parallelSupported: product.parallel_supported ?? false,
    maxParallelUnits: product.max_parallel_units ?? 1,
    sameModelParallelOnly: product.same_model_parallel_only ?? true,
    maxParallelModules: product.max_parallel_modules,
    commercialMaxParallelModules: product.commercial_max_parallel_modules,
    sameBrandCompatibilityEnabled: product.same_brand_compatibility_enabled ?? true,
  };
};

const tierStyle = {
  basic: "border-sky-200 bg-sky-50 text-sky-800",
  recommended: "border-amber-300 bg-amber-50 text-amber-900",
  better: "border-violet-200 bg-violet-50 text-violet-800",
  alternative: "border-slate-200 bg-white text-slate-800",
} as const;

export function PackagePreviewPage() {
  const data = useQuery({ queryKey: ["package-preview-catalog"], queryFn: fetchPreviewData });
  const [requiredSolarKw, setRequiredSolarKw] = useState(9);
  const [runningLoadKw, setRunningLoadKw] = useState(5.5);
  const [requiredBatteryKwh, setRequiredBatteryKwh] = useState(14.7);
  const [backupHours, setBackupHours] = useState(3);
  const [phase, setPhase] = useState<PackagePhase>("single");
  const [includeDrafts, setIncludeDrafts] = useState(true);
  const [hasRun, setHasRun] = useState(false);

  const configurationStatuses = useMemo(() => {
    if (!data.data) return [];
    const products = data.data.products.map((product) => mapProduct(product, false)).filter((product): product is PackageEngineProduct => Boolean(product));
    const panels = products.filter((product) => product.category === "panel" && product.active !== false && product.packageEligible !== false && product.panelWattage && product.panelWattage > 0);
    const batteries = products.filter((product) => product.category === "battery" && product.active !== false && product.packageEligible !== false && (product.usableCapacityKwh ?? product.capacityKwh ?? 0) > 0);
    const inverterBrands = new Map<string, PackageEngineProduct[]>();
    products.filter((product) => product.category === "inverter").forEach((product) => inverterBrands.set(product.brandId, [...(inverterBrands.get(product.brandId) ?? []), product]));
    return [...inverterBrands.values()].map((brandInverters) => {
      const eligibleInverters = brandInverters.filter((product) => product.active !== false && product.packageEligible !== false && product.brandPackageGenerationEnabled !== false && (product.capacityKw ?? 0) > 0);
      const compatibleBatteries = batteries.filter((battery) => eligibleInverters.some((inverter) => evaluateBatteryCompatibility(inverter, battery, data.data!.exceptions).compatible));
      const missing = [
        eligibleInverters.length === 0 ? "No eligible inverter products" : null,
        compatibleBatteries.length === 0 ? "No voltage-matched compatible batteries" : null,
        panels.length === 0 ? "No eligible panels with valid wattage" : null,
        !eligibleInverters.some((product) => product.brandPackageImageUrl) ? "No package image configured" : null,
      ].filter((item): item is string => Boolean(item));
      return {
        id: brandInverters[0].brandId,
        name: `${brandInverters[0].brandName} package configuration`,
        inverterCount: eligibleInverters.length,
        batteryCount: compatibleBatteries.length,
        panelCount: panels.length,
        ready: missing.length === 0,
        missing,
      };
    }).sort((left, right) => Number(right.ready) - Number(left.ready) || left.name.localeCompare(right.name));
  }, [data.data]);

  const productsById = useMemo(() => new Map((data.data?.products ?? []).map((product) => [product.id, product])), [data.data]);
  const packages = useMemo(() => {
    if (!hasRun || !data.data) return [];
    const products = data.data.products.map((product) => mapProduct(product, includeDrafts)).filter((product): product is PackageEngineProduct => Boolean(product));
    return generateCatalogPackages({
      requiredSolarKw,
      requiredInverterKw: runningLoadKw,
      requiredBatteryKwh,
      runningLoadKw,
      backupHours,
      phase,
      products,
      compatibilityExceptions: data.data.exceptions,
    });
  }, [backupHours, data.data, hasRun, includeDrafts, phase, requiredBatteryKwh, requiredSolarKw, runningLoadKw]);

  return <>
    <PageHeader title="Test Package Generation" description="Preview the same sizing and compatibility engine used by the mobile app before publishing catalog changes." />
    {data.data && !data.data.packageSchemaAvailable ? <div className="mb-5 rounded-xl border border-amber-300 bg-amber-50 p-4 text-sm font-semibold text-amber-900"><FiAlertTriangle className="mr-2 inline" />Migration 009 is not applied. The live catalog has no database-driven package flags or product compatibility families yet.</div> : null}
    {configurationStatuses.length > 0 ? <section className="panel mb-5 p-5">
      <h2 className="text-base font-black text-ink">Package configuration status</h2>
      <p className="mt-1 text-sm text-slate-500">Readiness is calculated from the same active products, technical metadata, compatibility rules, and panel requirements used by mobile.</p>
      <div className="mt-4 grid gap-3 lg:grid-cols-2">
        {configurationStatuses.map((status) => <article key={status.id} className={`rounded-xl border p-4 ${status.ready ? "border-emerald-200 bg-emerald-50" : "border-amber-200 bg-amber-50"}`}>
          <div className="flex items-center justify-between gap-3"><h3 className="font-black text-ink">{status.name}</h3><span className={`rounded-full px-2.5 py-1 text-xs font-black ${status.ready ? "bg-emerald-600 text-white" : "bg-amber-500 text-white"}`}>{status.ready ? "Ready" : "Not Ready"}</span></div>
          <div className="mt-3 grid grid-cols-3 gap-2 text-center text-xs"><div><strong className="block text-base">{status.inverterCount}</strong>Inverters</div><div><strong className="block text-base">{status.batteryCount}</strong>Batteries</div><div><strong className="block text-base">{status.panelCount}</strong>Panels</div></div>
          {status.missing.length > 0 ? <ul className="mt-3 list-disc space-y-1 pl-5 text-xs font-semibold text-amber-900">{status.missing.map((item) => <li key={item}>{item}</li>)}</ul> : null}
        </article>)}
      </div>
    </section> : null}
    <section className="panel mb-5 p-5">
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-5">
        <NumberField label="Required solar (kW)" value={requiredSolarKw} onChange={setRequiredSolarKw} />
        <NumberField label="Running load (kW)" value={runningLoadKw} onChange={setRunningLoadKw} />
        <NumberField label="Battery size (kWh)" value={requiredBatteryKwh} onChange={setRequiredBatteryKwh} />
        <NumberField label="Backup hours" value={backupHours} onChange={setBackupHours} />
        <label className="text-sm font-bold text-ink">Phase<select className="field mt-2" value={phase} onChange={(event) => setPhase(event.target.value as PackagePhase)}><option value="single">Single phase</option><option value="three">Three phase</option></select></label>
      </div>
      <div className="mt-4 flex flex-col gap-3 border-t border-slate-100 pt-4 sm:flex-row sm:items-center sm:justify-between">
        <label className="flex items-center gap-2 text-sm font-semibold"><input type="checkbox" checked={includeDrafts} onChange={(event) => setIncludeDrafts(event.target.checked)} /> Include draft/inactive catalog items for testing</label>
        <button className="btn-primary" onClick={() => setHasRun(true)}><FiPlay /> Generate preview</button>
      </div>
    </section>

    {data.isLoading ? <LoadingState /> : data.error ? <ErrorState message={data.error.message} /> : !hasRun ? <div className="panel p-8 text-center text-sm text-slate-500"><FiZap className="mx-auto mb-2 text-2xl text-amber-500" />Enter requirements and generate a preview.</div> : packages.length === 0 ? <div className="panel"><EmptyState label="No valid package could be generated. Check product flags, capacities, voltage classes, and compatibility groups." /></div> : <div className="grid gap-4 xl:grid-cols-2">
      {packages.map((pkg) => {
        const inverter = productsById.get(pkg.inverter.productId);
        const battery = pkg.battery ? productsById.get(pkg.battery.productId) : null;
        const panel = productsById.get(pkg.panel.productId);
        return <article key={pkg.id} className={`rounded-xl border p-5 shadow-sm ${tierStyle[pkg.packageType]}`}>
          <div className="flex items-start justify-between gap-3"><div><div className="text-xs font-black uppercase tracking-wider">{pkg.packageType}</div><h2 className="mt-1 text-lg font-black">{pkg.primaryBrand} package</h2></div><div className="text-right text-sm font-black">{pkg.totalPrice == null ? "Price on request" : formatMoney(pkg.totalPrice, "PKR")}</div></div>
          <div className="mt-4 grid gap-2 rounded-lg bg-white/70 p-3 text-sm">
            <Component label="Inverter" value={`${pkg.inverter.quantity} × ${inverter?.name ?? "Unknown"} (${pkg.inverter.totalCapacityKw} kW)`} />
            <Component label="Battery" value={pkg.battery ? `${pkg.battery.quantity} × ${battery?.name ?? "Unknown"} (${pkg.battery.totalCapacityKwh} kWh)` : "Not included"} />
            <Component label="Panels" value={`${pkg.panel.quantity} × ${panel?.name ?? `${pkg.panel.panelWattage}W panel`} (${pkg.panel.totalCapacityKw} kW DC)`} />
            <Component label="Compatibility" value={pkg.compatibilityGroup ?? (battery ? "Same-brand or explicit exception" : "Not required")} />
          </div>
          <p className="mt-3 flex gap-2 text-sm font-semibold"><FiCheckCircle className="mt-0.5 shrink-0" />{pkg.recommendationReason}</p>
          {pkg.limitations.map((limitation) => <p key={limitation} className="mt-2 flex gap-2 text-xs"><FiAlertTriangle className="mt-0.5 shrink-0" />{limitation}</p>)}
          <div className="mt-3 text-[11px] opacity-70">Internal score: {pkg.score}</div>
        </article>;
      })}
    </div>}
  </>;
}

function NumberField({ label, value, onChange }: { label: string; value: number; onChange: (value: number) => void }) {
  return <label className="text-sm font-bold text-ink">{label}<input className="field mt-2" type="number" min="0" step="0.1" value={value} onChange={(event) => onChange(Number(event.target.value))} /></label>;
}

function Component({ label, value }: { label: string; value: string }) {
  return <div className="flex justify-between gap-4"><span className="font-semibold text-slate-500">{label}</span><span className="text-right font-bold">{value}</span></div>;
}
