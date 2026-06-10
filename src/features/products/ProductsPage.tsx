import { zodResolver } from "@hookform/resolvers/zod";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useEffect, useState } from "react";
import { useForm } from "react-hook-form";
import { FiEdit2, FiImage, FiPlus, FiSearch, FiTrash2 } from "react-icons/fi";
import { z } from "zod";
import { EmptyState, ErrorState, LoadingState } from "../../components/AsyncState";
import { Modal } from "../../components/Modal";
import { PageHeader } from "../../components/PageHeader";
import { StorageImage } from "../../components/StorageImage";
import { StatusBadge } from "../../components/StatusBadge";
import { supabase } from "../../lib/supabase";
import { normalizePublicStorageUrl, uploadPublicFile } from "../../lib/storage";
import { errorMessage, formatMoney, slugify } from "../../lib/utils";
import type { Brand, Product, ProductCategory, StockStatus } from "../../types/database";

const categories = ["solar_panel", "inverter", "battery", "mounting_structure", "accessory"] as const;
const stockStatuses = ["ready_stock", "eta", "in_transit", "booking_open", "out_of_stock", "on_request", "in_stock", "preorder"] as const;
const optionalNumber = z.preprocess((value) => value === "" || value == null ? null : Number(value), z.number().nonnegative().nullable());
const schema = z.object({
  brand_id: z.string().min(1, "Select a brand."),
  category: z.enum(categories),
  name: z.string().min(2, "Product name is required."),
  slug: z.string().min(2, "Slug is required."),
  sku: z.string().nullable(),
  model: z.string().nullable(),
  capacity_watt: optionalNumber,
  capacity_kw: optionalNumber,
  battery_capacity_kwh: optionalNumber,
  price: optionalNumber,
  currency_code: z.string().length(3, "Use a 3-letter currency code."),
  warranty_years: optionalNumber,
  description: z.string().nullable(),
  image_url: z.string().nullable(),
  specifications: z.string().refine((value) => {
    try { JSON.parse(value); return true; } catch { return false; }
  }, "Specifications must be valid JSON."),
  stock_status: z.enum(stockStatuses),
  is_featured: z.boolean(),
  is_active: z.boolean(),
});
type Values = z.infer<typeof schema>;
type InputValues = z.input<typeof schema>;

const emptyValues: Values = {
  brand_id: "", category: "solar_panel", name: "", slug: "", sku: "", model: "",
  capacity_watt: null, capacity_kw: null, battery_capacity_kwh: null, price: null,
  currency_code: "PKR", warranty_years: null, description: "", image_url: "",
  specifications: "{}", stock_status: "on_request", is_featured: false, is_active: true,
};

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
  const [category, setCategory] = useState<"all" | ProductCategory>("all");
  const [editing, setEditing] = useState<Product | null>(null);
  const [modalOpen, setModalOpen] = useState(false);
  const [formError, setFormError] = useState("");
  const [uploading, setUploading] = useState(false);
  const form = useForm<InputValues, unknown, Values>({ resolver: zodResolver(schema), defaultValues: emptyValues });

  useEffect(() => {
    if (!modalOpen) return;
    if (!editing) form.reset(emptyValues);
    else form.reset({
      ...editing,
      sku: editing.sku ?? "", model: editing.model ?? "", description: editing.description ?? "",
      image_url: editing.image_url ?? "", specifications: JSON.stringify(editing.specifications ?? {}, null, 2),
    });
  }, [editing, form, modalOpen]);

  const save = useMutation({
    mutationFn: async (values: Values) => {
      const payload = { ...values, specifications: JSON.parse(values.specifications), sku: values.sku || null, model: values.model || null, description: values.description || null, image_url: normalizePublicStorageUrl("product-images", values.image_url) || null };
      const request = editing ? supabase.from("products").update(payload).eq("id", editing.id) : supabase.from("products").insert(payload);
      const { error } = await request;
      if (error) throw error;
    },
    onSuccess: async () => { await queryClient.invalidateQueries({ queryKey: ["products"] }); setModalOpen(false); },
    onError: (reason) => setFormError(errorMessage(reason)),
  });
  const remove = useMutation({
    mutationFn: async (id: string) => { const { error } = await supabase.from("products").delete().eq("id", id); if (error) throw error; },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["products"] }),
  });
  const toggle = useMutation({
    mutationFn: async (product: Product) => { const { error } = await supabase.from("products").update({ is_active: !product.is_active }).eq("id", product.id); if (error) throw error; },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["products"] }),
  });

  async function handleUpload(file?: File) {
    if (!file) return;
    setUploading(true); setFormError("");
    try { form.setValue("image_url", await uploadPublicFile("product-images", file), { shouldDirty: true }); }
    catch (reason) { setFormError(errorMessage(reason)); }
    finally { setUploading(false); }
  }

  function openForm(product?: Product) {
    setFormError(""); setEditing(product ?? null); setModalOpen(true);
  }

  const filtered = (products.data ?? []).filter((product) => {
    const term = search.toLowerCase();
    return (category === "all" || product.category === category) &&
      `${product.name} ${product.model ?? ""} ${product.brands?.name ?? ""}`.toLowerCase().includes(term);
  });

  return (
    <>
      <PageHeader title="Products Management" description="Manage live marketplace models, pricing, stock, and publishing state." action={<button className="btn-primary" onClick={() => openForm()}><FiPlus /> Add product</button>} />
      <div className="panel mb-4 flex flex-col gap-3 p-3 sm:flex-row">
        <label className="relative flex-1"><FiSearch className="absolute left-3 top-3 text-slate-400" /><input className="field pl-9" placeholder="Search products, models, or brands" value={search} onChange={(e) => setSearch(e.target.value)} /></label>
        <select className="field sm:w-52" value={category} onChange={(e) => setCategory(e.target.value as typeof category)}><option value="all">All categories</option>{categories.map((item) => <option value={item} key={item}>{item.replace(/_/g, " ")}</option>)}</select>
      </div>
      <section className="panel overflow-hidden">
        {products.isLoading ? <LoadingState /> : products.error ? <ErrorState message={products.error.message} /> : filtered.length === 0 ? <EmptyState label="No products found." /> : (
          <div className="overflow-x-auto"><table className="min-w-full text-left text-sm">
            <thead className="bg-slate-50 text-xs uppercase text-slate-500"><tr><th className="px-4 py-3">Product</th><th className="px-4 py-3">Category</th><th className="px-4 py-3">Price</th><th className="px-4 py-3">Stock</th><th className="px-4 py-3">Status</th><th className="px-4 py-3 text-right">Actions</th></tr></thead>
            <tbody className="divide-y divide-slate-100">{filtered.map((product) => <tr key={product.id} className="hover:bg-slate-50/70">
              <td className="px-4 py-3"><div className="flex items-center gap-3"><StorageImage bucket="product-images" value={product.image_url} className="h-10 w-10 rounded-md border border-slate-100 object-contain" alt={product.name} fallback={<div className="flex h-10 w-10 items-center justify-center rounded-md bg-slate-100 text-slate-400"><FiImage /></div>} /><div><div className="font-bold text-ink">{product.name}</div><div className="text-xs text-slate-500">{product.brands?.name ?? "Unknown brand"} · {product.model || "No model"}</div></div></div></td>
              <td className="px-4 py-3 capitalize text-slate-600">{product.category.replace(/_/g, " ")}</td><td className="px-4 py-3 font-semibold">{formatMoney(product.price, product.currency_code)}</td><td className="px-4 py-3 capitalize text-slate-600">{product.stock_status.replace(/_/g, " ")}</td><td className="px-4 py-3"><button onClick={() => toggle.mutate(product)}><StatusBadge active={product.is_active} /></button></td>
              <td className="px-4 py-3"><div className="flex justify-end gap-2"><button className="btn-secondary px-3" onClick={() => openForm(product)} aria-label="Edit"><FiEdit2 /></button><button className="btn-danger" onClick={() => confirm("Delete this product permanently?") && remove.mutate(product.id)} aria-label="Delete"><FiTrash2 /></button></div></td>
            </tr>)}</tbody>
          </table></div>
        )}
      </section>
      <Modal title={editing ? "Edit product" : "Add product"} open={modalOpen} onClose={() => setModalOpen(false)} size="lg">
        {formError && <div className="mb-4 rounded-md bg-red-50 p-3 text-sm text-red-700">{formError}</div>}
        <form className="grid gap-4 md:grid-cols-2" onSubmit={form.handleSubmit((values) => save.mutate(values))}>
          <TextField label="Name" error={form.formState.errors.name?.message} {...form.register("name")} onBlur={(e) => !form.getValues("slug") && form.setValue("slug", slugify(e.target.value))} />
          <TextField label="Slug" error={form.formState.errors.slug?.message} {...form.register("slug")} />
          <SelectField label="Brand" error={form.formState.errors.brand_id?.message} {...form.register("brand_id")}><option value="">Select brand</option>{brands.data?.map((brand) => <option value={brand.id} key={brand.id}>{brand.name} · {brand.category}</option>)}</SelectField>
          <SelectField label="Category" {...form.register("category")}>{categories.map((item) => <option value={item} key={item}>{item}</option>)}</SelectField>
          <TextField label="SKU" {...form.register("sku")} /><TextField label="Model" {...form.register("model")} />
          <TextField label="Capacity watts" type="number" {...form.register("capacity_watt")} /><TextField label="Capacity kW" type="number" step="0.01" {...form.register("capacity_kw")} />
          <TextField label="Battery capacity kWh" type="number" step="0.01" {...form.register("battery_capacity_kwh")} /><TextField label="Price" type="number" step="0.01" {...form.register("price")} />
          <TextField label="Currency" {...form.register("currency_code")} /><TextField label="Warranty years" type="number" step="0.1" {...form.register("warranty_years")} />
          <SelectField label="Stock status" {...form.register("stock_status")}>{stockStatuses.map((item) => <option value={item} key={item}>{item}</option>)}</SelectField>
          <label className="text-sm font-bold text-ink">Product image<input className="field mt-2" type="file" accept="image/*" onChange={(e) => handleUpload(e.target.files?.[0])} /><span className="mt-1 block text-xs font-normal text-slate-500">{uploading ? "Uploading..." : "Uploads to product-images"}</span></label>
          <label className="md:col-span-2 text-sm font-bold text-ink">Description<textarea className="field mt-2 min-h-20" {...form.register("description")} /></label>
          <label className="md:col-span-2 text-sm font-bold text-ink">Specifications JSON<textarea className="field mt-2 min-h-28 font-mono text-xs" {...form.register("specifications")} />{form.formState.errors.specifications && <span className="text-xs text-red-600">{form.formState.errors.specifications.message}</span>}</label>
          <label className="flex items-center gap-2 text-sm font-semibold"><input type="checkbox" {...form.register("is_featured")} /> Featured</label><label className="flex items-center gap-2 text-sm font-semibold"><input type="checkbox" {...form.register("is_active")} /> Active</label>
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
