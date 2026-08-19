export function StatusBadge({ active, label }: { active?: boolean; label?: string }) {
  return (
    <span
      className={`inline-flex rounded-full px-2.5 py-0.5 text-xs font-bold ring-1 ${
        active
          ? "bg-emerald-50 text-emerald-700 ring-emerald-100"
          : "bg-slate-100 text-slate-500 ring-slate-200"
      }`}
    >
      {label ?? (active ? "Active" : "Inactive")}
    </span>
  );
}
