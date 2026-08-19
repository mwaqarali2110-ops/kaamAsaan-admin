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

const categoryOptions = [
  ["cleaning_brushes", "Cleaning Brushes"], ["cleaning_shampoo", "Cleaning Shampoo"],
  ["cleaning_kits", "Cleaning Kits"], ["wipers", "Wipers"],
  ["installation_tools", "Installation Tools"], ["safety_equipment", "Safety Equipment"], ["other", "Other"],
] as const;
const stockOptions = [["in_stock", "In Stock"], ["out_of_stock", "Out of Stock"], ["on_request", "On Request"]] as const;
const badgeOptions = [["", "None"], ["best_seller", "Best Seller"], ["best_value", "Best Value"], ["new", "New"]] as const;
const categoryLabel = (value?: string | null) => categoryOptions.find(([key]) => key === value)?.[1] ?? "Other";
const stockLabel = (value?: string | null) => stockOptions.find(([key]) => key === value)?.[1] ?? "On Request";
const ACCEPTED_TYPES = new Set(["image/png", "image/jpeg", "image/webp"]);
const MAX_IMAGE_BYTES = 8 * 1024 * 1024;

type SpecRow = { key: string; value: string };
type Accessory = {
  id: string; brand_id: string; name: string; slug: string; sku: string | null; accessory_subcategory: string | null;
  short_spec: string | null; secondary_spec: string | null; description: string | null; price: number | null;
  compare_at_price: number | null; currency_code: string; stock_status: string; stock_quantity: number | null;
  image_url: string | null; gallery_images: string[] | null; specifications: Record<string, unknown> | null;
  usage_instructions: string | null; package_contents: string | null; warranty_years: number | null; badge: string | null;
  is_featured: boolean; is_active: boolean; priority: number; updated_at: string;
  brands?: { id: string; name: string } | null;
};
type FormState = Omit<Accessory, "id" | "updated_at" | "brands" | "gallery_images" | "specifications"> & {
  gallery_images: string[]; specifications: SpecRow[];
};

const emptyForm: FormState = {
  brand_id: "", name: "", slug: "", sku: "", accessory_subcategory: "cleaning_brushes",
  short_spec: "", secondary_spec: "", description: "", price: 0, compare_at_price: null,
  currency_code: "PKR", stock_status: "in_stock", stock_quantity: null, image_url: "", gallery_images: [],
  specifications: [{ key: "", value: "" }], usage_instructions: "", package_contents: "", warranty_years: null,
  badge: "", is_featured: false, is_active: true, priority: 0,
};

const validateImage = (file: File) => {
  if (!ACCEPTED_TYPES.has(file.type)) throw new Error("Use a PNG, JPG/JPEG, or WEBP image.");
  if (file.size > MAX_IMAGE_BYTES) throw new Error("Each image must be 8 MB or smaller.");
};
const toForm = (item: Accessory): FormState => ({
  brand_id: item.brand_id, name: item.name, slug: item.slug, sku: item.sku ?? "",
  accessory_subcategory: item.accessory_subcategory ?? "other", short_spec: item.short_spec ?? "",
  secondary_spec: item.secondary_spec ?? "", description: item.description ?? "", price: item.price ?? 0,
  compare_at_price: item.compare_at_price, currency_code: item.currency_code || "PKR", stock_status: item.stock_status,
  stock_quantity: item.stock_quantity, image_url: item.image_url ?? "", gallery_images: item.gallery_images ?? [],
  specifications: Object.entries(item.specifications ?? {}).map(([key, value]) => ({ key, value: String(value) })).concat([{ key: "", value: "" }]),
  usage_instructions: item.usage_instructions ?? "", package_contents: item.package_contents ?? "", warranty_years: item.warranty_years,
  badge: item.badge ?? "", is_featured: item.is_featured, is_active: item.is_active, priority: item.priority ?? 0,
});

export function AccessoriesPage() {
  const queryClient = useQueryClient();
  const [search, setSearch] = useState("");
  const [category, setCategory] = useState("all");
  const [stock, setStock] = useState("all");
  const [activity, setActivity] = useState("all");
  const [editing, setEditing] = useState<Accessory | null>(null);
  const [viewing, setViewing] = useState<Accessory | null>(null);
  const [formOpen, setFormOpen] = useState(false);
  const [form, setForm] = useState<FormState>(emptyForm);
  const [mainFile, setMainFile] = useState<File | null>(null);
  const [galleryFiles, setGalleryFiles] = useState<File[]>([]);
  const [formError, setFormError] = useState("");

  const accessories = useQuery({ queryKey: ["accessories"], queryFn: async () => {
    const { data, error } = await supabase.from("products").select("*, brands:brands(id,name)").eq("category", "accessory").order("is_featured", { ascending: false }).order("priority").order("updated_at", { ascending: false });
    if (error) throw error;
    return (data ?? []) as Accessory[];
  }});
  const brands = useQuery({ queryKey: ["brands", "accessories"], queryFn: async () => {
    const { data, error } = await supabase.from("brands").select("id,name,is_active").eq("is_active", true).order("name");
    if (error) throw error;
    return data ?? [];
  }});

  const filtered = useMemo(() => (accessories.data ?? []).filter((item) => {
    const text = `${item.name} ${item.brands?.name ?? ""} ${item.sku ?? ""}`.toLowerCase();
    return text.includes(search.trim().toLowerCase()) && (category === "all" || item.accessory_subcategory === category)
      && (stock === "all" || item.stock_status === stock) && (activity === "all" || item.is_active === (activity === "active"));
  }), [accessories.data, activity, category, search, stock]);

  const save = useMutation({ mutationFn: async () => {
    setFormError("");
    if (!form.name.trim() || !form.brand_id || !form.accessory_subcategory) throw new Error("Product name, brand, and category are required.");
    if (!Number.isFinite(Number(form.price)) || Number(form.price) < 0) throw new Error("Price must be zero or greater.");
    const slug = slugify(form.slug || form.name);
    if (!slug) throw new Error("A valid slug is required.");
    let imageUrl = form.image_url;
    if (mainFile) imageUrl = await uploadPublicFile("product-images", mainFile, `accessories/${slug}`);
    if (form.is_active && !imageUrl) throw new Error("A product image is required before publishing.");
    const uploadedGallery = await Promise.all(galleryFiles.map((file) => uploadPublicFile("product-images", file, `accessories/${slug}/gallery`)));
    const specifications = Object.fromEntries(form.specifications.map(({ key, value }) => [key.trim(), value.trim()]).filter(([key, value]) => key && value));
    const payload = {
      brand_id: form.brand_id, category: "accessory", name: form.name.trim(), slug, sku: form.sku?.trim() || null,
      accessory_subcategory: form.accessory_subcategory, short_spec: form.short_spec?.trim() || null,
      secondary_spec: form.secondary_spec?.trim() || null, description: form.description?.trim() || null,
      price: Number(form.price), compare_at_price: form.compare_at_price === null || form.compare_at_price === ("" as never) ? null : Number(form.compare_at_price),
      currency_code: "PKR", stock_status: form.stock_status, stock_quantity: form.stock_quantity === null || form.stock_quantity === ("" as never) ? null : Number(form.stock_quantity),
      image_url: imageUrl || null, gallery_images: [...form.gallery_images, ...uploadedGallery], specifications,
      usage_instructions: form.usage_instructions?.trim() || null, package_contents: form.package_contents?.trim() || null,
      warranty_years: form.warranty_years === null || form.warranty_years === ("" as never) ? null : Number(form.warranty_years),
      badge: form.badge || null, is_featured: form.is_featured,
      is_active: form.is_active, priority: Number(form.priority) || 0, updated_at: new Date().toISOString(),
    };
    const query = editing
      ? supabase.from("products").update(payload).eq("id", editing.id)
      : supabase.from("products").insert(payload);
    const { error } = await query;
    if (error) throw error;
  }, onSuccess: async () => { await queryClient.invalidateQueries({ queryKey: ["accessories"] }); closeForm(); }, onError: (reason) => setFormError(errorMessage(reason)) });

  const statusMutation = useMutation({ mutationFn: async (item: Accessory) => {
    const { error } = await supabase.from("products").update({ is_active: !item.is_active, updated_at: new Date().toISOString() }).eq("id", item.id);
    if (error) throw error;
  }, onSuccess: () => queryClient.invalidateQueries({ queryKey: ["accessories"] }) });

  const deleteMutation = useMutation({ mutationFn: async (item: Accessory) => {
    if (item.is_active) throw new Error("Deactivate this accessory before deleting it.");
    if (!window.confirm(`Delete ${item.name}? Existing order references may prevent deletion.`)) return;
    const { error } = await supabase.from("products").delete().eq("id", item.id).eq("is_active", false);
    if (error) throw error;
  }, onSuccess: () => queryClient.invalidateQueries({ queryKey: ["accessories"] }) });

  function openNew() { setEditing(null); setForm(emptyForm); setMainFile(null); setGalleryFiles([]); setFormError(""); setFormOpen(true); }
  function openEdit(item: Accessory) { setEditing(item); setForm(toForm(item)); setMainFile(null); setGalleryFiles([]); setFormError(""); setFormOpen(true); }
  function closeForm() { setFormOpen(false); setEditing(null); setMainFile(null); setGalleryFiles([]); setFormError(""); }
  const update = <K extends keyof FormState>(key: K, value: FormState[K]) => setForm((current) => ({ ...current, [key]: value }));
  const inputClass = "mt-1 w-full rounded-md border border-slate-300 px-3 py-2 text-sm text-ink outline-none focus:border-solar";
  const labelClass = "text-xs font-bold text-slate-600";

  return <div>
    <PageHeader title="Accessories" description="Manage Solar Accessories shown in the KaamAsaan marketplace." action={<button className="flex items-center gap-2 rounded-md bg-solar px-4 py-2.5 text-sm font-bold text-ink" onClick={openNew}><FiPlus /> Add Accessory</button>} />
    <div className="mb-5 grid gap-3 rounded-lg border border-slate-200 bg-white p-4 md:grid-cols-4">
      <label className="relative"><FiSearch className="absolute left-3 top-3 text-slate-400" /><input className="w-full rounded-md border border-slate-300 py-2 pl-9 pr-3 text-sm" placeholder="Search products" value={search} onChange={(e) => setSearch(e.target.value)} /></label>
      <select className="rounded-md border border-slate-300 px-3 py-2 text-sm" value={category} onChange={(e) => setCategory(e.target.value)}><option value="all">All categories</option>{categoryOptions.map(([value, label]) => <option key={value} value={value}>{label}</option>)}</select>
      <select className="rounded-md border border-slate-300 px-3 py-2 text-sm" value={stock} onChange={(e) => setStock(e.target.value)}><option value="all">All stock statuses</option>{stockOptions.map(([value, label]) => <option key={value} value={value}>{label}</option>)}</select>
      <select className="rounded-md border border-slate-300 px-3 py-2 text-sm" value={activity} onChange={(e) => setActivity(e.target.value)}><option value="all">Active and inactive</option><option value="active">Active</option><option value="inactive">Inactive</option></select>
    </div>
    {accessories.isLoading ? <LoadingState label="Loading accessories..." /> : accessories.isError ? <ErrorState message={errorMessage(accessories.error)} /> : filtered.length === 0 ? <EmptyState label="No accessories match these filters." /> : <div className="overflow-hidden rounded-lg border border-slate-200 bg-white shadow-sm"><div className="overflow-x-auto"><table className="min-w-full text-left text-sm"><thead className="bg-slate-50 text-xs uppercase text-slate-500"><tr>{["Image","Product","Brand","Category","Price","Stock","Featured","Active","Updated","Actions"].map((label) => <th key={label} className="px-4 py-3">{label}</th>)}</tr></thead><tbody className="divide-y divide-slate-100">{filtered.map((item) => <tr key={item.id}>
      <td className="px-4 py-3"><StorageImage bucket="product-images" value={item.image_url} alt={item.name} className="h-14 w-14 rounded-md object-contain bg-amber-50" fallback={<div className="flex h-14 w-14 items-center justify-center rounded-md bg-slate-100 text-slate-400"><FiImage /></div>} /></td>
      <td className="px-4 py-3"><div className="font-bold text-ink">{item.name}</div><div className="text-xs text-slate-400">{item.sku || item.slug}</div></td><td className="px-4 py-3">{item.brands?.name ?? "—"}</td><td className="px-4 py-3">{categoryLabel(item.accessory_subcategory)}</td><td className="px-4 py-3 font-semibold">{formatMoney(item.price ?? 0, item.currency_code)}</td><td className="px-4 py-3">{stockLabel(item.stock_status)}</td><td className="px-4 py-3">{item.is_featured ? <span className="rounded-full bg-amber-100 px-2 py-1 text-xs font-bold text-amber-800">Featured</span> : "—"}</td><td className="px-4 py-3"><button className={`rounded-full px-2 py-1 text-xs font-bold ${item.is_active ? "bg-emerald-100 text-emerald-700" : "bg-slate-100 text-slate-500"}`} onClick={() => statusMutation.mutate(item)}>{item.is_active ? "Active" : "Inactive"}</button></td><td className="whitespace-nowrap px-4 py-3 text-xs text-slate-500">{new Date(item.updated_at).toLocaleDateString()}</td><td className="px-4 py-3"><div className="flex gap-2"><button title="View" onClick={() => setViewing(item)}><FiEye /></button><button title="Edit" onClick={() => openEdit(item)}><FiEdit2 /></button><button title={item.is_active ? "Deactivate before deleting" : "Delete"} disabled={item.is_active} className="text-red-600 disabled:text-slate-300" onClick={() => deleteMutation.mutate(item)}><FiTrash2 /></button></div></td>
    </tr>)}</tbody></table></div></div>}

    <Modal open={formOpen} onClose={closeForm} title={editing ? "Edit Accessory" : "Add Accessory"} size="lg"><form onSubmit={(e) => { e.preventDefault(); save.mutate(); }} className="space-y-5">
      {formError ? <div className="rounded-md border border-red-200 bg-red-50 p-3 text-sm font-semibold text-red-700">{formError}</div> : null}
      <div className="grid gap-4 md:grid-cols-2">
        <label className={labelClass}>Product name *<input className={inputClass} value={form.name} onChange={(e) => { update("name", e.target.value); if (!editing && !form.slug) update("slug", slugify(e.target.value)); }} /></label>
        <label className={labelClass}>Brand *<select className={inputClass} value={form.brand_id} onChange={(e) => update("brand_id", e.target.value)}><option value="">Select brand</option>{brands.data?.map((brand) => <option key={brand.id} value={brand.id}>{brand.name}</option>)}</select></label>
        <label className={labelClass}>Category *<select className={inputClass} value={form.accessory_subcategory ?? ""} onChange={(e) => update("accessory_subcategory", e.target.value)}>{categoryOptions.map(([value,label]) => <option key={value} value={value}>{label}</option>)}</select></label>
        <label className={labelClass}>Slug<input className={inputClass} value={form.slug} onChange={(e) => update("slug", slugify(e.target.value))} /></label>
        <label className={labelClass}>Short specification<input className={inputClass} placeholder="6 meter pole • Soft bristles" value={form.short_spec ?? ""} onChange={(e) => update("short_spec", e.target.value)} /></label>
        <label className={labelClass}>Secondary/use-case text<input className={inputClass} value={form.secondary_spec ?? ""} onChange={(e) => update("secondary_spec", e.target.value)} /></label>
        <label className={labelClass}>Price (PKR) *<input type="number" min="0" step="0.01" className={inputClass} value={form.price ?? 0} onChange={(e) => update("price", Number(e.target.value))} /></label>
        <label className={labelClass}>Compare/original price<input type="number" min="0" className={inputClass} value={form.compare_at_price ?? ""} onChange={(e) => update("compare_at_price", e.target.value === "" ? null : Number(e.target.value))} /></label>
        <label className={labelClass}>Stock status<select className={inputClass} value={form.stock_status} onChange={(e) => update("stock_status", e.target.value)}>{stockOptions.map(([value,label]) => <option key={value} value={value}>{label}</option>)}</select></label>
        <label className={labelClass}>Quantity in stock<input type="number" min="0" className={inputClass} value={form.stock_quantity ?? ""} onChange={(e) => update("stock_quantity", e.target.value === "" ? null : Number(e.target.value))} /></label>
        <label className={labelClass}>SKU<input className={inputClass} value={form.sku ?? ""} onChange={(e) => update("sku", e.target.value)} /></label>
        <label className={labelClass}>Badge<select className={inputClass} value={form.badge ?? ""} onChange={(e) => update("badge", e.target.value)}>{badgeOptions.map(([value,label]) => <option key={value} value={value}>{label}</option>)}</select></label>
        <label className={labelClass}>Sort priority<input type="number" min="0" className={inputClass} value={form.priority} onChange={(e) => update("priority", Number(e.target.value))} /></label>
        <label className={labelClass}>Warranty (years)<input type="number" min="0" step="0.5" className={inputClass} value={form.warranty_years ?? ""} onChange={(e) => update("warranty_years", e.target.value === "" ? null : Number(e.target.value))} /></label>
      </div>
      <label className={labelClass}>Full description<textarea rows={3} className={inputClass} value={form.description ?? ""} onChange={(e) => update("description", e.target.value)} /></label>
      <div className="grid gap-4 md:grid-cols-2"><label className={labelClass}>Usage instructions<textarea rows={3} className={inputClass} value={form.usage_instructions ?? ""} onChange={(e) => update("usage_instructions", e.target.value)} /></label><label className={labelClass}>Package contents<textarea rows={3} className={inputClass} value={form.package_contents ?? ""} onChange={(e) => update("package_contents", e.target.value)} /></label></div>
      <div className="rounded-lg border border-slate-200 p-4"><div className="mb-3 font-bold text-ink">Key specifications</div>{form.specifications.map((row,index) => <div key={index} className="mb-2 grid grid-cols-[1fr_1fr_auto] gap-2"><input className="rounded-md border px-3 py-2 text-sm" placeholder="Specification" value={row.key} onChange={(e) => update("specifications", form.specifications.map((item,i) => i === index ? { ...item, key: e.target.value } : item))} /><input className="rounded-md border px-3 py-2 text-sm" placeholder="Value" value={row.value} onChange={(e) => update("specifications", form.specifications.map((item,i) => i === index ? { ...item, value: e.target.value } : item))} /><button type="button" className="px-2 text-red-500" onClick={() => update("specifications", form.specifications.filter((_,i) => i !== index))}>×</button></div>)}<button type="button" className="text-sm font-bold text-amber-700" onClick={() => update("specifications", [...form.specifications, { key: "", value: "" }])}>+ Add specification</button></div>
      <div className="grid gap-4 md:grid-cols-2"><label className={labelClass}>Primary product image {form.is_active ? "*" : ""}<input type="file" accept="image/png,image/jpeg,image/webp" className={inputClass} onChange={(e) => { try { const file=e.target.files?.[0] ?? null; if (file) validateImage(file); setMainFile(file); setFormError(""); } catch (reason) { setFormError(errorMessage(reason)); e.currentTarget.value=""; } }} />{mainFile || form.image_url ? <div className="mt-2 flex items-center gap-3"><img alt="Primary preview" className="h-24 w-24 rounded-md bg-amber-50 object-contain" src={mainFile ? URL.createObjectURL(mainFile) : form.image_url ?? undefined} /><button type="button" className="text-xs font-bold text-red-600" onClick={() => { setMainFile(null); update("image_url", ""); }}>Remove</button></div> : null}</label><label className={labelClass}>Gallery images<input type="file" multiple accept="image/png,image/jpeg,image/webp" className={inputClass} onChange={(e) => { try { const files=Array.from(e.target.files ?? []); files.forEach(validateImage); setGalleryFiles(files); setFormError(""); } catch (reason) { setFormError(errorMessage(reason)); e.currentTarget.value=""; } }} /><div className="mt-2 flex flex-wrap gap-2">{[...form.gallery_images.map((url) => ({ url, saved: true })), ...galleryFiles.map((file) => ({ url: URL.createObjectURL(file), saved: false }))].map((entry,index) => <div key={`${entry.url}-${index}`} className="relative"><img alt="Gallery preview" src={entry.url} className="h-16 w-16 rounded object-cover" /><button type="button" className="absolute -right-1 -top-1 rounded-full bg-red-600 px-1 text-xs text-white" onClick={() => entry.saved ? update("gallery_images", form.gallery_images.filter((url) => url !== entry.url)) : setGalleryFiles((files) => files.filter((_,i) => i !== index - form.gallery_images.length))}>×</button></div>)}</div></label></div>
      <div className="flex flex-wrap gap-5 text-sm font-semibold text-slate-700"><label><input type="checkbox" checked={form.is_featured} onChange={(e) => update("is_featured", e.target.checked)} /> Featured</label><label><input type="checkbox" checked={form.is_active} onChange={(e) => update("is_active", e.target.checked)} /> Active/published</label></div>
      <div className="flex justify-end gap-3 border-t pt-4"><button type="button" className="rounded-md border px-4 py-2 text-sm font-bold" onClick={closeForm}>Cancel</button><button disabled={save.isPending} className="rounded-md bg-solar px-5 py-2 text-sm font-bold text-ink disabled:opacity-60">{save.isPending ? "Uploading & saving..." : editing ? "Save Changes" : "Create Accessory"}</button></div>
    </form></Modal>
    <Modal open={Boolean(viewing)} onClose={() => setViewing(null)} title={viewing?.name ?? "Accessory details"}>{viewing ? <div className="space-y-4"><StorageImage bucket="product-images" value={viewing.image_url} alt={viewing.name} className="h-64 w-full rounded-lg bg-amber-50 object-contain" fallback={<div className="flex h-64 items-center justify-center bg-slate-100"><FiImage /></div>} /><div><div className="text-sm text-slate-500">{viewing.brands?.name}</div><h3 className="text-xl font-black text-ink">{viewing.name}</h3><p className="mt-2 text-sm text-slate-600">{viewing.description || "No description provided."}</p></div><dl className="grid grid-cols-2 gap-3 text-sm"><div><dt className="text-slate-400">Category</dt><dd className="font-bold">{categoryLabel(viewing.accessory_subcategory)}</dd></div><div><dt className="text-slate-400">Price</dt><dd className="font-bold">{formatMoney(viewing.price ?? 0, viewing.currency_code)}</dd></div></dl></div> : null}</Modal>
  </div>;
}
