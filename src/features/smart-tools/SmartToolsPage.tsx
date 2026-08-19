import { useQuery } from "@tanstack/react-query";
import { createColumnHelper, type ColumnDef } from "@tanstack/react-table";
import { useMemo, useState } from "react";
import { FiActivity, FiX } from "react-icons/fi";
import { DataTable } from "../../components/DataTable";
import { PageHeader } from "../../components/PageHeader";
import { supabase } from "../../lib/supabase";
import { formatDate } from "../../lib/utils";
import type { SmartToolResult, SmartToolType } from "../../types/database";

// ── Tool meta ─────────────────────────────────────────────────────────────────

const tools = [
  "load_calculator",
  "roof_space",
  "roi_calculator",
  "battery_backup",
  "solar_size",
] as const;

const TOOL_META: Record<SmartToolType, { label: string; badge: string; icon: string }> = {
  load_calculator: {
    label: "Load Calculator",
    badge: "bg-amber-50 text-amber-700 ring-1 ring-amber-100",
    icon: "bg-amber-100 text-amber-700",
  },
  roof_space: {
    label: "Roof Space",
    badge: "bg-sky-50 text-sky-700 ring-1 ring-sky-100",
    icon: "bg-sky-100 text-sky-700",
  },
  roi_calculator: {
    label: "ROI Calculator",
    badge: "bg-green-50 text-green-700 ring-1 ring-green-100",
    icon: "bg-green-100 text-green-700",
  },
  battery_backup: {
    label: "Battery Backup",
    badge: "bg-violet-50 text-violet-700 ring-1 ring-violet-100",
    icon: "bg-violet-100 text-violet-700",
  },
  solar_size: {
    label: "Solar Size",
    badge: "bg-orange-50 text-orange-700 ring-1 ring-orange-100",
    icon: "bg-orange-100 text-orange-700",
  },
};

// ── Data fetching ─────────────────────────────────────────────────────────────

async function fetchResults() {
  const { data, error } = await supabase
    .from("smart_tool_results")
    .select("*")
    .order("created_at", { ascending: false });
  if (error) throw error;
  return data as SmartToolResult[];
}

// ── Sub-components ────────────────────────────────────────────────────────────

function JsonTable({ data }: { data: Record<string, unknown> }) {
  const entries = Object.entries(data);
  if (!entries.length) return <p className="text-xs text-slate-400">No data.</p>;
  return (
    <div className="overflow-hidden rounded-lg border border-slate-100">
      <table className="w-full text-xs">
        <tbody className="divide-y divide-slate-50">
          {entries.map(([key, value]) => (
            <tr key={key} className="even:bg-slate-50">
              <td className="w-2/5 px-3 py-2 font-medium capitalize text-slate-500">
                {key.replace(/_/g, " ")}
              </td>
              <td className="px-3 py-2 text-slate-800">
                {value === null || value === undefined ? (
                  <span className="text-slate-400">—</span>
                ) : typeof value === "object" ? (
                  <pre className="whitespace-pre-wrap font-mono text-xs text-slate-600">
                    {JSON.stringify(value, null, 2)}
                  </pre>
                ) : (
                  String(value)
                )}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function DetailModal({ result, onClose }: { result: SmartToolResult; onClose: () => void }) {
  const meta = TOOL_META[result.tool_type];
  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4"
      onClick={onClose}
    >
      <div
        className="max-h-[90vh] w-full max-w-2xl overflow-y-auto rounded-xl bg-white shadow-2xl"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between border-b p-5">
          <div className="flex items-center gap-3">
            <div className={`flex h-9 w-9 items-center justify-center rounded-lg ${meta.icon}`}>
              <FiActivity size={16} />
            </div>
            <div>
              <span className={`inline-flex rounded-full px-2.5 py-0.5 text-xs font-bold ${meta.badge}`}>
                {meta.label}
              </span>
              <p className="mt-0.5 text-xs text-slate-400">{formatDate(result.created_at)}</p>
            </div>
          </div>
          <button onClick={onClose} className="rounded p-1 text-slate-400 hover:bg-slate-100 hover:text-slate-600">
            <FiX size={18} />
          </button>
        </div>

        <div className="space-y-5 p-5">
          <div>
            <p className="mb-1 text-xs font-semibold uppercase tracking-wide text-slate-400">Session ID</p>
            <p className="font-mono text-xs text-slate-500">{result.user_id}</p>
          </div>
          <div>
            <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-slate-400">Input Data</p>
            <JsonTable data={result.input_data} />
          </div>
          <div>
            <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-slate-400">Result Data</p>
            <JsonTable data={result.result_data} />
          </div>
        </div>
      </div>
    </div>
  );
}

// ── Column helper ─────────────────────────────────────────────────────────────

const col = createColumnHelper<SmartToolResult>();

// ── Page ──────────────────────────────────────────────────────────────────────

export function SmartToolsPage() {
  const query = useQuery({ queryKey: ["smart-tool-results"], queryFn: fetchResults });
  const [tool, setTool] = useState<"all" | SmartToolType>("all");
  const [selected, setSelected] = useState<SmartToolResult | null>(null);

  // Pre-filter by tool type; DataTable handles search & pagination
  const tableData = useMemo(
    () => (query.data ?? []).filter((item) => tool === "all" || item.tool_type === tool),
    [query.data, tool]
  );

  const columns = useMemo(
    () => [
      col.accessor("tool_type", {
        header: "Tool",
        enableSorting: true,
        cell: ({ getValue }) => {
          const meta = TOOL_META[getValue()];
          return (
            <div className="flex items-center gap-2">
              <span className={`flex h-7 w-7 flex-shrink-0 items-center justify-center rounded-md ${meta.icon}`}>
                <FiActivity size={13} />
              </span>
              <span className={`inline-flex rounded-full px-2.5 py-0.5 text-xs font-bold ${meta.badge}`}>
                {meta.label}
              </span>
            </div>
          );
        },
      }),
      col.accessor("user_id", {
        header: "Session",
        enableSorting: false,
        cell: ({ getValue }) => (
          <p className="font-mono text-xs text-slate-500">{getValue().slice(0, 8)}…</p>
        ),
      }),
      col.display({
        id: "result_summary",
        header: "Result Summary",
        cell: ({ row: { original: item } }) => {
          const entries = Object.entries(item.result_data).slice(0, 2);
          if (!entries.length) return <span className="text-xs text-slate-400">No results</span>;
          return (
            <span className="text-xs text-slate-500">
              {entries.map(([k, v]) => `${k.replace(/_/g, " ")}: ${v}`).join(" · ")}
            </span>
          );
        },
      }),
      col.accessor("created_at", {
        header: "Date",
        enableSorting: true,
        cell: ({ getValue }) => (
          <span className="text-sm text-slate-500">{formatDate(getValue())}</span>
        ),
      }),
      col.display({
        id: "fields",
        header: "Fields",
        cell: ({ row: { original: item } }) => {
          const inputCount = Object.keys(item.input_data).length;
          const resultCount = Object.keys(item.result_data).length;
          return (
            <div className="flex gap-1.5 text-xs">
              <span className="rounded bg-blue-50 px-1.5 py-0.5 font-semibold text-blue-600">
                {inputCount} in
              </span>
              <span className="rounded bg-emerald-50 px-1.5 py-0.5 font-semibold text-emerald-600">
                {resultCount} out
              </span>
            </div>
          );
        },
      }),
    ] as ColumnDef<SmartToolResult, unknown>[],
    []
  );

  return (
    <>
      <PageHeader
        title="Smart Tool Results"
        description="Inspect saved calculator inputs and outputs from real customer sessions."
      />

      <DataTable
        columns={columns}
        data={tableData}
        isLoading={query.isLoading}
        error={query.error?.message}
        searchPlaceholder="Search tool or session…"
        onRowClick={setSelected}
        toolbar={
          <select
            className="field w-auto min-w-44 py-2 text-sm"
            value={tool}
            onChange={(e) => setTool(e.target.value as typeof tool)}
          >
            <option value="all">All tools</option>
            {tools.map((item) => (
              <option value={item} key={item}>{TOOL_META[item].label}</option>
            ))}
          </select>
        }
      />

      {selected && (
        <DetailModal result={selected} onClose={() => setSelected(null)} />
      )}
    </>
  );
}
