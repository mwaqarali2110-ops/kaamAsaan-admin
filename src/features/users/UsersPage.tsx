import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { FiSearch } from "react-icons/fi";
import { useState } from "react";
import { EmptyState, ErrorState, LoadingState } from "../../components/AsyncState";
import { PageHeader } from "../../components/PageHeader";
import { supabase } from "../../lib/supabase";
import { formatDate } from "../../lib/utils";
import type { Profile, UserRole } from "../../types/database";

async function fetchUsers() { const { data, error } = await supabase.from("profiles").select("*").order("created_at", { ascending: false }); if (error) throw error; return data as Profile[]; }
export function UsersPage() {
  const client = useQueryClient(); const query = useQuery({ queryKey: ["profiles"], queryFn: fetchUsers });
  const [search, setSearch] = useState(""); const [role, setRole] = useState<"all" | UserRole>("all");
  const update = useMutation({ mutationFn: async ({ id, role }: { id: string; role: UserRole }) => { const { error } = await supabase.from("profiles").update({ role }).eq("id", id); if (error) throw error; }, onSuccess: () => client.invalidateQueries({ queryKey: ["profiles"] }) });
  const filtered = (query.data ?? []).filter((profile) => (role === "all" || profile.role === role) && `${profile.full_name ?? ""} ${profile.phone ?? ""} ${profile.city ?? ""}`.toLowerCase().includes(search.toLowerCase()));
  return <><PageHeader title="Users Management" description="Review customers, installers, and administrator access." /><div className="panel mb-4 flex flex-col gap-3 p-3 sm:flex-row"><label className="relative flex-1"><FiSearch className="absolute left-3 top-3 text-slate-400" /><input className="field pl-9" placeholder="Search name, phone, or city" value={search} onChange={(e) => setSearch(e.target.value)} /></label><select className="field sm:w-48" value={role} onChange={(e) => setRole(e.target.value as typeof role)}><option value="all">All roles</option><option value="customer">Customer</option><option value="installer">Installer</option><option value="admin">Admin</option></select></div><section className="panel overflow-hidden">{query.isLoading ? <LoadingState /> : query.error ? <ErrorState message={query.error.message} /> : filtered.length === 0 ? <EmptyState /> : <div className="overflow-x-auto"><table className="min-w-full text-left text-sm"><thead className="bg-slate-50 text-xs uppercase text-slate-500"><tr><th className="px-4 py-3">User</th><th className="px-4 py-3">Phone</th><th className="px-4 py-3">City</th><th className="px-4 py-3">Created</th><th className="px-4 py-3">Role</th></tr></thead><tbody className="divide-y divide-slate-100">{filtered.map((profile) => <tr key={profile.id}><td className="px-4 py-3"><div className="font-bold">{profile.full_name || "Unnamed user"}</div><div className="text-xs text-slate-400">{profile.id}</div></td><td className="px-4 py-3">{profile.phone || "—"}</td><td className="px-4 py-3">{profile.city || "—"}</td><td className="px-4 py-3">{formatDate(profile.created_at)}</td><td className="px-4 py-3"><select className="field min-w-28 py-1.5" value={profile.role} onChange={(e) => update.mutate({ id: profile.id, role: e.target.value as UserRole })}><option value="customer">Customer</option><option value="installer">Installer</option><option value="admin">Admin</option></select></td></tr>)}</tbody></table></div>}</section></>;
}
