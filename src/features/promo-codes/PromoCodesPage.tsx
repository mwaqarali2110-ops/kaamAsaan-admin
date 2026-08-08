import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useMemo, useState, type FormEvent } from "react";
import { FiEdit2, FiPlus, FiPower, FiSearch, FiTrash2 } from "react-icons/fi";
import { EmptyState, ErrorState, LoadingState } from "../../components/AsyncState";
import { Modal } from "../../components/Modal";
import { PageHeader } from "../../components/PageHeader";
import { supabase } from "../../lib/supabase";
import type { PromoCode, PromoDiscountType, PromoTarget } from "../../types/database";

type PromoStatus = "active" | "upcoming" | "expired" | "disabled";
type PromoRow = PromoCode & { promo_redemptions?: Array<{ count: number }> };
type PromoForm = {
  code: string; description: string; discountType: PromoDiscountType; discountValue: string;
  maxDiscountAmount: string; appliesTo: PromoTarget; startsAt: string; expiresAt: string;
  isActive: boolean; adminNotes: string;
};

const componentLabels: Record<PromoTarget, string> = {
  installation: "Installation Charges", panels: "Solar Panels", inverter: "Inverter", battery: "Battery",
};
const dateInput = (value: Date | string) => {
  const date = new Date(value);
  const local = new Date(date.getTime() - date.getTimezoneOffset() * 60000);
  return local.toISOString().slice(0, 16);
};
const emptyForm = (): PromoForm => ({
  code: "", description: "", discountType: "percentage", discountValue: "",
  maxDiscountAmount: "", appliesTo: "installation", startsAt: dateInput(new Date()),
  expiresAt: dateInput(new Date(Date.now() + 30 * 86400000)), isActive: true, adminNotes: "",
});
const statusOf = (promo: PromoCode): PromoStatus => {
  const now = Date.now();
  if (!promo.is_active) return "disabled";
  if (now < new Date(promo.starts_at).getTime()) return "upcoming";
  if (now >= new Date(promo.expires_at).getTime()) return "expired";
  return "active";
};
const statusStyle: Record<PromoStatus, string> = {
  active: "bg-emerald-50 text-emerald-700 ring-emerald-200",
  upcoming: "bg-blue-50 text-blue-700 ring-blue-200",
  expired: "bg-slate-100 text-slate-600 ring-slate-200",
  disabled: "bg-red-50 text-red-700 ring-red-200",
};
const money = (value: number) => `PKR ${Math.round(value).toLocaleString("en-PK")}`;
const discountLabel = (promo: PromoCode) => promo.discount_type === "percentage"
  ? `${promo.discount_value}%${promo.max_discount_amount ? ` (max ${money(promo.max_discount_amount)})` : ""}`
  : money(promo.discount_value);

async function fetchPromos(): Promise<PromoCode[]> {
  const { data, error } = await supabase
    .from("promo_codes")
    .select("*, promo_redemptions(count)")
    .order("created_at", { ascending: false });
  if (error) throw error;
  return ((data ?? []) as PromoRow[]).map((row) => ({
    ...row,
    usage_count: row.promo_redemptions?.[0]?.count ?? 0,
  }));
}

export function PromoCodesPage() {
  const client = useQueryClient();
  const query = useQuery({ queryKey: ["promo-codes"], queryFn: fetchPromos });
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState<"all" | PromoStatus>("all");
  const [componentFilter, setComponentFilter] = useState<"all" | PromoTarget>("all");
  const [editing, setEditing] = useState<PromoCode | null>(null);
  const [formOpen, setFormOpen] = useState(false);
  const [form, setForm] = useState<PromoForm>(emptyForm);
  const [formError, setFormError] = useState<string | null>(null);

  const refresh = () => client.invalidateQueries({ queryKey: ["promo-codes"] });
  const save = useMutation({
    mutationFn: async () => {
      const code = form.code.trim().toUpperCase();
      const discountValue = Number(form.discountValue);
      const maxDiscountAmount = form.maxDiscountAmount ? Number(form.maxDiscountAmount) : null;
      if (!code) throw new Error("Promo code is required.");
      if (!(discountValue > 0) || (form.discountType === "percentage" && discountValue > 100)) {
        throw new Error("Enter a valid discount value. Percentages cannot exceed 100.");
      }
      if (maxDiscountAmount != null && !(maxDiscountAmount > 0)) throw new Error("Maximum discount must be greater than 0.");
      if (new Date(form.expiresAt) <= new Date(form.startsAt)) throw new Error("Valid Until must be after Valid From.");
      const payload = {
        code, description: form.description.trim() || null, discount_type: form.discountType,
        discount_value: discountValue,
        max_discount_amount: form.discountType === "percentage" ? maxDiscountAmount : null,
        applies_to: form.appliesTo, starts_at: new Date(form.startsAt).toISOString(),
        expires_at: new Date(form.expiresAt).toISOString(), is_active: form.isActive,
        admin_notes: form.adminNotes.trim() || null,
      };
      const result = editing
        ? await supabase.from("promo_codes").update(payload).eq("id", editing.id)
        : await supabase.from("promo_codes").insert(payload);
      if (result.error) throw result.error;
    },
    onSuccess: async () => { await refresh(); setFormOpen(false); setEditing(null); },
    onError: (error) => setFormError(error.message.includes("promo_codes_code_ci_key") ? "That promo code already exists." : error.message),
  });
  const toggle = useMutation({
    mutationFn: async (promo: PromoCode) => {
      const { error } = await supabase.from("promo_codes").update({ is_active: !promo.is_active }).eq("id", promo.id);
      if (error) throw error;
    },
    onSuccess: refresh,
  });
  const remove = useMutation({
    mutationFn: async (promo: PromoCode) => {
      if ((promo.usage_count ?? 0) > 0) throw new Error("Used promo codes must be disabled instead of deleted.");
      const { error } = await supabase.from("promo_codes").delete().eq("id", promo.id);
      if (error) throw error;
    },
    onSuccess: refresh,
  });

  const rows = useMemo(() => (query.data ?? []).filter((promo) => {
    const term = search.trim().toLowerCase();
    return (!term || promo.code.toLowerCase().includes(term) || promo.description?.toLowerCase().includes(term)) &&
      (statusFilter === "all" || statusOf(promo) === statusFilter) &&
      (componentFilter === "all" || promo.applies_to === componentFilter);
  }), [componentFilter, query.data, search, statusFilter]);

  const openCreate = () => { setEditing(null); setForm(emptyForm()); setFormError(null); setFormOpen(true); };
  const openEdit = (promo: PromoCode) => {
    setEditing(promo);
    setForm({
      code: promo.code, description: promo.description ?? "", discountType: promo.discount_type,
      discountValue: String(promo.discount_value), maxDiscountAmount: promo.max_discount_amount == null ? "" : String(promo.max_discount_amount),
      appliesTo: promo.applies_to, startsAt: dateInput(promo.starts_at), expiresAt: dateInput(promo.expires_at),
      isActive: promo.is_active, adminNotes: promo.admin_notes ?? "",
    });
    setFormError(null); setFormOpen(true);
  };
  const submit = (event: FormEvent) => { event.preventDefault(); setFormError(null); save.mutate(); };

  return <>
    <PageHeader title="Promo Codes" description="Create component-specific discounts and review completed usage." action={
      <button className="btn-primary" onClick={openCreate}><FiPlus /> Add Promo Code</button>
    } />
    <div className="panel mb-4 grid gap-3 p-3 md:grid-cols-[1fr_190px_220px]">
      <label className="relative"><FiSearch className="absolute left-3 top-3.5 text-slate-400" /><input className="field pl-9" value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Search code or description" /></label>
      <select className="field" value={statusFilter} onChange={(e) => setStatusFilter(e.target.value as typeof statusFilter)}><option value="all">All statuses</option><option value="active">Active</option><option value="upcoming">Upcoming</option><option value="expired">Expired</option><option value="disabled">Disabled</option></select>
      <select className="field" value={componentFilter} onChange={(e) => setComponentFilter(e.target.value as typeof componentFilter)}><option value="all">All components</option>{Object.entries(componentLabels).map(([value, label]) => <option key={value} value={value}>{label}</option>)}</select>
    </div>
    {(toggle.error || remove.error) ? <div className="mb-4 rounded-md border border-red-200 bg-red-50 p-3 text-sm text-red-700">{toggle.error?.message || remove.error?.message}</div> : null}
    <section className="panel overflow-hidden">
      {query.isLoading ? <LoadingState /> : query.error ? <ErrorState message={query.error.message} /> : rows.length === 0 ? <EmptyState /> : <div className="overflow-x-auto"><table className="min-w-full text-left text-sm">
        <thead className="bg-slate-50 text-xs uppercase text-slate-500"><tr><th className="px-4 py-3">Code</th><th className="px-4 py-3">Discount</th><th className="px-4 py-3">Applies To</th><th className="px-4 py-3">Valid From</th><th className="px-4 py-3">Valid Until</th><th className="px-4 py-3">Status</th><th className="px-4 py-3">Usage</th><th className="px-4 py-3">Actions</th></tr></thead>
        <tbody className="divide-y">{rows.map((promo) => { const status = statusOf(promo); return <tr key={promo.id}>
          <td className="px-4 py-3"><div className="font-black text-ink">{promo.code}</div><div className="max-w-52 truncate text-xs text-slate-500">{promo.description || "—"}</div></td>
          <td className="px-4 py-3 font-semibold">{discountLabel(promo)}</td><td className="px-4 py-3">{componentLabels[promo.applies_to]}</td>
          <td className="px-4 py-3 text-slate-600">{new Date(promo.starts_at).toLocaleString()}</td><td className="px-4 py-3 text-slate-600">{new Date(promo.expires_at).toLocaleString()}</td>
          <td className="px-4 py-3"><span className={`inline-flex rounded-full px-2 py-1 text-xs font-bold capitalize ring-1 ${statusStyle[status]}`}>{status}</span></td>
          <td className="px-4 py-3 font-bold">{promo.usage_count ?? 0}</td>
          <td className="px-4 py-3"><div className="flex gap-2"><button className="btn-secondary px-3 py-2" onClick={() => openEdit(promo)} title="View or edit"><FiEdit2 /></button><button className="btn-secondary px-3 py-2" onClick={() => toggle.mutate(promo)} title={promo.is_active ? "Disable" : "Enable"}><FiPower /></button><button className="btn-danger px-3 py-2" disabled={(promo.usage_count ?? 0) > 0} onClick={() => { if (confirm(`Delete promo ${promo.code}?`)) remove.mutate(promo); }} title={(promo.usage_count ?? 0) > 0 ? "Used promos cannot be deleted" : "Delete"}><FiTrash2 /></button></div></td>
        </tr>; })}</tbody>
      </table></div>}
    </section>

    <Modal title={editing ? "Edit Promo Code" : "Add Promo Code"} open={formOpen} onClose={() => setFormOpen(false)}>
      <form className="space-y-4" onSubmit={submit}>
        {formError ? <div className="rounded-md border border-red-200 bg-red-50 p-3 text-sm font-semibold text-red-700">{formError}</div> : null}
        <div className="grid gap-4 sm:grid-cols-2">
          <label className="text-sm font-bold">Promo code<input className="field mt-1 uppercase" required value={form.code} onChange={(e) => setForm({ ...form, code: e.target.value.toUpperCase().replace(/\s/g, "") })} /></label>
          <label className="text-sm font-bold">Applies To<select className="field mt-1" value={form.appliesTo} onChange={(e) => setForm({ ...form, appliesTo: e.target.value as PromoTarget })}>{Object.entries(componentLabels).map(([value, label]) => <option value={value} key={value}>{label}</option>)}</select></label>
          <label className="text-sm font-bold">Discount type<select className="field mt-1" value={form.discountType} onChange={(e) => setForm({ ...form, discountType: e.target.value as PromoDiscountType, maxDiscountAmount: e.target.value === "fixed" ? "" : form.maxDiscountAmount })}><option value="percentage">Percentage</option><option value="fixed">Fixed PKR</option></select></label>
          <label className="text-sm font-bold">Discount value<input className="field mt-1" type="number" min="0.01" max={form.discountType === "percentage" ? 100 : undefined} step="0.01" required value={form.discountValue} onChange={(e) => setForm({ ...form, discountValue: e.target.value })} /></label>
          {form.discountType === "percentage" ? <label className="text-sm font-bold">Maximum discount, optional<input className="field mt-1" type="number" min="0.01" step="0.01" value={form.maxDiscountAmount} onChange={(e) => setForm({ ...form, maxDiscountAmount: e.target.value })} /></label> : <div />}
          <label className="text-sm font-bold">Valid From<input className="field mt-1" type="datetime-local" required value={form.startsAt} onChange={(e) => setForm({ ...form, startsAt: e.target.value })} /></label>
          <label className="text-sm font-bold">Valid Until<input className="field mt-1" type="datetime-local" required value={form.expiresAt} onChange={(e) => setForm({ ...form, expiresAt: e.target.value })} /></label>
        </div>
        <label className="block text-sm font-bold">Description<textarea className="field mt-1" rows={2} value={form.description} onChange={(e) => setForm({ ...form, description: e.target.value })} /></label>
        <label className="block text-sm font-bold">Admin notes<textarea className="field mt-1" rows={2} value={form.adminNotes} onChange={(e) => setForm({ ...form, adminNotes: e.target.value })} /></label>
        <label className="flex items-center gap-2 text-sm font-bold"><input type="checkbox" checked={form.isActive} onChange={(e) => setForm({ ...form, isActive: e.target.checked })} /> Active</label>
        <div className="flex justify-end gap-3 border-t pt-4"><button type="button" className="btn-secondary" onClick={() => setFormOpen(false)}>Cancel</button><button type="submit" className="btn-primary" disabled={save.isPending}>{save.isPending ? "Saving…" : editing ? "Save Changes" : "Create Promo"}</button></div>
      </form>
    </Modal>
  </>;
}
