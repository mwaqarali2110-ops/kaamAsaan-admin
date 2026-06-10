import { useQuery } from "@tanstack/react-query";
import { FiBox, FiCheckCircle, FiClock, FiShoppingBag, FiUserCheck, FiUsers } from "react-icons/fi";
import { ErrorState, LoadingState } from "../../components/AsyncState";
import { PageHeader } from "../../components/PageHeader";
import { supabase } from "../../lib/supabase";
import { bookingStatusMeta } from "../bookings/bookingStatus";
import type { BookingStatus } from "../../types/database";

type CountResponse = {
  count: number | null;
  error: { message?: string; code?: string; details?: string; hint?: string } | null;
};

type OverviewData = {
  users: number;
  customers: number;
  installers: number;
  products: number;
  bookings: number;
  pendingBookings: number;
  completedBookings: number;
  bookingStatusCounts: Record<string, number>;
  errors: string[];
};

const completedStatusKeys = new Set(["survey_completed", "installation_completed", "completed"]);

function readableError(label: string, error: unknown) {
  if (error && typeof error === "object" && "message" in error) {
    const message = String((error as { message?: unknown }).message ?? "").trim();
    const code = "code" in error ? String((error as { code?: unknown }).code ?? "").trim() : "";
    return `${label}: ${message || "Supabase query failed"}${code ? ` (${code})` : ""}`;
  }
  if (error instanceof Error) return `${label}: ${error.message}`;
  return `${label}: Supabase query failed`;
}

async function safeCount(label: string, request: PromiseLike<CountResponse>) {
  try {
    const { count, error } = await request;
    if (error) {
      console.error(`[dashboard] ${label} query failed`, error);
      return { value: 0, error: readableError(label, error) };
    }
    return { value: count ?? 0, error: null };
  } catch (reason) {
    console.error(`[dashboard] ${label} query crashed`, reason);
    return { value: 0, error: readableError(label, reason) };
  }
}

async function safeBookingStatusCounts() {
  try {
    const { data, error } = await supabase.from("survey_bookings").select("status");
    if (error) {
      console.error("[dashboard] Booking status distribution query failed", error);
      return { counts: {} as Record<string, number>, error: readableError("Booking status distribution", error) };
    }

    const counts = (data ?? []).reduce<Record<string, number>>((accumulator, row: { status: string | null }) => {
      const status = row.status || "unknown";
      accumulator[status] = (accumulator[status] ?? 0) + 1;
      return accumulator;
    }, {});

    return { counts, error: null };
  } catch (reason) {
    console.error("[dashboard] Booking status distribution query crashed", reason);
    return { counts: {} as Record<string, number>, error: readableError("Booking status distribution", reason) };
  }
}

async function fetchOverview() {
  const [
    users,
    customers,
    installers,
    products,
    bookings,
    bookingStatuses,
  ] = await Promise.all([
    safeCount("Total users", supabase.from("profiles").select("id", { count: "exact", head: true })),
    safeCount("Total customers", supabase.from("profiles").select("id", { count: "exact", head: true }).eq("role", "customer")),
    safeCount("Total installers", supabase.from("profiles").select("id", { count: "exact", head: true }).eq("role", "installer")),
    safeCount("Total products", supabase.from("products").select("id", { count: "exact", head: true })),
    safeCount("Total survey bookings", supabase.from("survey_bookings").select("id", { count: "exact", head: true })),
    safeBookingStatusCounts(),
  ]);

  const bookingStatusCounts = bookingStatuses.counts;
  const pendingBookings = bookingStatusCounts.pending ?? 0;
  const completedBookings = Object.entries(bookingStatusCounts).reduce((total, [status, count]) => (
    completedStatusKeys.has(status) ? total + count : total
  ), 0);
  const errors = [users, customers, installers, products, bookings, bookingStatuses]
    .map((item) => item.error)
    .filter((message): message is string => Boolean(message));

  return {
    users: users.value,
    customers: customers.value,
    installers: installers.value,
    products: products.value,
    bookings: bookings.value,
    pendingBookings,
    completedBookings,
    bookingStatusCounts,
    errors,
  } satisfies OverviewData;
}

function statusLabel(status: string) {
  return bookingStatusMeta[status as BookingStatus]?.label ?? status.replace(/_/g, " ");
}

export function DashboardPage() {
  const query = useQuery({ queryKey: ["overview"], queryFn: fetchOverview });
  if (query.isLoading) return <LoadingState />;
  if (query.error) return <ErrorState message={query.error.message} />;
  const overview = query.data;
  const cards = [
    ["Total Users", overview?.users ?? 0, FiUsers, "bg-blue-50 text-blue-600"],
    ["Total Customers", overview?.customers ?? 0, FiUserCheck, "bg-emerald-50 text-emerald-600"],
    ["Total Installers", overview?.installers ?? 0, FiUsers, "bg-violet-50 text-violet-600"],
    ["Total Products", overview?.products ?? 0, FiShoppingBag, "bg-amber-50 text-amber-600"],
    ["Survey Bookings", overview?.bookings ?? 0, FiBox, "bg-cyan-50 text-cyan-600"],
    ["Pending Bookings", overview?.pendingBookings ?? 0, FiClock, "bg-orange-50 text-orange-600"],
    ["Completed Bookings", overview?.completedBookings ?? 0, FiCheckCircle, "bg-green-50 text-green-600"],
  ] as const;
  const statusRows = Object.entries(overview?.bookingStatusCounts ?? {}).sort(([left], [right]) => left.localeCompare(right));

  return (
    <>
      <PageHeader title="Dashboard Overview" description="A live operational view of your KaamAsaan platform." />
      {overview?.errors.length ? (
        <section className="mb-4 rounded-xl border border-amber-200 bg-amber-50 p-4 text-sm text-amber-900">
          <div className="font-extrabold">Some overview metrics could not be refreshed.</div>
          <ul className="mt-2 list-disc space-y-1 pl-5">
            {overview.errors.map((message) => <li key={message}>{message}</li>)}
          </ul>
        </section>
      ) : null}
      <section className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        {cards.map(([label, value, Icon, colors]) => (
          <article className="panel p-5" key={label}>
            <div className={`flex h-10 w-10 items-center justify-center rounded-md ${colors}`}><Icon /></div>
            <div className="mt-5 text-3xl font-black text-ink">{value}</div>
            <div className="mt-1 text-sm font-semibold text-slate-500">{label}</div>
          </article>
        ))}
      </section>
      <section className="panel mt-6 p-5">
        <h2 className="text-base font-extrabold text-ink">Booking status distribution</h2>
        <p className="mt-2 text-sm text-slate-500">Counts are calculated from the live status values currently stored in Supabase.</p>
        {statusRows.length ? (
          <div className="mt-4 grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
            {statusRows.map(([status, count]) => (
              <div className="rounded-xl border border-slate-100 bg-slate-50 px-4 py-3" key={status}>
                <div className="text-2xl font-black text-ink">{count}</div>
                <div className="mt-1 text-xs font-bold capitalize text-slate-500">{statusLabel(status)}</div>
              </div>
            ))}
          </div>
        ) : (
          <div className="mt-4 rounded-xl border border-slate-100 bg-slate-50 px-4 py-3 text-sm font-semibold text-slate-500">
            No booking statuses found yet.
          </div>
        )}
      </section>
      <section className="panel mt-6 p-5">
        <h2 className="text-base font-extrabold text-ink">Operations workspace</h2>
        <p className="mt-2 max-w-3xl text-sm leading-6 text-slate-500">
          This dashboard reads your live Supabase tables. Use the navigation to manage catalog records, review customers, process survey bookings, and inspect saved calculator results.
        </p>
      </section>
    </>
  );
}
