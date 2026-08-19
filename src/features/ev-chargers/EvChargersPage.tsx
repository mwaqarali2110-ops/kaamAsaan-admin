import { useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { FiEdit2, FiEye, FiImage, FiPlus, FiSearch, FiTrash2 } from "react-icons/fi";
import { EmptyState, ErrorState, LoadingState } from "../../components/AsyncState";
import { Modal } from "../../components/Modal";
import { PageHeader } from "../../components/PageHeader";
import { StorageImage } from "../../components/StorageImage";
import { supabase } from "../../lib/supabase";
import { uploadPublicFile } from "../../lib/storage";
import { errorMessage, formatMoney, slugify } from "../../lib/utils";

const chargerTypeOptions = [["ac", "AC Charger"], ["dc", "DC Fast Charger"]] as const;
const connectorOptions = [
  ["type_1", "Type 1"], ["type_2", "Type 2"], ["ccs_2", "CCS2"],
  ["chademo", "CHAdeMO"], ["gb_t", "GB/T"], ["other", "Other"],
] as const;
// The existing products.phase column (added for inverters) is reused as-is:
// it only accepts 'single' | 'three' | null. DC chargers, or ACs where the
// phase genuinely doesn't apply, simply leave this null ("Not Applicable").
const phaseOptions = [["", "Not Applicable"], ["single", "Single Phase"], ["three", "Three Phase"]] as const;
const installationTypeOptions = [["", "—"], ["wallbox", "Wallbox"], ["pedestal", "Pedestal"], ["portable", "Portable"]] as const;
const cableConfigurationOptions = [["", "—"], ["tethered", "Tethered"], ["socket", "Socket"]] as const;
const stockOptions = [["in_stock", "In Stock"], ["out_of_stock", "Out of Stock"], ["on_request", "On Request"]] as const;

const chargerTypeLabel = (value?: string | null) => chargerTypeOptions.find(([key]) => key === value)?.[1] ?? "—";
const connectorLabel = (value?: string | null) => connectorOptions.find(([key]) => key === value)?.[1] ?? (value || "—");
const phaseLabel = (value?: string | null) => value === "single" ? "Single Phase" : value === "three" ? "Three Phase" : "Not Applicable";
const stockLabel = (value?: string | null) => stockOptions.find(([key]) => key === value)?.[1] ?? "On Request";
const ACCEPTED_TYPES = new Set(["image/png", "image/jpeg", "image/webp"]);
const MAX_IMAGE_BYTES = 8 * 1024 * 1024;

type EvChargerSpecifications = {
  installation_type?: string;
  cable_configuration?: string;
  cable_length_m?: number;
  ip_rating?: string;
  connectivity?: string;
};

type EvCharger = {
  id: string; brand_id: string; name: string; slug: string; sku: string | null;
  charger_type: string | null; charger_power_kw: number | null; connector_type: string | null; phase: string | null;
  short_spec: string | null; secondary_spec: string | null; description: string | null; price: number | null;
  compare_at_price: number | null; currency_code: string; stock_status: string; stock_quantity: number | null;
  image_url: string | null; gallery_images: string[] | null; specifications: EvChargerSpecifications | null;
  warranty_years: number | null; is_featured: boolean; is_active: boolean; priority: number; updated_at: string;
  brands?: { id: string; name: string } | null;
};

type FormState = Omit<EvCharger, "id" | "updated_at" | "brands" | "gallery_images" | "specifications"> & {
  gallery_images: string[];
  installation_type: string;
  cable_configuration: string;
  cable_length_m: string;
  ip_rating: string;
  connectivity: string;
};

const emptyForm: FormState = {
  brand_id: "", name: "", slug: "", sku: "",
  charger_type: "ac", charger_power_kw: null, connector_type: "type_2", phase: "",
  short_spec: "", secondary_spec: "", description: "", price: 0, compare_at_price: null,
  currency_code: "PKR", stock_status: "in_stock", stock_quantity: null, image_url: "", gallery_images: [],
  warranty_years: null, installation_type: "", cable_configuration: "", cable_length_m: "", ip_rating: "", connectivity: "",
  is_featured: false, is_active: true, priority: 0,
};

const validateImage = (file: File) => {
  if (!ACCEPTED_TYPES.has(file.type)) throw new Error("Use a PNG, JPG/JPEG, or WEBP image.");
  if (file.size > MAX_IMAGE_BYTES) throw new Error("Each image must be 8 MB or smaller.");
};

const toForm = (item: EvCharger): FormState => ({
  brand_id: item.brand_id, name: item.name, slug: item.slug, sku: item.sku ?? "",
  charger_type: item.charger_type ?? "ac", charger_power_kw: item.charger_power_kw, connector_type: item.connector_type ?? "type_2",
  phase: item.phase ?? "", short_spec: item.short_spec ?? "", secondary_spec: item.secondary_spec ?? "",
  description: item.description ?? "", price: item.price ?? 0, compare_at_price: item.compare_at_price,
  currency_code: item.currency_code || "PKR", stock_status: item.stock_status, stock_quantity: item.stock_quantity,
  image_url: item.image_url ?? "", gallery_images: item.gallery_images ?? [],
  warranty_years: item.warranty_years,
  installation_type: item.specifications?.installation_type ?? "",
  cable_configuration: item.specifications?.cable_configuration ?? "",
  cable_length_m: item.specifications?.cable_length_m != null ? String(item.specifications.cable_length_m) : "",
  ip_rating: item.specifications?.ip_rating ?? "",
  connectivity: item.specifications?.connectivity ?? "",
  is_featured: item.is_featured, is_active: item.is_active, priority: item.priority ?? 0,
});

export function EvChargersPage() {
  const queryClient = useQueryClient();
  const [search, setSearch] = useState("");
  const [chargerTypeFilter, setChargerTypeFilter] = useState("all");
  const [powerFilter, setPowerFilter] = useState("all");
  const [connectorFilter, setConnectorFilter] = useState("all");
  const [stock, setStock] = useState("all");
  const [activity, setActivity] = useState("all");
  const [editing, setEditing] = useState<EvCharger | null>(null);
  const [viewing, setViewing] = useState<EvCharger | null>(null);
  const [formOpen, setFormOpen] = useState(false);
  const [form, setForm] = useState<FormState>(emptyForm);
  const [mainFile, setMainFile] = useState<File | null>(null);
  const [galleryFiles, setGalleryFiles] = useState<File[]>([]);
  const [formError, setFormError] = useState("");

  const evChargers = useQuery({ queryKey: ["ev-chargers"], queryFn: async () => {
    const { data, error } = await supabase.from("products").select("*, brands:brands(id,name)").eq("category", "ev_charger").order("is_featured", { ascending: false }).order("priority").order("updated_at", { ascending: false });
    if (error) throw error;
    return (data ?? []) as EvCharger[];
  }});
  const brands = useQuery({ queryKey: ["brands", "ev-chargers"], queryFn: async () => {
    const { data, error } = await supabase.from("brands").select("id,name,is_active").eq("is_active", true).order("name");
    if (error) throw error;
    return data ?? [];
  }});

  const powerFilterOptions = useMemo(() => [...new Set((evChargers.data ?? []).map((item) => item.charger_power_kw).filter((value): value is number => value != null))].sort((a, b) => a - b), [evChargers.data]);
  const connectorFilterOptions = useMemo(() => [...new Set((evChargers.data ?? []).map((item) => item.connector_type).filter((value): value is string => Boolean(value)))], [evChargers.data]);

  const filtered = useMemo(() => (evChargers.data ?? []).filter((item) => {
    const text = `${item.name} ${item.brands?.name ?? ""} ${item.sku ?? ""}`.toLowerCase();
    return text.includes(search.trim().toLowerCase())
      && (chargerTypeFilter === "all" || item.charger_type === chargerTypeFilter)
      && (powerFilter === "all" || Number(item.charger_power_kw) === Number(powerFilter))
      && (connectorFilter === "all" || item.connector_type === connectorFilter)
      && (stock === "all" || item.stock_status === stock)
      && (activity === "all" || item.is_active === (activity === "active"));
  }), [activity, chargerTypeFilter, connectorFilter, evChargers.data, powerFilter, search, stock]);

  const save = useMutation({ mutationFn: async () => {
    setFormError("");
    if (!form.name.trim() || !form.brand_id) throw new Error("Product name and brand are required.");
    if (!form.charger_type) throw new Error("Charger type is required.");
    if (!Number.isFinite(Number(form.charger_power_kw)) || Number(form.charger_power_kw) <= 0) throw new Error("Rated power (kW) must be greater than zero.");
    if (!form.connector_type) throw new Error("Connector type is required.");
    if (!Number.isFinite(Number(form.price)) || Number(form.price) < 0) throw new Error("Price must be zero or greater.");
    const slug = slugify(form.slug || form.name);
    if (!slug) throw new Error("A valid slug is required.");
    let imageUrl = form.image_url;
    if (mainFile) imageUrl = await uploadPublicFile("product-images", mainFile, `ev-chargers/${slug}`);
    if (form.is_active && !imageUrl) throw new Error("A product image is required before publishing.");
    const uploadedGallery = await Promise.all(galleryFiles.map((file) => uploadPublicFile("product-images", file, `ev-chargers/${slug}/gallery`)));
    const specifications: EvChargerSpecifications = {};
    if (form.installation_type) specifications.installation_type = form.installation_type;
    if (form.cable_configuration) specifications.cable_configuration = form.cable_configuration;
    if (form.cable_length_m.trim()) specifications.cable_length_m = Number(form.cable_length_m);
    if (form.ip_rating.trim()) specifications.ip_rating = form.ip_rating.trim();
    if (form.connectivity.trim()) specifications.connectivity = form.connectivity.trim();
    const payload = {
      brand_id: form.brand_id, category: "ev_charger", name: form.name.trim(), slug, sku: form.sku?.trim() || null,
      charger_type: form.charger_type, charger_power_kw: Number(form.charger_power_kw), connector_type: form.connector_type,
      phase: form.phase || null,
      short_spec: form.short_spec?.trim() || null, secondary_spec: form.secondary_spec?.trim() || null,
      description: form.description?.trim() || null,
      price: Number(form.price), compare_at_price: form.compare_at_price === null || form.compare_at_price === ("" as never) ? null : Number(form.compare_at_price),
      currency_code: "PKR", stock_status: form.stock_status, stock_quantity: form.stock_quantity === null || form.stock_quantity === ("" as never) ? null : Number(form.stock_quantity),
      image_url: imageUrl || null, gallery_images: [...form.gallery_images, ...uploadedGallery], specifications,
      warranty_years: form.warranty_years === null || form.warranty_years === ("" as never) ? null : Number(form.warranty_years),
      is_featured: form.is_featured, is_active: form.is_active, priority: Number(form.priority) || 0, updated_at: new Date().toISOString(),
    };
    const query = editing
      ? supabase.from("products").update(payload).eq("id", editing.id)
      : supabase.from("products").insert(payload);
    const { error } = await query;
    if (error) throw error;
  }, onSuccess: async () => { await queryClient.invalidateQueries({ queryKey: ["ev-chargers"] }); closeForm(); }, onError: (reason) => setFormError(errorMessage(reason)) });

  const statusMutation = useMutation({ mutationFn: async (item: EvCharger) => {
    const { error } = await supabase.from("products").update({ is_active: !item.is_active, updated_at: new Date().toISOString() }).eq("id", item.id);
    if (error) throw error;
  }, onSuccess: () => queryClient.invalidateQueries({ queryKey: ["ev-chargers"] }) });

  const deleteMutation = useMutation({ mutationFn: async (item: EvCharger) => {
    if (item.is_active) throw new Error("Deactivate this EV charger before deleting it.");
    if (!window.confirm(`Delete ${item.name}? Existing order references may prevent deletion.`)) return;
    const { error } = await supabase.from("products").delete().eq("id", item.id).eq("is_active", false);
    if (error) throw error;
  }, onSuccess: () => queryClient.invalidateQueries({ queryKey: ["ev-chargers"] }) });

  function openNew() { setEditing(null); setForm(emptyForm); setMainFile(null); setGalleryFiles([]); setFormError(""); setFormOpen(true); }
  function openEdit(item: EvCharger) { setEditing(item); setForm(toForm(item)); setMainFile(null); setGalleryFiles([]); setFormError(""); setFormOpen(true); }
  function closeForm() { setFormOpen(false); setEditing(null); setMainFile(null); setGalleryFiles([]); setFormError(""); }
  const update = <K extends keyof FormState>(key: K, value: FormState[K]) => setForm((current) => ({ ...current, [key]: value }));
  const inputClass = "mt-1 w-full rounded-md border border-slate-300 px-3 py-2 text-sm text-ink outline-none focus:border-solar";
  const labelClass = "text-xs font-bold text-slate-600";

  return <div>
    <PageHeader title="EV Chargers" description="Manage EV Chargers shown as their own top-level KaamAsaan marketplace category." action={<button className="flex items-center gap-2 rounded-md bg-solar px-4 py-2.5 text-sm font-bold text-ink" onClick={openNew}><FiPlus /> Add EV Charger</button>} />
    <div className="mb-5 grid gap-3 rounded-lg border border-slate-200 bg-white p-4 md:grid-cols-3 lg:grid-cols-6">
      <label className="relative"><FiSearch className="absolute left-3 top-3 text-slate-400" /><input className="w-full rounded-md border border-slate-300 py-2 pl-9 pr-3 text-sm" placeholder="Search products" value={search} onChange={(e) => setSearch(e.target.value)} /></label>
      <select className="rounded-md border border-slate-300 px-3 py-2 text-sm" value={chargerTypeFilter} onChange={(e) => setChargerTypeFilter(e.target.value)}><option value="all">All charger types</option>{chargerTypeOptions.map(([value, label]) => <option key={value} value={value}>{label}</option>)}</select>
      <select className="rounded-md border border-slate-300 px-3 py-2 text-sm" value={powerFilter} onChange={(e) => setPowerFilter(e.target.value)}><option value="all">All power ratings</option>{powerFilterOptions.map((value) => <option key={value} value={value}>{value} kW</option>)}</select>
      <select className="rounded-md border border-slate-300 px-3 py-2 text-sm" value={connectorFilter} onChange={(e) => setConnectorFilter(e.target.value)}><option value="all">All connectors</option>{connectorFilterOptions.map((value) => <option key={value} value={value}>{connectorLabel(value)}</option>)}</select>
      <select className="rounded-md border border-slate-300 px-3 py-2 text-sm" value={stock} onChange={(e) => setStock(e.target.value)}><option value="all">All stock statuses</option>{stockOptions.map(([value, label]) => <option key={value} value={value}>{label}</option>)}</select>
      <select className="rounded-md border border-slate-300 px-3 py-2 text-sm" value={activity} onChange={(e) => setActivity(e.target.value)}><option value="all">Active and inactive</option><option value="active">Active</option><option value="inactive">Inactive</option></select>
    </div>
    {evChargers.isLoading ? <LoadingState label="Loading EV chargers..." /> : evChargers.isError ? <ErrorState message={errorMessage(evChargers.error)} /> : filtered.length === 0 ? <EmptyState label="No EV chargers match these filters." /> : <div className="overflow-hidden rounded-lg border border-slate-200 bg-white shadow-sm"><div className="overflow-x-auto"><table className="min-w-full text-left text-sm"><thead className="bg-slate-50 text-xs uppercase text-slate-500"><tr>{["Image","Product","Brand","Charger Type","Power","Connector","Phase","Price","Stock","Active","Actions"].map((label) => <th key={label} className="px-4 py-3">{label}</th>)}</tr></thead><tbody className="divide-y divide-slate-100">{filtered.map((item) => <tr key={item.id}>
      <td className="px-4 py-3"><StorageImage bucket="product-images" value={item.image_url} alt={item.name} className="h-14 w-14 rounded-md object-contain bg-amber-50" fallback={<div className="flex h-14 w-14 items-center justify-center rounded-md bg-slate-100 text-slate-400"><FiImage /></div>} /></td>
      <td className="px-4 py-3"><div className="font-bold text-ink">{item.name}</div><div className="text-xs text-slate-400">{item.sku || item.slug}</div></td>
      <td className="px-4 py-3">{item.brands?.name ?? "—"}</td>
      <td className="px-4 py-3">{chargerTypeLabel(item.charger_type)}</td>
      <td className="px-4 py-3">{item.charger_power_kw != null ? `${item.charger_power_kw} kW` : "—"}</td>
      <td className="px-4 py-3">{connectorLabel(item.connector_type)}</td>
      <td className="px-4 py-3">{phaseLabel(item.phase)}</td>
      <td className="px-4 py-3 font-semibold">{formatMoney(item.price ?? 0, item.currency_code)}</td>
      <td className="px-4 py-3">{stockLabel(item.stock_status)}</td>
      <td className="px-4 py-3"><button className={`rounded-full px-2 py-1 text-xs font-bold ${item.is_active ? "bg-emerald-100 text-emerald-700" : "bg-slate-100 text-slate-500"}`} onClick={() => statusMutation.mutate(item)}>{item.is_active ? "Active" : "Inactive"}</button></td>
      <td className="px-4 py-3"><div className="flex gap-2"><button title="View" onClick={() => setViewing(item)}><FiEye /></button><button title="Edit" onClick={() => openEdit(item)}><FiEdit2 /></button><button title={item.is_active ? "Deactivate before deleting" : "Delete"} disabled={item.is_active} className="text-red-600 disabled:text-slate-300" onClick={() => deleteMutation.mutate(item)}><FiTrash2 /></button></div></td>
    </tr>)}</tbody></table></div></div>}

    <Modal open={formOpen} onClose={closeForm} title={editing ? "Edit EV Charger" : "Add EV Charger"} size="lg"><form onSubmit={(e) => { e.preventDefault(); save.mutate(); }} className="space-y-5">
      {formError ? <div className="rounded-md border border-red-200 bg-red-50 p-3 text-sm font-semibold text-red-700">{formError}</div> : null}
      <div className="grid gap-4 md:grid-cols-2">
        <label className={labelClass}>Product name *<input className={inputClass} value={form.name} onChange={(e) => { update("name", e.target.value); if (!editing && !form.slug) update("slug", slugify(e.target.value)); }} /></label>
        <label className={labelClass}>Brand *<select className={inputClass} value={form.brand_id} onChange={(e) => update("brand_id", e.target.value)}><option value="">Select brand</option>{brands.data?.map((brand) => <option key={brand.id} value={brand.id}>{brand.name}</option>)}</select></label>
        <label className={labelClass}>Slug<input className={inputClass} value={form.slug} onChange={(e) => update("slug", slugify(e.target.value))} /></label>
        <label className={labelClass}>SKU<input className={inputClass} value={form.sku ?? ""} onChange={(e) => update("sku", e.target.value)} /></label>
        <label className={labelClass}>Charger Type *<select className={inputClass} value={form.charger_type ?? ""} onChange={(e) => update("charger_type", e.target.value)}>{chargerTypeOptions.map(([value,label]) => <option key={value} value={value}>{label}</option>)}</select></label>
        <label className={labelClass}>Rated Power (kW) *<input type="number" min="0.1" step="0.1" className={inputClass} value={form.charger_power_kw ?? ""} onChange={(e) => update("charger_power_kw", e.target.value === "" ? null : Number(e.target.value))} /></label>
        <label className={labelClass}>Connector Type *<select className={inputClass} value={form.connector_type ?? ""} onChange={(e) => update("connector_type", e.target.value)}>{connectorOptions.map(([value,label]) => <option key={value} value={value}>{label}</option>)}</select></label>
        <label className={labelClass}>Phase<select className={inputClass} value={form.phase ?? ""} onChange={(e) => update("phase", e.target.value)}>{phaseOptions.map(([value,label]) => <option key={value} value={value}>{label}</option>)}</select></label>
        <label className={labelClass}>Price (PKR) *<input type="number" min="0" step="0.01" className={inputClass} value={form.price ?? 0} onChange={(e) => update("price", Number(e.target.value))} /></label>
        <label className={labelClass}>Compare/original price<input type="number" min="0" className={inputClass} value={form.compare_at_price ?? ""} onChange={(e) => update("compare_at_price", e.target.value === "" ? null : Number(e.target.value))} /></label>
        <label className={labelClass}>Stock status<select className={inputClass} value={form.stock_status} onChange={(e) => update("stock_status", e.target.value)}>{stockOptions.map(([value,label]) => <option key={value} value={value}>{label}</option>)}</select></label>
        <label className={labelClass}>Quantity in stock<input type="number" min="0" className={inputClass} value={form.stock_quantity ?? ""} onChange={(e) => update("stock_quantity", e.target.value === "" ? null : Number(e.target.value))} /></label>
        <label className={labelClass}>Sort priority<input type="number" min="0" className={inputClass} value={form.priority} onChange={(e) => update("priority", Number(e.target.value))} /></label>
        <label className={labelClass}>Warranty (years)<input type="number" min="0" step="0.5" className={inputClass} value={form.warranty_years ?? ""} onChange={(e) => update("warranty_years", e.target.value === "" ? null : Number(e.target.value))} /></label>
      </div>
      <label className={labelClass}>Short specification<input className={inputClass} placeholder="22kW • Type 2 • Three Phase" value={form.short_spec ?? ""} onChange={(e) => update("short_spec", e.target.value)} /></label>
      <label className={labelClass}>Secondary/use-case text<input className={inputClass} placeholder="Ideal for home and commercial EV charging" value={form.secondary_spec ?? ""} onChange={(e) => update("secondary_spec", e.target.value)} /></label>
      <label className={labelClass}>Full description<textarea rows={3} className={inputClass} value={form.description ?? ""} onChange={(e) => update("description", e.target.value)} /></label>

      <div className="rounded-lg border border-slate-200 p-4">
        <div className="mb-3 font-bold text-ink">Installation & connectivity</div>
        <div className="grid gap-4 md:grid-cols-2">
          <label className={labelClass}>Installation Type<select className={inputClass} value={form.installation_type} onChange={(e) => update("installation_type", e.target.value)}>{installationTypeOptions.map(([value,label]) => <option key={value} value={value}>{label}</option>)}</select></label>
          <label className={labelClass}>Cable Configuration<select className={inputClass} value={form.cable_configuration} onChange={(e) => update("cable_configuration", e.target.value)}>{cableConfigurationOptions.map(([value,label]) => <option key={value} value={value}>{label}</option>)}</select></label>
          <label className={labelClass}>Cable Length (m)<input type="number" min="0" step="0.1" className={inputClass} value={form.cable_length_m} onChange={(e) => update("cable_length_m", e.target.value)} /></label>
          <label className={labelClass}>IP Rating<input className={inputClass} placeholder="IP65" value={form.ip_rating} onChange={(e) => update("ip_rating", e.target.value)} /></label>
          <label className={`${labelClass} md:col-span-2`}>Connectivity<input className={inputClass} placeholder="Wi-Fi, Bluetooth, OCPP" value={form.connectivity} onChange={(e) => update("connectivity", e.target.value)} /></label>
        </div>
      </div>

      <div className="grid gap-4 md:grid-cols-2"><label className={labelClass}>Primary product image {form.is_active ? "*" : ""}<input type="file" accept="image/png,image/jpeg,image/webp" className={inputClass} onChange={(e) => { try { const file=e.target.files?.[0] ?? null; if (file) validateImage(file); setMainFile(file); setFormError(""); } catch (reason) { setFormError(errorMessage(reason)); e.currentTarget.value=""; } }} />{mainFile || form.image_url ? <div className="mt-2 flex items-center gap-3"><img alt="Primary preview" className="h-24 w-24 rounded-md bg-amber-50 object-contain" src={mainFile ? URL.createObjectURL(mainFile) : form.image_url ?? undefined} /><button type="button" className="text-xs font-bold text-red-600" onClick={() => { setMainFile(null); update("image_url", ""); }}>Remove</button></div> : null}</label><label className={labelClass}>Gallery images<input type="file" multiple accept="image/png,image/jpeg,image/webp" className={inputClass} onChange={(e) => { try { const files=Array.from(e.target.files ?? []); files.forEach(validateImage); setGalleryFiles(files); setFormError(""); } catch (reason) { setFormError(errorMessage(reason)); e.currentTarget.value=""; } }} /><div className="mt-2 flex flex-wrap gap-2">{[...form.gallery_images.map((url) => ({ url, saved: true })), ...galleryFiles.map((file) => ({ url: URL.createObjectURL(file), saved: false }))].map((entry,index) => <div key={`${entry.url}-${index}`} className="relative"><img alt="Gallery preview" src={entry.url} className="h-16 w-16 rounded object-cover" /><button type="button" className="absolute -right-1 -top-1 rounded-full bg-red-600 px-1 text-xs text-white" onClick={() => entry.saved ? update("gallery_images", form.gallery_images.filter((url) => url !== entry.url)) : setGalleryFiles((files) => files.filter((_,i) => i !== index - form.gallery_images.length))}>×</button></div>)}</div></label></div>
      <div className="flex flex-wrap gap-5 text-sm font-semibold text-slate-700"><label><input type="checkbox" checked={form.is_featured} onChange={(e) => update("is_featured", e.target.checked)} /> Featured</label><label><input type="checkbox" checked={form.is_active} onChange={(e) => update("is_active", e.target.checked)} /> Active/published</label></div>
      <div className="flex justify-end gap-3 border-t pt-4"><button type="button" className="rounded-md border px-4 py-2 text-sm font-bold" onClick={closeForm}>Cancel</button><button disabled={save.isPending} className="rounded-md bg-solar px-5 py-2 text-sm font-bold text-ink disabled:opacity-60">{save.isPending ? "Uploading & saving..." : editing ? "Save Changes" : "Create EV Charger"}</button></div>
    </form></Modal>
    <Modal open={Boolean(viewing)} onClose={() => setViewing(null)} title={viewing?.name ?? "EV charger details"}>{viewing ? <div className="space-y-4"><StorageImage bucket="product-images" value={viewing.image_url} alt={viewing.name} className="h-64 w-full rounded-lg bg-amber-50 object-contain" fallback={<div className="flex h-64 items-center justify-center bg-slate-100"><FiImage /></div>} /><div><div className="text-sm text-slate-500">{viewing.brands?.name}</div><h3 className="text-xl font-black text-ink">{viewing.name}</h3><p className="mt-2 text-sm text-slate-600">{viewing.description || "No description provided."}</p></div><dl className="grid grid-cols-2 gap-3 text-sm"><div><dt className="text-slate-400">Charger Type</dt><dd className="font-bold">{chargerTypeLabel(viewing.charger_type)}</dd></div><div><dt className="text-slate-400">Rated Power</dt><dd className="font-bold">{viewing.charger_power_kw != null ? `${viewing.charger_power_kw} kW` : "—"}</dd></div><div><dt className="text-slate-400">Connector</dt><dd className="font-bold">{connectorLabel(viewing.connector_type)}</dd></div><div><dt className="text-slate-400">Phase</dt><dd className="font-bold">{phaseLabel(viewing.phase)}</dd></div><div><dt className="text-slate-400">Price</dt><dd className="font-bold">{formatMoney(viewing.price ?? 0, viewing.currency_code)}</dd></div><div><dt className="text-slate-400">Stock</dt><dd className="font-bold">{stockLabel(viewing.stock_status)}</dd></div></dl></div> : null}</Modal>
  </div>;
}
