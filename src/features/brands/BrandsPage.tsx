import { zodResolver } from "@hookform/resolvers/zod";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useEffect, useState } from "react";
import { useForm } from "react-hook-form";
import { FiEdit2, FiImage, FiPlus, FiSearch } from "react-icons/fi";
import { z } from "zod";
import { EmptyState, ErrorState, LoadingState } from "../../components/AsyncState";
import { Modal } from "../../components/Modal";
import { PageHeader } from "../../components/PageHeader";
import { StorageImage } from "../../components/StorageImage";
import { StatusBadge } from "../../components/StatusBadge";
import { normalizePublicStorageUrl, uploadPublicFile } from "../../lib/storage";
import { supabase } from "../../lib/supabase";
import { errorMessage, slugify } from "../../lib/utils";
import type { Brand, ProductCategory } from "../../types/database";

const categories = ["solar_panel", "inverter", "battery", "mounting_structure", "accessory"] as const;
const schema = z.object({ name: z.string().min(2), slug: z.string().min(2), category: z.enum(categories), logo_url: z.string().nullable(), is_active: z.boolean() });
type Values = z.infer<typeof schema>;
const emptyValues: Values = { name: "", slug: "", category: "solar_panel", logo_url: "", is_active: true };
async function fetchBrands() { const { data, error } = await supabase.from("brands").select("*").order("name"); if (error) throw error; return data as Brand[]; }

export function BrandsPage() {
  const client = useQueryClient(); const brands = useQuery({ queryKey: ["brands"], queryFn: fetchBrands });
  const [search, setSearch] = useState(""); const [category, setCategory] = useState<"all" | ProductCategory>("all");
  const [editing, setEditing] = useState<Brand | null>(null); const [open, setOpen] = useState(false); const [message, setMessage] = useState(""); const [uploading, setUploading] = useState(false);
  const form = useForm<Values>({ resolver: zodResolver(schema), defaultValues: emptyValues });
  useEffect(() => { if (open) form.reset(editing ? { ...editing, logo_url: editing.logo_url ?? "" } : emptyValues); }, [editing, form, open]);
  const save = useMutation({
    mutationFn: async (values: Values) => { const payload = { ...values, logo_url: normalizePublicStorageUrl("brand-logos", values.logo_url) || null }; const request = editing ? supabase.from("brands").update(payload).eq("id", editing.id) : supabase.from("brands").insert(payload); const { error } = await request; if (error) throw error; },
    onSuccess: async () => { await client.invalidateQueries({ queryKey: ["brands"] }); setOpen(false); }, onError: (reason) => setMessage(errorMessage(reason)),
  });
  const toggle = useMutation({ mutationFn: async (brand: Brand) => { const { error } = await supabase.from("brands").update({ is_active: !brand.is_active }).eq("id", brand.id); if (error) throw error; }, onSuccess: () => client.invalidateQueries({ queryKey: ["brands"] }) });
  async function upload(file?: File) { if (!file) return; setUploading(true); try { form.setValue("logo_url", await uploadPublicFile("brand-logos", file)); } catch (reason) { setMessage(errorMessage(reason)); } finally { setUploading(false); } }
  const filtered = (brands.data ?? []).filter((brand) => (category === "all" || brand.category === category) && brand.name.toLowerCase().includes(search.toLowerCase()));
  return <>
    <PageHeader title="Brands Management" description="Maintain marketplace manufacturers, logos, categories, and visibility." action={<button className="btn-primary" onClick={() => { setEditing(null); setMessage(""); setOpen(true); }}><FiPlus /> Add brand</button>} />
    <div className="panel mb-4 flex flex-col gap-3 p-3 sm:flex-row"><label className="relative flex-1"><FiSearch className="absolute left-3 top-3 text-slate-400" /><input className="field pl-9" placeholder="Search brands" value={search} onChange={(e) => setSearch(e.target.value)} /></label><select className="field sm:w-52" value={category} onChange={(e) => setCategory(e.target.value as typeof category)}><option value="all">All categories</option>{categories.map((item) => <option value={item} key={item}>{item}</option>)}</select></div>
    <section className="panel overflow-hidden">{brands.isLoading ? <LoadingState /> : brands.error ? <ErrorState message={brands.error.message} /> : filtered.length === 0 ? <EmptyState /> : <div className="overflow-x-auto"><table className="min-w-full text-left text-sm"><thead className="bg-slate-50 text-xs uppercase text-slate-500"><tr><th className="px-4 py-3">Brand</th><th className="px-4 py-3">Category</th><th className="px-4 py-3">Status</th><th className="px-4 py-3 text-right">Actions</th></tr></thead><tbody className="divide-y divide-slate-100">{filtered.map((brand) => <tr key={brand.id}><td className="px-4 py-3"><div className="flex items-center gap-3"><StorageImage bucket="brand-logos" value={brand.logo_url} className="h-10 w-10 rounded-md border object-contain p-1" alt={brand.name} fallback={<div className="flex h-10 w-10 items-center justify-center rounded-md bg-slate-100 font-bold">{brand.name[0]}</div>} /><div><div className="font-bold">{brand.name}</div><div className="text-xs text-slate-500">{brand.slug}</div></div></div></td><td className="px-4 py-3 capitalize">{brand.category.replace(/_/g, " ")}</td><td className="px-4 py-3"><button onClick={() => toggle.mutate(brand)}><StatusBadge active={brand.is_active} /></button></td><td className="px-4 py-3 text-right"><button className="btn-secondary px-3" onClick={() => { setEditing(brand); setMessage(""); setOpen(true); }}><FiEdit2 /></button></td></tr>)}</tbody></table></div>}</section>
    <Modal title={editing ? "Edit brand" : "Add brand"} open={open} onClose={() => setOpen(false)}>{message && <div className="mb-3 rounded-md bg-red-50 p-3 text-sm text-red-700">{message}</div>}<form className="space-y-4" onSubmit={form.handleSubmit((values) => save.mutate(values))}><label className="block text-sm font-bold">Name<input className="field mt-2" {...form.register("name")} onBlur={(e) => !form.getValues("slug") && form.setValue("slug", slugify(e.target.value))} /></label><label className="block text-sm font-bold">Slug<input className="field mt-2" {...form.register("slug")} /></label><label className="block text-sm font-bold">Category<select className="field mt-2" {...form.register("category")}>{categories.map((item) => <option value={item} key={item}>{item}</option>)}</select></label><label className="block text-sm font-bold">Brand logo<input className="field mt-2" type="file" accept="image/*" onChange={(e) => upload(e.target.files?.[0])} /><span className="mt-1 block text-xs font-normal text-slate-500">{uploading ? "Uploading..." : "Uploads to brand-logos"}</span></label><label className="flex items-center gap-2 text-sm font-semibold"><input type="checkbox" {...form.register("is_active")} /> Active</label><div className="flex justify-end gap-3 border-t pt-4"><button type="button" className="btn-secondary" onClick={() => setOpen(false)}>Cancel</button><button className="btn-primary" disabled={uploading || save.isPending}>Save brand</button></div></form></Modal>
  </>;
}
