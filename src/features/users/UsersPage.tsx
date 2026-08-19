import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { createColumnHelper, type ColumnDef } from "@tanstack/react-table";
import { useMemo, useState } from "react";
import { ErrorState, LoadingState } from "../../components/AsyncState";
import { DataTable } from "../../components/DataTable";
import { PageHeader } from "../../components/PageHeader";
import { supabase } from "../../lib/supabase";
import { formatDate } from "../../lib/utils";
import type { Profile, UserRole } from "../../types/database";

// ── Role meta ─────────────────────────────────────────────────────────────────

const ROLE_META: Record<UserRole, { label: string; badge: string; avatar: string }> = {
  customer: {
    label: "Customer",
    badge: "bg-blue-50 text-blue-700 ring-1 ring-blue-100",
    avatar: "bg-blue-100 text-blue-700",
  },
  installer: {
    label: "Installer",
    badge: "bg-violet-50 text-violet-700 ring-1 ring-violet-100",
    avatar: "bg-violet-100 text-violet-700",
  },
  admin: {
    label: "Admin",
    badge: "bg-amber-50 text-amber-700 ring-1 ring-amber-100",
    avatar: "bg-amber-100 text-amber-700",
  },
};

// ── Fetch ─────────────────────────────────────────────────────────────────────

async function fetchUsers() {
  const { data, error } = await supabase
    .from("profiles")
    .select("*")
    .order("created_at", { ascending: false });
  if (error) throw error;
  return data as Profile[];
}

// ── Column helper ─────────────────────────────────────────────────────────────

const col = createColumnHelper<Profile>();

// ── Page ──────────────────────────────────────────────────────────────────────

export function UsersPage() {
  const client = useQueryClient();
  const query = useQuery({ queryKey: ["profiles"], queryFn: fetchUsers });
  const [role, setRole] = useState<"all" | UserRole>("all");

  const update = useMutation({
    mutationFn: async ({ id, role }: { id: string; role: UserRole }) => {
      const { error } = await supabase.from("profiles").update({ role }).eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => client.invalidateQueries({ queryKey: ["profiles"] }),
  });

  // Pre-filter by role
  const tableData = useMemo(
    () => (query.data ?? []).filter((p) => role === "all" || p.role === role),
    [query.data, role]
  );

  const columns = useMemo(
    () => [
      col.accessor("full_name", {
        header: "User",
        enableSorting: true,
        cell: ({ row: { original: p } }) => {
          const meta = ROLE_META[p.role] ?? ROLE_META.customer;
          const initial = (p.full_name || "U").trim()[0].toUpperCase();
          return (
            <div className="flex items-center gap-3">
              <div
                className={`flex h-9 w-9 flex-shrink-0 items-center justify-center rounded-full text-sm font-bold ${meta.avatar}`}
              >
                {initial}
              </div>
              <div>
                <p className="font-semibold text-ink">{p.full_name || "Unnamed user"}</p>
                <p className="font-mono text-xs text-slate-400">{p.id.slice(0, 8)}…</p>
              </div>
            </div>
          );
        },
      }),
      col.accessor("phone", {
        header: "Phone",
        enableSorting: true,
        cell: ({ getValue }) => getValue() || <span className="text-slate-400">—</span>,
      }),
      col.accessor("city", {
        header: "City",
        enableSorting: true,
        cell: ({ getValue }) => getValue() || <span className="text-slate-400">—</span>,
      }),
      col.accessor("created_at", {
        header: "Joined",
        enableSorting: true,
        cell: ({ getValue }) => (
          <span className="text-slate-500">{formatDate(getValue())}</span>
        ),
      }),
      col.accessor("role", {
        header: "Role",
        enableSorting: true,
        cell: ({ row: { original: p } }) => {
          const meta = ROLE_META[p.role] ?? ROLE_META.customer;
          return (
            <div className="flex items-center gap-2">
              <span className={`inline-flex rounded-full px-2.5 py-0.5 text-xs font-bold ${meta.badge}`}>
                {meta.label}
              </span>
              <select
                className="field min-w-28 py-1 text-xs"
                value={p.role}
                disabled={update.isPending}
                onChange={(e) =>
                  update.mutate({ id: p.id, role: e.target.value as UserRole })
                }
                onClick={(e) => e.stopPropagation()}
              >
                <option value="customer">Customer</option>
                <option value="installer">Installer</option>
                <option value="admin">Admin</option>
              </select>
            </div>
          );
        },
      }),
    ] as ColumnDef<Profile, unknown>[],
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [update.isPending]
  );

  return (
    <>
      <PageHeader
        title="Users"
        description="Manage customers, installers, and administrator accounts."
      />

      {query.isLoading ? (
        <LoadingState />
      ) : query.error ? (
        <ErrorState message={query.error.message} />
      ) : (
        <DataTable
          columns={columns}
          data={tableData}
          searchPlaceholder="Search name, phone, or city…"
          defaultPageSize={25}
          toolbar={
            <select
              className="field w-auto min-w-36 py-2 text-sm"
              value={role}
              onChange={(e) => setRole(e.target.value as typeof role)}
            >
              <option value="all">All roles</option>
              <option value="customer">Customers</option>
              <option value="installer">Installers</option>
              <option value="admin">Admins</option>
            </select>
          }
        />
      )}
    </>
  );
}
