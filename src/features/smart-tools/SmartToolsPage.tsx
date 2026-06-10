import { useQuery } from "@tanstack/react-query";
import { useState } from "react";
import { EmptyState, ErrorState, LoadingState } from "../../components/AsyncState";
import { PageHeader } from "../../components/PageHeader";
import { supabase } from "../../lib/supabase";
import { formatDate } from "../../lib/utils";
import type { SmartToolResult, SmartToolType } from "../../types/database";
const tools = ["load_calculator", "roof_space", "roi_calculator", "battery_backup", "solar_size"] as const;
async function fetchResults() { const { data, error } = await supabase.from("smart_tool_results").select("*").order("created_at", { ascending: false }); if (error) throw error; return data as SmartToolResult[]; }
export function SmartToolsPage() {
  const query = useQuery({ queryKey: ["smart-tool-results"], queryFn: fetchResults }); const [tool, setTool] = useState<"all" | SmartToolType>("all");
  const rows = (query.data ?? []).filter((item) => tool === "all" || item.tool_type === tool);
  return <><PageHeader title="Smart Tool Results" description="Inspect saved calculator inputs and outputs from real customer sessions." /><div className="panel mb-4 p-3"><select className="field max-w-56" value={tool} onChange={(e) => setTool(e.target.value as typeof tool)}><option value="all">All tools</option>{tools.map((item) => <option value={item} key={item}>{item.replace(/_/g, " ")}</option>)}</select></div><section className="panel overflow-hidden">{query.isLoading ? <LoadingState /> : query.error ? <ErrorState message={query.error.message} /> : rows.length === 0 ? <EmptyState /> : <div className="overflow-x-auto"><table className="min-w-full text-left text-sm"><thead className="bg-slate-50 text-xs uppercase text-slate-500"><tr><th className="px-4 py-3">Tool</th><th className="px-4 py-3">User</th><th className="px-4 py-3">Input data</th><th className="px-4 py-3">Result data</th><th className="px-4 py-3">Created</th></tr></thead><tbody className="divide-y">{rows.map((item) => <tr key={item.id}><td className="px-4 py-3 font-bold capitalize">{item.tool_type.replace(/_/g, " ")}</td><td className="px-4 py-3 text-xs text-slate-500">{item.user_id}</td><td className="max-w-72 px-4 py-3"><pre className="overflow-auto rounded bg-slate-50 p-2 text-xs">{JSON.stringify(item.input_data, null, 2)}</pre></td><td className="max-w-72 px-4 py-3"><pre className="overflow-auto rounded bg-slate-50 p-2 text-xs">{JSON.stringify(item.result_data, null, 2)}</pre></td><td className="px-4 py-3">{formatDate(item.created_at)}</td></tr>)}</tbody></table></div>}</section></>;
}
