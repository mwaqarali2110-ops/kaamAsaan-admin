import { useQuery } from "@tanstack/react-query";
import { EmptyState, ErrorState, LoadingState } from "../../components/AsyncState";
import { PageHeader } from "../../components/PageHeader";
import { StatusBadge } from "../../components/StatusBadge";
import { supabase } from "../../lib/supabase";
import type { CompatibilityRule } from "../../types/database";
async function fetchCompatibility() { const { data, error } = await supabase.from("product_compatibility").select("id, notes, is_active, inverter:brands!product_compatibility_inverter_brand_id_fkey(id, name), battery:brands!product_compatibility_compatible_battery_brand_id_fkey(id, name)").order("created_at"); if (error) throw error; return data as unknown as CompatibilityRule[]; }
export function CompatibilityPage() {
  const query = useQuery({ queryKey: ["compatibility"], queryFn: fetchCompatibility });
  return <><PageHeader title="Product Compatibility" description="Review approved inverter-to-battery brand relationships." /><section className="panel overflow-hidden">{query.isLoading ? <LoadingState /> : query.error ? <ErrorState message={query.error.message} /> : !query.data?.length ? <EmptyState /> : <div className="overflow-x-auto"><table className="min-w-full text-left text-sm"><thead className="bg-slate-50 text-xs uppercase text-slate-500"><tr><th className="px-4 py-3">Inverter brand</th><th className="px-4 py-3">Compatible battery brand</th><th className="px-4 py-3">Notes</th><th className="px-4 py-3">Status</th></tr></thead><tbody className="divide-y">{query.data.map((rule) => <tr key={rule.id}><td className="px-4 py-3 font-bold">{rule.inverter?.name || "—"}</td><td className="px-4 py-3 font-bold">{rule.battery?.name || "—"}</td><td className="px-4 py-3 text-slate-600">{rule.notes || "—"}</td><td className="px-4 py-3"><StatusBadge active={rule.is_active} /></td></tr>)}</tbody></table></div>}</section></>;
}
