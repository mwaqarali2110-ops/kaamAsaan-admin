export function StatusBadge({ active, label }: { active?: boolean; label?: string }) {
  return (
    <span className={`inline-flex rounded-full px-2 py-1 text-xs font-bold ${active ? "bg-emerald-50 text-emerald-700" : "bg-slate-100 text-slate-600"}`}>
      {label ?? (active ? "Active" : "Inactive")}
    </span>
  );
}
