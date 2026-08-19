import { useQuery } from "@tanstack/react-query";
import { useState } from "react";
import { Link } from "react-router-dom";
import {
  FiActivity,
  FiArrowRight,
  FiBox,
  FiCheckCircle,
  FiClock,
  FiLink,
  FiLayers,
  FiRefreshCw,
  FiShoppingBag,
  FiTrendingUp,
  FiUserCheck,
  FiUsers,
  FiZap,
} from "react-icons/fi";
import { ErrorState, LoadingState } from "../../components/AsyncState";
import { PageHeader } from "../../components/PageHeader";
import { supabase } from "../../lib/supabase";
import { formatDate } from "../../lib/utils";
import { bookingStatuses, bookingStatusMeta, legacyBookingStatus } from "../bookings/bookingStatus";
import type { BookingStatus, SurveyBooking } from "../../types/database";

// ── Types ─────────────────────────────────────────────────────────────────────

type Period = "today" | "7d" | "30d" | "all";

type OverviewData = {
  users: number;
  customers: number;
  installers: number;
  products: number;
  bookings: number;
  pendingBookings: number;
  completedBookings: number;
  installationsDone: number;
  conversionRate: number;
  bookingStatusCounts: Record<string, number>;
  recentBookings: SurveyBooking[];
  errors: string[];
};

// ── Constants ─────────────────────────────────────────────────────────────────

const PERIODS: { label: string; value: Period }[] = [
  { label: "Today", value: "today" },
  { label: "7 Days", value: "7d" },
  { label: "30 Days", value: "30d" },
  { label: "All Time", value: "all" },
];

const COMPLETION_STATUSES = new Set(["survey_completed", "installation_completed", "completed"]);

const STATUS_BAR_COLOR: Record<string, string> = {
  pending: "bg-amber-400",
  confirmed: "bg-blue-500",
  survey_scheduled: "bg-sky-500",
  survey_completed: "bg-emerald-500",
  proposal_preparation: "bg-orange-500",
  quotation_shared: "bg-violet-500",
  installation_planning: "bg-teal-500",
  installation_completed: "bg-green-600",
  cancelled: "bg-red-400",
  completed: "bg-emerald-400",
};

const QUICK_ACTIONS = [
  { to: "/bookings", label: "Manage Bookings", desc: "Update statuses & process requests", icon: FiBox, iconBg: "bg-blue-500" },
  { to: "/products", label: "Product Catalog", desc: "Add or edit solar products", icon: FiShoppingBag, iconBg: "bg-amber-500" },
  { to: "/brands", label: "Brands", desc: "Manage manufacturers & logos", icon: FiLayers, iconBg: "bg-violet-500" },
  { to: "/users", label: "Users", desc: "View customers & installers", icon: FiUsers, iconBg: "bg-teal-500" },
  { to: "/smart-tools", label: "Smart Tools", desc: "Review calculator results", icon: FiActivity, iconBg: "bg-orange-500" },
  { to: "/compatibility", label: "Compatibility", desc: "Inverter ↔ battery pairings", icon: FiLink, iconBg: "bg-emerald-600" },
];

// ── Data fetching ─────────────────────────────────────────────────────────────

function periodStart(period: Period): string | null {
  if (period === "all") return null;
  const d = new Date();
  if (period === "today") { d.setHours(0, 0, 0, 0); return d.toISOString(); }
  d.setDate(d.getDate() - (period === "7d" ? 7 : 30));
  d.setHours(0, 0, 0, 0);
  return d.toISOString();
}

function readableError(label: string, err: unknown): string {
  if (err && typeof err === "object" && "message" in err) {
    const msg = String((err as { message?: unknown }).message ?? "").trim();
    const code = "code" in err ? String((err as { code?: unknown }).code ?? "").trim() : "";
    return `${label}: ${msg || "query failed"}${code ? ` (${code})` : ""}`;
  }
  if (err instanceof Error) return `${label}: ${err.message}`;
  return `${label}: query failed`;
}

async function safeCount(label: string, req: PromiseLike<{ count: number | null; error: unknown }>) {
  try {
    const { count, error } = await req;
    if (error) return { value: 0, error: readableError(label, error) };
    return { value: count ?? 0, error: null };
  } catch (e) {
    return { value: 0, error: readableError(label, e) };
  }
}

async function fetchOverview(period: Period): Promise<OverviewData> {
  const from = periodStart(period);
  const bookingsBase = supabase.from("survey_bookings").select("id", { count: "exact", head: true });
  const bookingsReq = from ? bookingsBase.gte("created_at", from) : bookingsBase;

  const [users, customers, installers, products, bookings, { data: statusData, error: statusErr }, { data: recentData, error: recentErr }] =
    await Promise.all([
      safeCount("Users", supabase.from("profiles").select("id", { count: "exact", head: true })),
      safeCount("Customers", supabase.from("profiles").select("id", { count: "exact", head: true }).eq("role", "customer")),
      safeCount("Installers", supabase.from("profiles").select("id", { count: "exact", head: true }).eq("role", "installer")),
      safeCount("Products", supabase.from("products").select("id", { count: "exact", head: true })),
      safeCount("Bookings", bookingsReq),
      supabase.from("survey_bookings").select("status"),
      supabase.from("survey_bookings").select("*").order("created_at", { ascending: false }).limit(5),
    ]);

  if (statusErr) console.error("[dashboard] status counts failed", statusErr);
  if (recentErr) console.error("[dashboard] recent bookings failed", recentErr);

  const bookingStatusCounts = (statusData ?? []).reduce<Record<string, number>>(
    (acc, row: { status: string | null }) => {
      const s = row.status ?? "unknown";
      acc[s] = (acc[s] ?? 0) + 1;
      return acc;
    }, {}
  );

  const total = Object.values(bookingStatusCounts).reduce((a, b) => a + b, 0);
  const pendingBookings = bookingStatusCounts.pending ?? 0;
  const completedBookings = Object.entries(bookingStatusCounts).reduce(
    (t, [s, c]) => (COMPLETION_STATUSES.has(s) ? t + c : t), 0
  );
  const installationsDone = bookingStatusCounts.installation_completed ?? 0;
  const conversionRate = total > 0 ? Math.round((installationsDone / total) * 100) : 0;

  const errors = [users, customers, installers, products, bookings]
    .map((r) => r.error)
    .filter((m): m is string => Boolean(m));
  if (statusErr) errors.push(readableError("Status distribution", statusErr));

  return {
    users: users.value, customers: customers.value, installers: installers.value,
    products: products.value, bookings: bookings.value, pendingBookings,
    completedBookings, installationsDone, conversionRate, bookingStatusCounts,
    recentBookings: (recentData ?? []) as SurveyBooking[],
    errors,
  };
}

// ── Sub-components ─────────────────────────────────────────────────────────────

function PeriodFilter({ value, onChange }: { value: Period; onChange: (p: Period) => void }) {
  return (
    <div className="flex overflow-hidden rounded-lg border border-slate-200 bg-white">
      {PERIODS.map((p) => (
        <button
          key={p.value}
          onClick={() => onChange(p.value)}
          className={`px-3 py-1.5 text-xs font-semibold transition ${
            value === p.value ? "bg-ink text-white" : "text-slate-500 hover:bg-slate-50 hover:text-ink"
          }`}
        >
          {p.label}
        </button>
      ))}
    </div>
  );
}

function BookingPipeline({ counts }: { counts: Record<string, number> }) {
  const total = Object.values(counts).reduce((a, b) => a + b, 0);
  if (!total) return <p className="py-6 text-center text-sm text-slate-400">No booking data yet.</p>;

  const entries = [
    ...bookingStatuses.map((s) => ({ status: s as string, count: counts[s] ?? 0 })),
    ...(counts[legacyBookingStatus] ? [{ status: legacyBookingStatus as string, count: counts[legacyBookingStatus] }] : []),
  ].filter((e) => e.count > 0);

  const max = Math.max(...entries.map((e) => e.count));

  return (
    <div className="space-y-3">
      {entries.map(({ status, count }) => {
        const meta = bookingStatusMeta[status as BookingStatus];
        const pct = Math.round((count / total) * 100);
        const barW = Math.round((count / max) * 100);
        const barColor = STATUS_BAR_COLOR[status] ?? "bg-slate-300";
        return (
          <div key={status}>
            <div className="mb-1 flex items-center justify-between gap-2">
              <div className="flex items-center gap-1.5">
                <span className={`h-2 w-2 rounded-full ${barColor}`} />
                <span className="text-xs font-semibold text-slate-600">
                  {meta?.label ?? status.replace(/_/g, " ")}
                </span>
              </div>
              <div className="flex items-center gap-2">
                <span className="text-xs text-slate-400">{pct}%</span>
                <span className="w-5 text-right text-xs font-bold text-ink">{count}</span>
              </div>
            </div>
            <div className="h-2 w-full overflow-hidden rounded-full bg-slate-100">
              <div className={`h-2 rounded-full transition-all duration-500 ${barColor}`} style={{ width: `${barW}%` }} />
            </div>
          </div>
        );
      })}
    </div>
  );
}

function RecentBookingsList({ bookings }: { bookings: SurveyBooking[] }) {
  if (!bookings.length) return <p className="py-6 text-center text-sm text-slate-400">No bookings yet.</p>;
  return (
    <div className="divide-y divide-slate-100">
      {bookings.map((b) => {
        const meta = bookingStatusMeta[b.status];
        return (
          <div key={b.id} className="flex items-center justify-between gap-3 py-3">
            <div className="min-w-0">
              <p className="truncate text-sm font-semibold text-ink">{b.full_name}</p>
              <p className="mt-0.5 truncate text-xs capitalize text-slate-500">
                {b.booking_type.replace(/_/g, " ")} · {b.city}
              </p>
            </div>
            <div className="flex-shrink-0 text-right">
              <span className={`inline-flex rounded-full px-2 py-0.5 text-xs font-bold ring-1 ${meta.badge}`}>
                {meta.label}
              </span>
              <p className="mt-0.5 text-xs text-slate-400">{formatDate(b.created_at)}</p>
            </div>
          </div>
        );
      })}
    </div>
  );
}

// ── Page ──────────────────────────────────────────────────────────────────────

export function DashboardPage() {
  const [period, setPeriod] = useState<Period>("30d");
  const query = useQuery({ queryKey: ["overview", period], queryFn: () => fetchOverview(period) });

  if (query.isLoading) return <LoadingState />;
  if (query.error) return <ErrorState message={query.error.message} />;
  const d = query.data!;
  const periodLabel = PERIODS.find((p) => p.value === period)?.label ?? "";
  const pipelineTotal = Object.values(d.bookingStatusCounts).reduce((a, b) => a + b, 0);

  return (
    <>
      <PageHeader
        title="Dashboard"
        description="Live operational view of your KaamAsaan platform."
        action={
          <div className="flex items-center gap-2">
            <PeriodFilter value={period} onChange={setPeriod} />
            <button
              onClick={() => query.refetch()}
              disabled={query.isFetching}
              className="flex items-center gap-1.5 rounded-lg border border-slate-200 bg-white px-3 py-1.5 text-xs font-semibold text-slate-500 transition hover:bg-slate-50 disabled:opacity-40"
            >
              <FiRefreshCw size={12} className={query.isFetching ? "animate-spin" : ""} />
              Refresh
            </button>
          </div>
        }
      />

      {/* Error banner */}
      {d.errors.length > 0 && (
        <div className="mb-6 rounded-xl border border-amber-200 bg-amber-50 p-4 text-sm text-amber-800">
          <p className="font-bold">Some metrics could not be refreshed.</p>
          <ul className="mt-1 list-disc space-y-0.5 pl-4 text-xs">
            {d.errors.map((e) => <li key={e}>{e}</li>)}
          </ul>
        </div>
      )}

      {/* ── Hero KPIs ── */}
      <section className="mb-4 grid gap-4 sm:grid-cols-3">

        {/* Bookings */}
        <article className="panel border-l-4 border-l-blue-500 p-5">
          <div className="flex items-start justify-between">
            <div>
              <p className="text-xs font-semibold uppercase tracking-wide text-slate-400">
                Bookings · {periodLabel}
              </p>
              <p className="mt-2 text-4xl font-black text-blue-600">{d.bookings}</p>
              <p className="mt-1 text-xs text-slate-500">Survey requests received</p>
            </div>
            <span className="flex h-10 w-10 flex-shrink-0 items-center justify-center rounded-lg bg-blue-500 text-white shadow-sm">
              <FiBox size={18} />
            </span>
          </div>
        </article>

        {/* Pending */}
        <article className="panel border-l-4 border-l-orange-500 p-5">
          <div className="flex items-start justify-between">
            <div>
              <p className="text-xs font-semibold uppercase tracking-wide text-slate-400">Pending Now</p>
              <p className={`mt-2 text-4xl font-black ${d.pendingBookings > 0 ? "text-orange-500" : "text-ink"}`}>
                {d.pendingBookings}
              </p>
              <p className="mt-1 text-xs text-slate-500">Awaiting follow-up</p>
            </div>
            <span className="flex h-10 w-10 flex-shrink-0 items-center justify-center rounded-lg bg-orange-500 text-white shadow-sm">
              <FiClock size={18} />
            </span>
          </div>
        </article>

        {/* Installations */}
        <article className="panel border-l-4 border-l-emerald-600 p-5">
          <div className="flex items-start justify-between">
            <div>
              <p className="text-xs font-semibold uppercase tracking-wide text-slate-400">Installations Done</p>
              <p className="mt-2 text-4xl font-black text-emerald-700">{d.installationsDone}</p>
              <div className="mt-1 flex items-center gap-1.5">
                <span className="text-xs text-slate-500">Conversion rate</span>
                <span className="inline-flex items-center gap-0.5 rounded-full bg-emerald-50 px-1.5 py-0.5 text-xs font-bold text-emerald-700 ring-1 ring-emerald-100">
                  <FiTrendingUp size={10} /> {d.conversionRate}%
                </span>
              </div>
            </div>
            <span className="flex h-10 w-10 flex-shrink-0 items-center justify-center rounded-lg bg-emerald-600 text-white shadow-sm">
              <FiCheckCircle size={18} />
            </span>
          </div>
        </article>
      </section>

      {/* ── Platform stats ── */}
      <section className="mb-6 grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        {(
          [
            { label: "Total Users", value: d.users, Icon: FiUsers, iconBg: "bg-slate-600" },
            { label: "Customers", value: d.customers, Icon: FiUserCheck, iconBg: "bg-emerald-500" },
            { label: "Installers", value: d.installers, Icon: FiZap, iconBg: "bg-violet-500" },
            { label: "Products", value: d.products, Icon: FiShoppingBag, iconBg: "bg-amber-500" },
          ] as const
        ).map(({ label, value, Icon, iconBg }) => (
          <article key={label} className="panel flex items-center gap-4 px-4 py-4">
            <span className={`flex h-11 w-11 flex-shrink-0 items-center justify-center rounded-xl text-white shadow-sm ${iconBg}`}>
              <Icon size={18} />
            </span>
            <div>
              <p className="text-2xl font-black text-ink">{value}</p>
              <p className="text-xs font-semibold text-slate-500">{label}</p>
            </div>
          </article>
        ))}
      </section>

      {/* ── Bottom grid ── */}
      <div className="grid gap-6 xl:grid-cols-3">

        {/* Booking Pipeline */}
        <section className="panel p-5">
          <div className="mb-4 flex items-center justify-between">
            <div>
              <h2 className="text-sm font-extrabold text-ink">Booking Pipeline</h2>
              <p className="mt-0.5 text-xs text-slate-400">All {pipelineTotal} bookings by status</p>
            </div>
            <span className="rounded-full bg-slate-100 px-2.5 py-0.5 text-xs font-bold text-slate-600">
              {pipelineTotal}
            </span>
          </div>
          <BookingPipeline counts={d.bookingStatusCounts} />
        </section>

        {/* Recent bookings */}
        <section className="panel p-5">
          <div className="mb-3 flex items-center justify-between">
            <h2 className="text-sm font-extrabold text-ink">Recent Bookings</h2>
            <Link to="/bookings" className="flex items-center gap-1 text-xs font-semibold text-solar hover:underline">
              View all <FiArrowRight size={11} />
            </Link>
          </div>
          <RecentBookingsList bookings={d.recentBookings} />
        </section>

        {/* Quick actions */}
        <section className="panel p-5">
          <h2 className="mb-3 text-sm font-extrabold text-ink">Quick Actions</h2>
          <div className="space-y-0.5">
            {QUICK_ACTIONS.map(({ to, label, desc, icon: Icon, iconBg }) => (
              <Link
                key={to}
                to={to}
                className="group flex items-center gap-3 rounded-lg p-2.5 transition hover:bg-slate-50"
              >
                <span className={`flex h-8 w-8 flex-shrink-0 items-center justify-center rounded-md text-white shadow-sm ${iconBg}`}>
                  <Icon size={14} />
                </span>
                <div className="min-w-0">
                  <p className="text-sm font-semibold text-ink transition group-hover:text-solar">{label}</p>
                  <p className="truncate text-xs text-slate-500">{desc}</p>
                </div>
                <FiArrowRight size={12} className="ml-auto flex-shrink-0 text-slate-300 transition group-hover:text-slate-500" />
              </Link>
            ))}
          </div>
        </section>
      </div>
    </>
  );
}
