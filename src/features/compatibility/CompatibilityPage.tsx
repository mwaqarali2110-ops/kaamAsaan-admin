import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { FiPlus, FiTrash2 } from "react-icons/fi";
import { EmptyState, ErrorState, LoadingState } from "../../components/AsyncState";
import { Modal } from "../../components/Modal";
import { PageHeader } from "../../components/PageHeader";
import { StatusBadge } from "../../components/StatusBadge";
import { supabase } from "../../lib/supabase";
import { errorMessage } from "../../lib/utils";

type CatalogOption = { id: string; name: string; model: string | null; brands: { name: string } | null };
type ExceptionRow = {
  id: string;
  status: "preferred" | "compatible" | "incompatible";
  notes: string | null;
  is_active: boolean;
  source: CatalogOption | null;
  target: CatalogOption | null;
};

async function fetchData() {
  const [inverters, batteries, brands] = await Promise.all([
    supabase.from("products").select("id, name, model, brands:brands!products_brand_id_fkey(name)").eq("category", "inverter").order("name"),
    supabase.from("products").select("id, name, model, brands:brands!products_brand_id_fkey(name)").eq("category", "battery").order("name"),
    supabase.from("brands").select("*").limit(1),
  ]);
  if (inverters.error) throw inverters.error;
  if (batteries.error) throw batteries.error;
  if (brands.error) throw brands.error;
  const firstBrand = brands.data?.[0] as Record<string, unknown> | undefined;
  const packageSchemaAvailable = Boolean(firstBrand && Object.prototype.hasOwnProperty.call(firstBrand, "package_generation_enabled"));
  const rules = packageSchemaAvailable
    ? await supabase.from("product_compatibility_exceptions").select("id, status, notes, is_active, source:products!product_compatibility_exceptions_source_product_id_fkey(id, name, model, brands:brands!products_brand_id_fkey(name)), target:products!product_compatibility_exceptions_target_product_id_fkey(id, name, model, brands:brands!products_brand_id_fkey(name))").order("created_at")
    : { data: [], error: null };
  if (rules.error) throw rules.error;
  return {
    rules: rules.data as unknown as ExceptionRow[],
    inverters: inverters.data as unknown as CatalogOption[],
    batteries: batteries.data as unknown as CatalogOption[],
  };
}

const optionLabel = (product: CatalogOption) => `${product.brands?.name ?? "Unknown"} — ${product.name}${product.model ? ` (${product.model})` : ""}`;

export function CompatibilityPage() {
  const client = useQueryClient();
  const query = useQuery({ queryKey: ["compatibility-exceptions"], queryFn: fetchData });
  const [open, setOpen] = useState(false);
  const [sourceProductId, setSourceProductId] = useState("");
  const [targetProductId, setTargetProductId] = useState("");
  const [status, setStatus] = useState<ExceptionRow["status"]>("preferred");
  const [notes, setNotes] = useState("");
  const [message, setMessage] = useState("");

  const save = useMutation({
    mutationFn: async () => {
      if (!sourceProductId || !targetProductId) throw new Error("Select an inverter and battery.");
      const { error } = await supabase.from("product_compatibility_exceptions").upsert({
        source_product_id: sourceProductId,
        target_product_id: targetProductId,
        status,
        notes: notes.trim() || null,
        is_active: true,
      }, { onConflict: "source_product_id,target_product_id" });
      if (error) throw error;
    },
    onSuccess: async () => {
      await client.invalidateQueries({ queryKey: ["compatibility-exceptions"] });
      setOpen(false);
    },
    onError: (reason) => setMessage(errorMessage(reason)),
  });

  const remove = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from("product_compatibility_exceptions").delete().eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => client.invalidateQueries({ queryKey: ["compatibility-exceptions"] }),
  });

  const openForm = () => {
    setSourceProductId("");
    setTargetProductId("");
    setStatus("preferred");
    setNotes("");
    setMessage("");
    setOpen(true);
  };

  return <>
    <PageHeader title="Compatibility Exceptions" description="Compatibility groups handle normal products. Add only preferred, explicitly compatible, or incompatible product exceptions here." action={<button className="btn-primary" onClick={openForm}><FiPlus /> Add exception</button>} />
    <section className="panel overflow-hidden">{query.isLoading ? <LoadingState /> : query.error ? <ErrorState message={query.error.message} /> : !query.data?.rules.length ? <EmptyState label="No exceptions. Products will use voltage class, shared groups, and same-brand defaults." /> : <div className="overflow-x-auto"><table className="min-w-full text-left text-sm"><thead className="bg-slate-50 text-xs uppercase text-slate-500"><tr><th className="px-4 py-3">Inverter</th><th className="px-4 py-3">Battery</th><th className="px-4 py-3">Override</th><th className="px-4 py-3">Notes</th><th className="px-4 py-3">Status</th><th className="px-4 py-3" /></tr></thead><tbody className="divide-y">{query.data.rules.map((rule) => <tr key={rule.id}><td className="px-4 py-3 font-bold">{rule.source ? optionLabel(rule.source) : "—"}</td><td className="px-4 py-3 font-bold">{rule.target ? optionLabel(rule.target) : "—"}</td><td className="px-4 py-3 capitalize">{rule.status}</td><td className="px-4 py-3 text-slate-600">{rule.notes || "—"}</td><td className="px-4 py-3"><StatusBadge active={rule.is_active} /></td><td className="px-4 py-3 text-right"><button className="btn-danger" onClick={() => confirm("Delete this compatibility exception?") && remove.mutate(rule.id)}><FiTrash2 /></button></td></tr>)}</tbody></table></div>}</section>
    <Modal title="Add compatibility exception" open={open} onClose={() => setOpen(false)}>
      {message && <div className="mb-3 rounded-md bg-red-50 p-3 text-sm text-red-700">{message}</div>}
      <div className="space-y-4">
        <Select label="Inverter product" value={sourceProductId} onChange={setSourceProductId} options={query.data?.inverters ?? []} />
        <Select label="Battery product" value={targetProductId} onChange={setTargetProductId} options={query.data?.batteries ?? []} />
        <label className="block text-sm font-bold">Override<select className="field mt-2" value={status} onChange={(event) => setStatus(event.target.value as ExceptionRow["status"])}><option value="preferred">Preferred</option><option value="compatible">Compatible</option><option value="incompatible">Incompatible</option></select></label>
        <label className="block text-sm font-bold">Notes<textarea className="field mt-2 min-h-20" value={notes} onChange={(event) => setNotes(event.target.value)} /></label>
        <div className="flex justify-end gap-3 border-t pt-4"><button className="btn-secondary" onClick={() => setOpen(false)}>Cancel</button><button className="btn-primary" disabled={save.isPending} onClick={() => save.mutate()}>{save.isPending ? "Saving..." : "Save exception"}</button></div>
      </div>
    </Modal>
  </>;
}

function Select({ label, value, onChange, options }: { label: string; value: string; onChange: (value: string) => void; options: CatalogOption[] }) {
  return <label className="block text-sm font-bold">{label}<select className="field mt-2" value={value} onChange={(event) => onChange(event.target.value)}><option value="">Select product</option>{options.map((option) => <option key={option.id} value={option.id}>{optionLabel(option)}</option>)}</select></label>;
}
