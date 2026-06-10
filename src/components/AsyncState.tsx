import { FiAlertTriangle, FiInbox, FiLoader } from "react-icons/fi";

export function LoadingState({ label = "Loading data..." }: { label?: string }) {
  return (
    <div className="flex min-h-40 items-center justify-center gap-2 text-sm font-medium text-slate-500">
      <FiLoader className="animate-spin" /> {label}
    </div>
  );
}

export function ErrorState({ message }: { message?: string | null }) {
  const displayMessage = message?.trim() || "Unable to load this data. Please try again or check the console for details.";

  return (
    <div className="flex min-h-32 items-center justify-center gap-2 rounded-lg border border-red-100 bg-red-50 px-4 text-sm font-medium text-red-700">
      <FiAlertTriangle /> {displayMessage}
    </div>
  );
}

export function EmptyState({ label = "No records found." }: { label?: string }) {
  return (
    <div className="flex min-h-32 items-center justify-center gap-2 text-sm font-medium text-slate-500">
      <FiInbox /> {label}
    </div>
  );
}
