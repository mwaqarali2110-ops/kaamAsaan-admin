import {
  type ColumnDef,
  type PaginationState,
  type SortingState,
  type VisibilityState,
  flexRender,
  getCoreRowModel,
  getFilteredRowModel,
  getPaginationRowModel,
  getSortedRowModel,
  useReactTable,
} from "@tanstack/react-table";
import { useEffect, useRef, useState } from "react";
import {
  FiChevronDown,
  FiChevronLeft,
  FiChevronRight,
  FiChevronsLeft,
  FiChevronsRight,
  FiChevronUp,
  FiColumns,
  FiSearch,
} from "react-icons/fi";
import { EmptyState, ErrorState, LoadingState } from "./AsyncState";

// ── Props ─────────────────────────────────────────────────────────────────────

interface DataTableProps<TData> {
  /** Column definitions created with createColumnHelper or ColumnDef[] */
  columns: ColumnDef<TData, unknown>[];
  /** The (possibly pre-filtered) data rows */
  data: TData[];
  isLoading?: boolean;
  error?: string | null;
  /** Placeholder text for the search input */
  searchPlaceholder?: string;
  /** Extra controls rendered between the search box and the column toggle */
  toolbar?: React.ReactNode;
  /** Initial rows per page (default 10) */
  defaultPageSize?: number;
  /** Called when a row is clicked */
  onRowClick?: (row: TData) => void;
  /** Optional row class override */
  rowClassName?: (row: TData) => string;
}

// ── Sort icon ─────────────────────────────────────────────────────────────────

function SortIcon({ dir }: { dir: "asc" | "desc" | false }) {
  return (
    <span className="ml-1 inline-flex flex-col">
      <FiChevronUp
        size={10}
        className={dir === "asc" ? "text-ink" : "text-slate-300"}
      />
      <FiChevronDown
        size={10}
        className={dir === "desc" ? "text-ink" : "text-slate-300"}
      />
    </span>
  );
}

// ── Pagination button ─────────────────────────────────────────────────────────

function PageBtn({
  onClick,
  disabled,
  children,
}: {
  onClick: () => void;
  disabled: boolean;
  children: React.ReactNode;
}) {
  return (
    <button
      onClick={onClick}
      disabled={disabled}
      className="flex h-7 w-7 items-center justify-center rounded text-slate-500 transition hover:bg-slate-100 hover:text-ink disabled:cursor-not-allowed disabled:opacity-30"
    >
      {children}
    </button>
  );
}

// ── DataTable ─────────────────────────────────────────────────────────────────

export function DataTable<TData>({
  columns,
  data,
  isLoading,
  error,
  searchPlaceholder = "Search…",
  toolbar,
  defaultPageSize = 10,
  onRowClick,
  rowClassName,
}: DataTableProps<TData>) {
  const [sorting, setSorting] = useState<SortingState>([]);
  const [globalFilter, setGlobalFilter] = useState("");
  const [columnVisibility, setColumnVisibility] = useState<VisibilityState>({});
  const [pagination, setPagination] = useState<PaginationState>({
    pageIndex: 0,
    pageSize: defaultPageSize,
  });
  const [colVisOpen, setColVisOpen] = useState(false);
  const colVisRef = useRef<HTMLDivElement>(null);

  // Close column-visibility panel on outside click
  useEffect(() => {
    if (!colVisOpen) return;
    function onDown(e: MouseEvent) {
      if (colVisRef.current && !colVisRef.current.contains(e.target as Node)) {
        setColVisOpen(false);
      }
    }
    document.addEventListener("mousedown", onDown);
    return () => document.removeEventListener("mousedown", onDown);
  }, [colVisOpen]);

  // Reset to page 0 when the search term or data changes
  useEffect(() => {
    setPagination((p) => ({ ...p, pageIndex: 0 }));
  }, [globalFilter, data]);

  const table = useReactTable({
    data,
    columns,
    state: { sorting, globalFilter, columnVisibility, pagination },
    onSortingChange: setSorting,
    onGlobalFilterChange: setGlobalFilter,
    onColumnVisibilityChange: setColumnVisibility,
    onPaginationChange: setPagination,
    getCoreRowModel: getCoreRowModel(),
    getSortedRowModel: getSortedRowModel(),
    getFilteredRowModel: getFilteredRowModel(),
    getPaginationRowModel: getPaginationRowModel(),
    autoResetPageIndex: false,
  });

  const pageRows = table.getRowModel().rows;
  const filtered = table.getFilteredRowModel().rows.length;
  const total = data.length;
  const { pageIndex, pageSize } = table.getState().pagination;
  const pageCount = table.getPageCount();
  const from = filtered === 0 ? 0 : pageIndex * pageSize + 1;
  const to = Math.min((pageIndex + 1) * pageSize, filtered);

  // Columns eligible for visibility toggling (skip utility / underscore-prefixed columns)
  const SKIP_IDS = new Set(["actions", "select"]);
  const toggleableCols = table
    .getAllLeafColumns()
    .filter((c) => !SKIP_IDS.has(c.id) && !c.id.startsWith("_"));

  return (
    <div className="panel overflow-hidden">
      {/* ── Toolbar ── */}
      <div className="flex flex-wrap items-center gap-2.5 border-b border-slate-100 p-3">
        {/* Global search */}
        <div className="relative min-w-48 flex-1">
          <FiSearch className="absolute left-3 top-1/2 -translate-y-1/2 text-sm text-slate-400" />
          <input
            className="field pl-9"
            placeholder={searchPlaceholder}
            value={globalFilter}
            onChange={(e) => setGlobalFilter(e.target.value)}
          />
        </div>

        {/* Injected page-level controls (category select, role select, etc.) */}
        {toolbar}

        {/* Column visibility */}
        <div className="relative" ref={colVisRef}>
          <button
            onClick={() => setColVisOpen((v) => !v)}
            className="btn-secondary flex items-center gap-1.5 px-3 py-2 text-xs"
          >
            <FiColumns size={13} />
            Columns
            <FiChevronDown
              size={11}
              className={`transition-transform ${colVisOpen ? "rotate-180" : ""}`}
            />
          </button>
          {colVisOpen && (
            <div className="absolute right-0 top-full z-30 mt-1.5 w-48 overflow-hidden rounded-lg border border-slate-200 bg-white shadow-soft">
              <div className="border-b border-slate-100 px-3 py-2">
                <p className="text-xs font-semibold text-slate-500">Toggle columns</p>
              </div>
              <div className="p-1.5">
                {/* Toggle all */}
                <label className="flex cursor-pointer items-center gap-2 rounded px-2 py-1.5 text-xs font-semibold text-slate-600 hover:bg-slate-50">
                  <input
                    type="checkbox"
                    checked={table.getIsAllColumnsVisible()}
                    onChange={table.getToggleAllColumnsVisibilityHandler()}
                  />
                  All columns
                </label>
                <div className="my-1 border-t border-slate-100" />
                {toggleableCols.map((col) => {
                  const hdr = col.columnDef.header;
                  const label =
                    typeof hdr === "string"
                      ? hdr
                      : col.id.replace(/_/g, " ");
                  return (
                    <label
                      key={col.id}
                      className="flex cursor-pointer items-center gap-2 rounded px-2 py-1.5 text-xs hover:bg-slate-50"
                    >
                      <input
                        type="checkbox"
                        checked={col.getIsVisible()}
                        onChange={col.getToggleVisibilityHandler()}
                      />
                      <span className="capitalize text-slate-700">{label}</span>
                    </label>
                  );
                })}
              </div>
            </div>
          )}
        </div>

        {/* Rows per page */}
        <select
          className="field w-auto py-2 text-xs"
          value={pageSize}
          onChange={(e) =>
            setPagination({ pageIndex: 0, pageSize: Number(e.target.value) })
          }
        >
          {[10, 25, 50, 100].map((n) => (
            <option key={n} value={n}>{n} / page</option>
          ))}
        </select>

        {/* Row count */}
        {!isLoading && !error && (
          <span className="hidden text-xs text-slate-400 sm:block">
            {filtered !== total
              ? `${filtered} of ${total} rows`
              : `${total} row${total !== 1 ? "s" : ""}`}
          </span>
        )}
      </div>

      {/* ── Table body ── */}
      {isLoading ? (
        <LoadingState />
      ) : error ? (
        <ErrorState message={error} />
      ) : pageRows.length === 0 ? (
        <EmptyState />
      ) : (
        <div className="overflow-x-auto">
          <table className="min-w-full text-left text-sm">
            <thead className="bg-slate-50 text-xs uppercase tracking-wide text-slate-500">
              {table.getHeaderGroups().map((hg) => (
                <tr key={hg.id}>
                  {hg.headers.map((header) => {
                    const canSort = header.column.getCanSort();
                    const sorted = header.column.getIsSorted();
                    return (
                      <th
                        key={header.id}
                        colSpan={header.colSpan}
                        className={`whitespace-nowrap px-4 py-3 ${canSort ? "cursor-pointer select-none" : ""}`}
                        onClick={canSort ? header.column.getToggleSortingHandler() : undefined}
                      >
                        <div className="flex items-center gap-0.5">
                          {header.isPlaceholder
                            ? null
                            : flexRender(header.column.columnDef.header, header.getContext())}
                          {canSort && <SortIcon dir={sorted} />}
                        </div>
                      </th>
                    );
                  })}
                </tr>
              ))}
            </thead>
            <tbody className="divide-y divide-slate-100">
              {pageRows.map((row) => {
                const extra = rowClassName?.(row.original) ?? "";
                return (
                  <tr
                    key={row.id}
                    onClick={onRowClick ? () => onRowClick(row.original) : undefined}
                    className={`transition-colors hover:bg-slate-50 ${onRowClick ? "cursor-pointer" : ""} ${extra}`}
                  >
                    {row.getVisibleCells().map((cell) => (
                      <td key={cell.id} className="px-4 py-3">
                        {flexRender(cell.column.columnDef.cell, cell.getContext())}
                      </td>
                    ))}
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}

      {/* ── Pagination footer ── */}
      {!isLoading && !error && filtered > 0 && (
        <div className="flex items-center justify-between border-t border-slate-100 px-4 py-2.5">
          <p className="text-xs text-slate-500">
            {from}–{to} of {filtered} row{filtered !== 1 ? "s" : ""}
          </p>
          <div className="flex items-center gap-0.5">
            <PageBtn onClick={() => table.setPageIndex(0)} disabled={!table.getCanPreviousPage()}>
              <FiChevronsLeft size={14} />
            </PageBtn>
            <PageBtn onClick={() => table.previousPage()} disabled={!table.getCanPreviousPage()}>
              <FiChevronLeft size={14} />
            </PageBtn>
            <span className="px-2 text-xs font-semibold text-slate-600">
              {pageIndex + 1} / {Math.max(pageCount, 1)}
            </span>
            <PageBtn onClick={() => table.nextPage()} disabled={!table.getCanNextPage()}>
              <FiChevronRight size={14} />
            </PageBtn>
            <PageBtn
              onClick={() => table.setPageIndex(pageCount - 1)}
              disabled={!table.getCanNextPage()}
            >
              <FiChevronsRight size={14} />
            </PageBtn>
          </div>
        </div>
      )}
    </div>
  );
}
