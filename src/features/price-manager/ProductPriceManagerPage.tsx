import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { FiEdit2, FiEye, FiEyeOff, FiSearch, FiUploadCloud } from "react-icons/fi";
import { EmptyState, ErrorState, LoadingState } from "../../components/AsyncState";
import { Modal } from "../../components/Modal";
import { PageHeader } from "../../components/PageHeader";
import { brandMatches, displayBrandName, normalizeBrandName } from "../../lib/brand";
import { errorMessage, formatMoney } from "../../lib/utils";
import { supabase } from "../../lib/supabase";
import type { PriceUnit, Product, ProductCategory, ProductSubCategory, StockStatus } from "../../types/database";
import { parseMarketRateText, type ParsedMarketRate } from "./marketRateParser";

type DraftRow = {
  price: string;
  price_unit: PriceUnit;
  stock_status: StockStatus;
  eta_note: string;
  warranty: string;
  is_visible: boolean;
};

type Toast = { tone: "success" | "error"; message: string } | null;

const stockOptions: Array<{ value: StockStatus; label: string }> = [
  { value: "ready_stock", label: "Ready Stock" },
  { value: "eta", label: "ETA" },
  { value: "in_transit", label: "In Transit" },
  { value: "booking_open", label: "Booking Open" },
  { value: "out_of_stock", label: "Out of Stock" },
  { value: "on_request", label: "On Request" },
];

const categoryOptions: Array<{ value: string; label: string; category: ProductCategory; subCategory?: ProductSubCategory }> = [
  { value: "solar_panels", label: "Solar Panels", category: "solar_panel" },
  { value: "inverters", label: "Inverters", category: "inverter" },
  { value: "batteries", label: "Batteries", category: "battery" },
];

async function fetchProducts() {
  const { data, error } = await supabase
    .from("products")
    .select("*, brands:brands!products_brand_id_fkey(id, name)")
    .order("updated_at", { ascending: false });
  if (error) throw error;
  return data as Product[];
}

function normalizeStatus(status: StockStatus): StockStatus {
  if (status === "in_stock") return "ready_stock";
  if (status === "preorder") return "booking_open";
  return status;
}

function labelForStatus(status: StockStatus) {
  return stockOptions.find((item) => item.value === normalizeStatus(status))?.label ?? "On Request";
}

function statusBadgeClass(status: StockStatus) {
  switch (normalizeStatus(status)) {
    case "ready_stock": return "bg-emerald-50 text-emerald-700 ring-emerald-100";
    case "eta":
    case "in_transit": return "bg-amber-50 text-amber-700 ring-amber-100";
    case "booking_open": return "bg-blue-50 text-blue-700 ring-blue-100";
    case "out_of_stock": return "bg-red-50 text-red-700 ring-red-100";
    default: return "bg-slate-100 text-slate-600 ring-slate-200";
  }
}

function inferSubCategory(product: Product): ProductSubCategory {
  const lower = `${product.name} ${product.model ?? ""}`.toLowerCase();
  if (product.sub_category) return product.sub_category;
  if (product.category === "battery") return "lithium_battery";
  if (product.category === "inverter" && (lower.includes("on-grid") || lower.includes("on grid"))) return "on_grid_inverter";
  if (product.category === "inverter") return "hybrid_inverter";
  if (lower.includes("combo")) return "combo_deal";
  if (lower.includes("ess")) return "ess";
  return null;
}

function capacityValue(product: Product) {
  return product.capacity_value ?? product.capacity_watt ?? product.capacity_kw ?? product.battery_capacity_kwh ?? null;
}

function capacityUnit(product: Product) {
  if (product.capacity_unit) return product.capacity_unit;
  if (product.capacity_watt) return "W";
  if (product.capacity_kw) return "kW";
  if (product.battery_capacity_kwh) return "kWh";
  return "";
}

function capacityLabel(product: Product) {
  const value = capacityValue(product);
  const unit = capacityUnit(product);
  return value ? `${value} ${unit}` : "-";
}

function productPriceUnit(product: Product): PriceUnit {
  return product.price_unit ?? (product.category === "solar_panel" ? "per_watt" : "total_price");
}

function editablePrice(product: Product, draft?: DraftRow) {
  if (draft) return draft.price;
  if (productPriceUnit(product) === "per_watt") {
    const rate = product.rate_per_watt ?? (product.price && product.capacity_watt ? product.price / product.capacity_watt : null);
    return rate == null ? "" : String(Number(rate.toFixed(2)));
  }
  return product.price == null ? "" : String(product.price);
}

function warrantyLabel(product: Product) {
  return product.warranty ?? (product.warranty_years ? `${product.warranty_years} years` : "");
}

function rowFromProduct(product: Product): DraftRow {
  return {
    price: editablePrice(product),
    price_unit: productPriceUnit(product),
    stock_status: normalizeStatus(product.stock_status),
    eta_note: product.eta_note ?? "",
    warranty: warrantyLabel(product),
    is_visible: product.is_visible ?? product.is_active,
  };
}

function rowsEqual(product: Product, row: DraftRow) {
  const base = rowFromProduct(product);
  return base.price === row.price &&
    base.price_unit === row.price_unit &&
    base.stock_status === row.stock_status &&
    base.eta_note === row.eta_note &&
    base.warranty === row.warranty &&
    base.is_visible === row.is_visible;
}

function buildPayload(product: Product, row: DraftRow) {
  const price = row.price === "" ? null : Number(row.price);
  const isPanelRate = row.price_unit === "per_watt";
  const watts = product.capacity_watt ?? (capacityUnit(product) === "W" ? Number(capacityValue(product)) : null);
  const panelPrice = isPanelRate && price != null && watts ? price * watts : null;

  return {
    price: isPanelRate ? panelPrice : price,
    price_unit: row.price_unit,
    rate_per_watt: isPanelRate ? price : null,
    stock_status: row.stock_status,
    eta_note: row.eta_note || null,
    warranty: row.warranty || null,
    is_visible: row.is_visible,
    is_active: row.is_visible,
    updated_at: new Date().toISOString(),
  };
}

function matchParsedProduct(parsed: ParsedMarketRate, products: Product[]) {
  const parsedName = parsed.productName.toLowerCase();
  return products.find((product) => {
    const brandMatch = brandMatches(product.brands?.name, parsed.brand);
    const productText = `${product.name} ${product.model ?? ""}`.toLowerCase();
    const capacityMatch = parsed.capacityValue == null || Number(capacityValue(product)) === parsed.capacityValue;
    return Boolean(brandMatch && capacityMatch && (productText.includes(parsedName.slice(0, 12)) || parsedName.includes(product.name.toLowerCase().slice(0, 12))));
  });
}

export function ProductPriceManagerPage() {
  const queryClient = useQueryClient();
  const products = useQuery({ queryKey: ["products", "price-manager"], queryFn: fetchProducts });
  const [search, setSearch] = useState("");
  const [category, setCategory] = useState("all");
  const [brand, setBrand] = useState("all");
  const [status, setStatus] = useState<"all" | StockStatus>("all");
  const [drafts, setDrafts] = useState<Record<string, DraftRow>>({});
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [toast, setToast] = useState<Toast>(null);
  const [bulkStatus, setBulkStatus] = useState<StockStatus | "">("");
  const [bulkVisibility, setBulkVisibility] = useState<"show" | "hide" | "">("");
  const [bulkPercent, setBulkPercent] = useState("");
  const [bulkEta, setBulkEta] = useState("");
  const [importOpen, setImportOpen] = useState(false);
  const [importText, setImportText] = useState("");

  const allProducts = products.data ?? [];
  const brandOptions = useMemo(() => {
    const selectedCategory = categoryOptions.find((item) => item.value === category)?.category;
    const options = new Map<string, string>();
    allProducts
      .filter((product) => !selectedCategory || product.category === selectedCategory)
      .forEach((product) => {
        const label = displayBrandName(product.brands?.name);
        const value = normalizeBrandName(label);
        if (value) options.set(value, label);
      });
    return [...options.entries()]
      .map(([value, label]) => ({ value, label }))
      .sort((left, right) => left.label.localeCompare(right.label));
  }, [allProducts, category]);
  const filtered = useMemo(() => allProducts.filter((product) => {
    const option = categoryOptions.find((item) => item.value === category);
    const productSub = inferSubCategory(product);
    const haystack = `${product.name} ${product.model ?? ""} ${product.brands?.name ?? ""}`.toLowerCase();
    return (category === "all" || (option && product.category === option.category && (!option.subCategory || productSub === option.subCategory || (option.value === "combo_deals" && productSub === "ess")))) &&
      (brand === "all" || normalizeBrandName(displayBrandName(product.brands?.name)) === brand) &&
      (status === "all" || normalizeStatus(product.stock_status) === status) &&
      haystack.includes(search.toLowerCase());
  }), [allProducts, brand, category, search, status]);

  const changedRows = filtered.filter((product) => drafts[product.id] && !rowsEqual(product, drafts[product.id]));
  const parsedRows = useMemo(() => parseMarketRateText(importText), [importText]);

  const save = useMutation({
    mutationFn: async () => {
      const changed = allProducts.filter((product) => drafts[product.id] && !rowsEqual(product, drafts[product.id]));
      await Promise.all(changed.map(async (product) => {
        const { error } = await supabase.from("products").update(buildPayload(product, drafts[product.id])).eq("id", product.id);
        if (error) throw error;
      }));
      return changed.length;
    },
    onSuccess: async (count) => {
      setToast({ tone: "success", message: `${count} product${count === 1 ? "" : "s"} updated.` });
      setDrafts({});
      setSelected(new Set());
      await queryClient.invalidateQueries({ queryKey: ["products"] });
      await queryClient.invalidateQueries({ queryKey: ["products", "price-manager"] });
    },
    onError: (reason) => setToast({ tone: "error", message: errorMessage(reason) }),
  });

  function row(product: Product) {
    return drafts[product.id] ?? rowFromProduct(product);
  }

  function patchRow(id: string, patch: Partial<DraftRow>) {
    const product = allProducts.find((item) => item.id === id);
    if (!product) return;
    setDrafts((current) => ({ ...current, [id]: { ...(current[id] ?? rowFromProduct(product)), ...patch } }));
  }

  function toggleSelected(id: string) {
    setSelected((current) => {
      const next = new Set(current);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  function applyBulk() {
    const ids = [...selected];
    if (!ids.length) return setToast({ tone: "error", message: "Select products before applying a bulk update." });
    setDrafts((current) => {
      const next = { ...current };
      ids.forEach((id) => {
        const product = allProducts.find((item) => item.id === id);
        if (!product) return;
        const base = next[id] ?? rowFromProduct(product);
        const priceNumber = Number(base.price || 0);
        next[id] = {
          ...base,
          ...(bulkStatus ? { stock_status: bulkStatus } : {}),
          ...(bulkVisibility ? { is_visible: bulkVisibility === "show" } : {}),
          ...(bulkEta ? { eta_note: bulkEta } : {}),
          ...(bulkPercent ? { price: String(Number((priceNumber * (1 + Number(bulkPercent) / 100)).toFixed(2))) } : {}),
        };
      });
      return next;
    });
    setToast({ tone: "success", message: "Bulk update applied to draft rows. Review and save changes." });
  }

  function applyImportPreview() {
    const matched = parsedRows.map((parsed) => ({ parsed, product: matchParsedProduct(parsed, allProducts) })).filter((item) => item.product);
    setDrafts((current) => {
      const next = { ...current };
      matched.forEach(({ parsed, product }) => {
        if (!product) return;
        next[product.id] = {
          ...(next[product.id] ?? rowFromProduct(product)),
          price: parsed.price == null ? (next[product.id]?.price ?? rowFromProduct(product).price) : String(parsed.price),
          price_unit: parsed.priceUnit,
          stock_status: parsed.stockStatus,
          eta_note: parsed.etaNote ?? (next[product.id]?.eta_note ?? rowFromProduct(product).eta_note),
        };
      });
      return next;
    });
    setImportOpen(false);
    setToast({ tone: "success", message: `${matched.length} imported market rate${matched.length === 1 ? "" : "s"} applied as draft changes.` });
  }

  return (
    <>
      <PageHeader
        title="Product Price Manager"
        description="Fast daily market-rate updates for prices, stock, visibility, ETA notes, and warranty."
        action={<div className="flex flex-wrap gap-2"><button className="btn-secondary" onClick={() => setImportOpen(true)}><FiUploadCloud /> Import Market Rate List</button><button className="btn-primary" disabled={!Object.keys(drafts).length || save.isPending} onClick={() => save.mutate()}>{save.isPending ? "Saving..." : `Save Changes${changedRows.length ? ` (${changedRows.length})` : ""}`}</button></div>}
      />

      {toast && <div className={`mb-4 rounded-lg border px-4 py-3 text-sm font-semibold ${toast.tone === "success" ? "border-emerald-100 bg-emerald-50 text-emerald-700" : "border-red-100 bg-red-50 text-red-700"}`}>{toast.message}</div>}

      <section className="panel mb-4 p-3">
        <div className="grid gap-3 lg:grid-cols-[1.3fr_0.8fr_0.8fr_0.8fr_auto]">
          <label className="relative"><FiSearch className="absolute left-3 top-3 text-slate-400" /><input className="field pl-9" placeholder="Search product, model, or brand" value={search} onChange={(event) => setSearch(event.target.value)} /></label>
          <select className="field" value={category} onChange={(event) => { setCategory(event.target.value); setBrand("all"); }}><option value="all">All categories</option>{categoryOptions.map((item) => <option key={item.value} value={item.value}>{item.label}</option>)}</select>
          <select className="field" value={brand} onChange={(event) => setBrand(event.target.value)}><option value="all">All brands</option>{brandOptions.map((item) => <option key={item.value} value={item.value}>{item.label}</option>)}</select>
          <select className="field" value={status} onChange={(event) => setStatus(event.target.value as typeof status)}><option value="all">All stock statuses</option>{stockOptions.map((item) => <option key={item.value} value={item.value}>{item.label}</option>)}</select>
          <button className="btn-secondary whitespace-nowrap" onClick={() => setSelected(new Set(filtered.map((item) => item.id)))}>Select filtered</button>
        </div>
      </section>

      <section className="panel mb-4 p-3">
        <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-[1fr_1fr_1fr_1fr_auto]">
          <select className="field" value={bulkStatus} onChange={(event) => setBulkStatus(event.target.value as StockStatus | "")}><option value="">Bulk status</option>{stockOptions.map((item) => <option key={item.value} value={item.value}>{item.label}</option>)}</select>
          <select className="field" value={bulkVisibility} onChange={(event) => setBulkVisibility(event.target.value as typeof bulkVisibility)}><option value="">Bulk visibility</option><option value="show">Show products</option><option value="hide">Hide products</option></select>
          <input className="field" type="number" step="0.1" placeholder="% price change, e.g. 2 or -3" value={bulkPercent} onChange={(event) => setBulkPercent(event.target.value)} />
          <input className="field" placeholder="Bulk ETA note" value={bulkEta} onChange={(event) => setBulkEta(event.target.value)} />
          <button className="btn-primary whitespace-nowrap" onClick={applyBulk}>Bulk Update</button>
        </div>
        <p className="mt-2 text-xs font-semibold text-slate-500">{selected.size} selected. Bulk updates become drafts until you press Save Changes.</p>
      </section>

      <section className="panel overflow-hidden">
        {products.isLoading ? <LoadingState /> : products.error ? <ErrorState message={products.error.message} /> : filtered.length === 0 ? <EmptyState label="No products found." /> : (
          <div className="overflow-x-auto">
            <table className="min-w-[1320px] text-left text-sm">
              <thead className="bg-slate-50 text-xs uppercase text-slate-500">
                <tr>
                  <th className="px-3 py-3"><input type="checkbox" checked={filtered.length > 0 && filtered.every((item) => selected.has(item.id))} onChange={(event) => setSelected(event.target.checked ? new Set(filtered.map((item) => item.id)) : new Set())} /></th>
                  <th className="px-3 py-3">Product Name</th>
                  <th className="px-3 py-3">Brand</th>
                  <th className="px-3 py-3">Category</th>
                  <th className="px-3 py-3">Capacity / Watt / kW / kWh</th>
                  <th className="px-3 py-3">Current Price</th>
                  <th className="px-3 py-3">Price Unit</th>
                  <th className="px-3 py-3">Stock Status</th>
                  <th className="px-3 py-3">ETA Date / Note</th>
                  <th className="px-3 py-3">Warranty</th>
                  <th className="px-3 py-3">Visibility</th>
                  <th className="px-3 py-3 text-right">Edit</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {filtered.map((product) => {
                  const draft = row(product);
                  const changed = !rowsEqual(product, draft);
                  const watts = product.capacity_watt ?? (capacityUnit(product) === "W" ? Number(capacityValue(product)) : null);
                  const rate = draft.price === "" ? null : Number(draft.price);
                  const estimatedPanelPrice = product.category === "solar_panel" && draft.price_unit === "per_watt" && watts && rate != null ? watts * rate : null;
                  return (
                    <tr key={product.id} className={`${changed ? "bg-amber-50/70" : "hover:bg-slate-50/70"}`}>
                      <td className="px-3 py-3"><input type="checkbox" checked={selected.has(product.id)} onChange={() => toggleSelected(product.id)} /></td>
                      <td className="px-3 py-3"><div className="font-bold text-ink">{product.name}</div><div className="text-xs text-slate-500">{product.model || product.sku || "No model"}</div></td>
                      <td className="px-3 py-3 font-semibold">{displayBrandName(product.brands?.name)}</td>
                      <td className="px-3 py-3"><div className="capitalize">{product.category.replace(/_/g, " ")}</div><div className="text-xs text-slate-500">{inferSubCategory(product)?.replace(/_/g, " ") || "-"}</div></td>
                      <td className="px-3 py-3 font-semibold">{capacityLabel(product)}</td>
                      <td className="px-3 py-3">
                        <input className="field w-32 py-1.5 font-semibold" type="number" step="0.01" value={draft.price} onChange={(event) => patchRow(product.id, { price: event.target.value })} />
                        {estimatedPanelPrice != null ? <div className="mt-1 text-xs font-semibold text-slate-500">Panel: {formatMoney(estimatedPanelPrice, product.currency_code)}</div> : null}
                      </td>
                      <td className="px-3 py-3">
                        <select className="field w-36 py-1.5" value={draft.price_unit} onChange={(event) => patchRow(product.id, { price_unit: event.target.value as PriceUnit })}>
                          <option value="per_watt">Rate/Watt</option>
                          <option value="total_price">Total price</option>
                        </select>
                      </td>
                      <td className="px-3 py-3">
                        <select className={`field w-40 py-1.5 font-bold ${statusBadgeClass(draft.stock_status)}`} value={draft.stock_status} onChange={(event) => patchRow(product.id, { stock_status: event.target.value as StockStatus })}>{stockOptions.map((item) => <option key={item.value} value={item.value}>{item.label}</option>)}</select>
                        <span className={`mt-1 inline-flex rounded-full px-2 py-0.5 text-[11px] font-black ring-1 ${statusBadgeClass(draft.stock_status)}`}>{labelForStatus(draft.stock_status)}</span>
                      </td>
                      <td className="px-3 py-3"><input className="field w-44 py-1.5" placeholder="ETA date or note" value={draft.eta_note} onChange={(event) => patchRow(product.id, { eta_note: event.target.value })} /></td>
                      <td className="px-3 py-3"><input className="field w-32 py-1.5" placeholder="Warranty" value={draft.warranty} onChange={(event) => patchRow(product.id, { warranty: event.target.value })} /></td>
                      <td className="px-3 py-3"><button className={`inline-flex items-center gap-1 rounded-full px-3 py-1 text-xs font-black ${draft.is_visible ? "bg-emerald-50 text-emerald-700" : "bg-slate-100 text-slate-500"}`} onClick={() => patchRow(product.id, { is_visible: !draft.is_visible })}>{draft.is_visible ? <FiEye /> : <FiEyeOff />}{draft.is_visible ? "Visible" : "Hidden"}</button></td>
                      <td className="px-3 py-3 text-right"><Link className="btn-secondary px-3 py-2" to="/products" title="Open full product editor"><FiEdit2 /></Link></td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </section>

      <Modal title="Import Market Rate List" open={importOpen} onClose={() => setImportOpen(false)} size="lg">
        <div className="grid gap-4">
          <label className="text-sm font-bold text-ink">Paste WhatsApp-style market rate text<textarea className="field mt-2 min-h-44 font-mono text-xs" placeholder="Example: Longi 585W HiMO7 Rs 43.5/w ready stock" value={importText} onChange={(event) => setImportText(event.target.value)} /></label>
          <div className="rounded-lg border border-slate-200">
            <div className="border-b border-slate-100 bg-slate-50 px-3 py-2 text-xs font-black uppercase text-slate-500">Preview</div>
            {parsedRows.length === 0 ? <div className="p-4 text-sm text-slate-500">Paste market rates to preview parsed rows.</div> : (
              <div className="max-h-80 overflow-auto">
                <table className="min-w-full text-left text-xs">
                  <thead className="bg-white text-slate-500"><tr><th className="px-3 py-2">Brand</th><th className="px-3 py-2">Product</th><th className="px-3 py-2">Capacity</th><th className="px-3 py-2">Price</th><th className="px-3 py-2">Status</th><th className="px-3 py-2">Match</th></tr></thead>
                  <tbody className="divide-y divide-slate-100">{parsedRows.map((item) => {
                    const match = matchParsedProduct(item, allProducts);
                    return <tr key={item.id}><td className="px-3 py-2 font-bold">{item.brand}</td><td className="px-3 py-2">{item.productName}</td><td className="px-3 py-2">{item.capacityValue ? `${item.capacityValue} ${item.capacityUnit}` : "-"}</td><td className="px-3 py-2">{item.price ?? "-"} {item.priceUnit === "per_watt" ? "/W" : ""}</td><td className="px-3 py-2">{labelForStatus(item.stockStatus)}</td><td className="px-3 py-2">{match ? <span className="text-emerald-700">{match.name}</span> : <span className="text-red-600">No match</span>}</td></tr>;
                  })}</tbody>
                </table>
              </div>
            )}
          </div>
          <div className="flex justify-end gap-3 border-t border-slate-100 pt-4"><button className="btn-secondary" onClick={() => setImportOpen(false)}>Cancel</button><button className="btn-primary" disabled={!parsedRows.length} onClick={applyImportPreview}>Apply Preview to Drafts</button></div>
        </div>
      </Modal>
    </>
  );
}
