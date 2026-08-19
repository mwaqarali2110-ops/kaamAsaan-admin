import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useMemo, useState } from "react";
import { FiCheck, FiChevronRight, FiEdit3, FiEye, FiX } from "react-icons/fi";
import { EmptyState, ErrorState, LoadingState } from "../../components/AsyncState";
import { PageHeader } from "../../components/PageHeader";
import { supabase } from "../../lib/supabase";
import { formatDate, formatMoney } from "../../lib/utils";
import type { PromoRedemption, SurveyBooking, SurveyMilestoneState, SurveyPackageSnapshot } from "../../types/database";
import {
  bookingMetadata,
  canonicalPackageSnapshot,
  isSolarSurveyBooking,
  operationalNote,
} from "./surveyBookingAdapter";
import {
  ALL_SURVEY_MILESTONE_KEYS,
  resolveSurveyLifecycle,
  resolveSurveyMilestone,
  resolveSurveyMilestoneState,
  surveyMilestoneMeta,
  surveyMilestonePosition,
  surveyMilestones,
} from "./surveyMilestones";

async function fetchBookings() {
  const { data, error } = await supabase
    .from("survey_bookings")
    .select("*, promo_redemption:promo_redemptions(*), status_history:survey_booking_status_history(*)")
    .order("created_at", { ascending: false });
  if (error) throw error;
  return (data as SurveyBooking[]).filter(isSolarSurveyBooking);
}

const compactText = (value: string, max = 54) => value.length > max ? `${value.slice(0, max - 1)}…` : value;

const formatDateTime = (value?: string | null) => value
  ? new Intl.DateTimeFormat("en-PK", { day: "2-digit", month: "short", year: "numeric", hour: "numeric", minute: "2-digit" }).format(new Date(value))
  : "To be confirmed";

const PackageSummary = ({ snapshot, compact = false }: { snapshot: SurveyPackageSnapshot | null; compact?: boolean }) => {
  if (!snapshot) return <span className="text-sm text-slate-500">Package details unavailable</span>;
  return (
    <div className={compact ? "max-w-72 space-y-0.5" : "space-y-2"}>
      <div className="font-bold text-slate-900">{snapshot.packageName}</div>
      {snapshot.systemSizeKw > 0 ? <div className="text-xs text-slate-500">{snapshot.systemSizeKw.toFixed(2)} kW system{snapshot.isCustomized ? " · Customized" : ""}</div> : null}
      {snapshot.panel ? <div className="text-xs text-slate-600">{snapshot.panel.quantity} × {snapshot.panel.brand} {snapshot.panel.wattage ? `${snapshot.panel.wattage}W` : snapshot.panel.model}</div> : null}
      {snapshot.inverter ? <div className="text-xs text-slate-600">{snapshot.inverter.brand} {snapshot.inverter.model} {snapshot.inverter.capacityKw ? `· ${snapshot.inverter.capacityKw}kW` : ""}</div> : null}
      {snapshot.battery ? <div className="text-xs text-slate-600">{snapshot.battery.quantity} × {snapshot.battery.brand} {snapshot.battery.model} {snapshot.battery.unitCapacityKwh ? `· ${snapshot.battery.unitCapacityKwh}kWh` : ""}</div> : <div className="text-xs text-slate-400">No battery included</div>}
    </div>
  );
};

const MilestoneProgress = ({ booking }: { booking: SurveyBooking }) => {
  const current = resolveSurveyMilestone(booking.current_milestone, booking.status, booking.service_type);
  const lifecycle = resolveSurveyLifecycle(booking.journey_status, booking.current_milestone, booking.status);
  const position = surveyMilestonePosition(current, booking.service_type);
  const total = surveyMilestones(booking.service_type).length;
  const completed = position + 1;
  const meta = surveyMilestoneMeta[current];
  return (
    <div className="min-w-44">
      <div className="mb-1.5 flex items-center justify-between gap-2 text-xs">
        <span className="font-bold text-slate-700">{meta.label}</span>
        <span className="text-slate-500">{completed} of {total}</span>
      </div>
      <div className="h-2 overflow-hidden rounded-full bg-slate-100">
        <div className={`h-full rounded-full ${lifecycle === "active" ? "bg-amber-400" : "bg-slate-400"}`} style={{ width: `${(completed / total) * 100}%` }} />
      </div>
      {lifecycle !== "active" ? <div className={`mt-1 text-xs font-bold ${lifecycle === "cancelled" ? "text-red-600" : "text-slate-500"}`}>{surveyMilestoneMeta[lifecycle].label}</div> : null}
    </div>
  );
};

const DetailDrawer = ({ booking, onClose }: { booking: SurveyBooking; onClose: () => void }) => {
  const snapshot = canonicalPackageSnapshot(booking);
  const history = [...(booking.status_history ?? [])].sort((a, b) => Date.parse(a.created_at) - Date.parse(b.created_at));
  const promoJoin = booking.promo_redemption;
  const promo: PromoRedemption | null = Array.isArray(promoJoin) ? promoJoin[0] ?? null : promoJoin ?? null;
  const metadata = bookingMetadata(booking);
  const milestone = resolveSurveyMilestone(booking.current_milestone, booking.status, booking.service_type);
  const lifecycle = resolveSurveyLifecycle(booking.journey_status, booking.current_milestone, booking.status);
  return (
    <div className="fixed inset-0 z-50 flex justify-end bg-slate-950/35" onMouseDown={onClose}>
      <aside className="h-full w-full max-w-2xl overflow-y-auto bg-white shadow-2xl" onMouseDown={(event) => event.stopPropagation()}>
        <div className="sticky top-0 z-10 flex items-center justify-between border-b bg-white px-5 py-4">
          <div><h2 className="text-lg font-black text-slate-900">Survey Booking Details</h2><p className="text-xs text-slate-500">{booking.reference_code || booking.id}</p></div>
          <button className="rounded-lg p-2 text-slate-500 hover:bg-slate-100" onClick={onClose} aria-label="Close details"><FiX /></button>
        </div>
        <div className="space-y-5 p-5">
          <section className="rounded-xl border border-slate-200 p-4">
            <h3 className="mb-3 font-black text-slate-800">Customer</h3>
            <div className="grid gap-3 text-sm sm:grid-cols-2">
              <div><span className="text-slate-500">Name</span><div className="font-semibold">{booking.full_name}</div></div>
              <div><span className="text-slate-500">Phone</span><div className="font-semibold">{booking.phone}</div></div>
              <div><span className="text-slate-500">Email</span><div className="font-semibold">{booking.customer_email || "Not provided"}</div></div>
              <div><span className="text-slate-500">City</span><div className="font-semibold">{booking.city}</div></div>
              <div className="sm:col-span-2"><span className="text-slate-500">Address</span><div className="font-semibold">{booking.address}</div></div>
            </div>
          </section>
          <section className="rounded-xl border border-slate-200 p-4">
            <h3 className="mb-3 font-black text-slate-800">Survey</h3>
            <div className="grid gap-3 text-sm sm:grid-cols-2">
              <div><span className="text-slate-500">Requested date</span><div className="font-semibold">{formatDate(booking.preferred_date)} · {booking.preferred_time_slot || "To be confirmed"}</div></div>
              <div><span className="text-slate-500">Confirmed date</span><div className="font-semibold">{formatDateTime(booking.confirmed_survey_at)}</div></div>
              <div><span className="text-slate-500">Created</span><div className="font-semibold">{formatDateTime(booking.created_at)}</div></div>
              <div><span className="text-slate-500">Latest milestone</span><div className="font-semibold">{surveyMilestoneMeta[milestone].label}</div></div>
              {lifecycle !== "active" ? <div><span className="text-slate-500">Lifecycle</span><div className="font-semibold">{surveyMilestoneMeta[lifecycle].label}</div></div> : null}
              {booking.assigned_team_name ? <div><span className="text-slate-500">Assigned team</span><div className="font-semibold">{booking.assigned_team_name}{booking.assigned_team_contact ? ` · ${booking.assigned_team_contact}` : ""}</div></div> : null}
              {operationalNote(booking) ? <div className="sm:col-span-2"><span className="text-slate-500">Booking note</span><div className="font-semibold">{operationalNote(booking)}</div></div> : null}
            </div>
          </section>
          <section className="rounded-xl border border-slate-200 p-4">
            <h3 className="mb-3 font-black text-slate-800">Selected Package</h3>
            <PackageSummary snapshot={snapshot} />
            {snapshot ? <div className="mt-4 grid gap-2 rounded-lg bg-slate-50 p-3 text-sm sm:grid-cols-3">
              <div><span className="text-slate-500">Gross</span><div className="font-bold">{formatMoney(snapshot.grossTotal || promo?.gross_total)}</div></div>
              <div><span className="text-slate-500">Discount</span><div className="font-bold text-emerald-700">-{formatMoney(snapshot.discountAmount || promo?.discount_amount || 0)}</div></div>
              <div><span className="text-slate-500">Final estimate</span><div className="font-black">{formatMoney(snapshot.finalTotal || promo?.final_total)}</div></div>
              {(snapshot.promoCode || promo?.normalized_code) ? <div className="sm:col-span-3 text-xs font-bold text-emerald-700">Promo: {snapshot.promoCode || promo?.normalized_code}</div> : null}
            </div> : null}
          </section>
          <section className="rounded-xl border border-slate-200 p-4">
            <h3 className="mb-3 font-black text-slate-800">Progress History</h3>
            {history.length ? <div className="space-y-3">{history.map((entry) => <div key={entry.id} className="flex gap-3 border-l-2 border-amber-300 pl-3 text-sm">
              <div className="min-w-0"><div className="font-bold">{surveyMilestoneMeta[resolveSurveyMilestoneState(entry.new_milestone, "pending", booking.service_type)].label}</div><div className="text-xs text-slate-500">{formatDateTime(entry.created_at)}{entry.updated_by ? ` · ${entry.updated_by}` : ""}</div>{entry.note ? <div className="mt-1 text-slate-600">{entry.note}</div> : null}</div>
            </div>)}</div> : <p className="text-sm text-slate-500">No progress updates have been recorded yet.</p>}
          </section>
          <details className="rounded-xl border border-slate-200 p-4">
            <summary className="cursor-pointer text-sm font-bold text-slate-700">Technical Data</summary>
            <pre className="mt-3 max-h-80 overflow-auto whitespace-pre-wrap break-all rounded-lg bg-slate-950 p-3 text-xs text-slate-100">{JSON.stringify({ metadata, selected_package_snapshot: booking.selected_package_snapshot }, null, 2)}</pre>
          </details>
        </div>
      </aside>
    </div>
  );
};

type SurveyProgressRpcError = {
  code?: string | null;
  message?: string | null;
  details?: string | null;
  hint?: string | null;
};

const ProgressModal = ({
  booking,
  onClose,
  onSaved,
  onMutationStart,
}: {
  booking: SurveyBooking;
  onClose: () => void;
  onSaved: () => void;
  onMutationStart: () => void;
}) => {
  const client = useQueryClient();
  const current = resolveSurveyMilestone(booking.current_milestone, booking.status, booking.service_type);
  const lifecycle = resolveSurveyLifecycle(booking.journey_status, booking.current_milestone, booking.status);
  const [milestone, setMilestone] = useState<SurveyMilestoneState>(lifecycle === "active" ? current : lifecycle);
  const scheduledDateMilestones = ["survey_scheduled", "cleaning_datetime"];
  const [note, setNote] = useState(booking.progress_note ?? "");
  const [confirmedAt, setConfirmedAt] = useState(booking.confirmed_survey_at ? new Date(booking.confirmed_survey_at).toISOString().slice(0, 16) : "");
  const [teamName, setTeamName] = useState(booking.assigned_team_name ?? "");
  const [teamContact, setTeamContact] = useState(booking.assigned_team_contact ?? "");
  const [error, setError] = useState("");
  const mutation = useMutation({
    mutationFn: async () => {
      setError("");
      onMutationStart();
      if (scheduledDateMilestones.includes(milestone) && !confirmedAt) throw new Error("Please provide the confirmed date and time.");
      const movingBackward = milestone !== "cancelled" && milestone !== "on_hold"
        && surveyMilestonePosition(milestone, booking.service_type) < surveyMilestonePosition(current, booking.service_type);
      if (movingBackward && !window.confirm("Move this booking to an earlier milestone? This action will be recorded in history.")) return null;
      const rpcPayload = {
        p_booking_id: booking.id,
        p_new_milestone: milestone,
        p_note: note.trim() || null,
        p_confirmed_survey_at: confirmedAt ? new Date(confirmedAt).toISOString() : null,
        p_assigned_team_name: teamName.trim() || null,
        p_assigned_team_contact: teamContact.trim() || null,
        p_confirm_backward: movingBackward,
      };
      const { data, error: rpcError } = await supabase.rpc("update_survey_booking_milestone", rpcPayload);
      if (rpcError) {
        if (import.meta.env.DEV) {
          const technicalError = rpcError as SurveyProgressRpcError;
          console.error("Survey milestone update failed", {
            bookingId: booking.id,
            previousMilestone: current,
            requestedMilestone: milestone,
            payload: rpcPayload,
            error: {
              code: technicalError.code ?? null,
              message: technicalError.message ?? null,
              details: technicalError.details ?? null,
              hint: technicalError.hint ?? null,
            },
          });
        }
        throw new Error("Unable to update survey progress.");
      }
      return data;
    },
    onSuccess: async (data) => {
      if (!data) return;
      await Promise.all([
        client.invalidateQueries({ queryKey: ["bookings"] }),
        client.invalidateQueries({ queryKey: ["overview"] }),
      ]);
      onSaved();
    },
    onError: (reason) => setError(reason instanceof Error ? reason.message : "Unable to update survey progress."),
  });

  return <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/40 p-4" onMouseDown={onClose}>
    <div className="max-h-[92vh] w-full max-w-2xl overflow-y-auto rounded-2xl bg-white shadow-2xl" onMouseDown={(event) => event.stopPropagation()}>
      <div className="flex items-center justify-between border-b px-5 py-4"><div><h2 className="font-black text-slate-900">Update Survey Progress</h2><p className="text-xs text-slate-500">{booking.full_name} · {formatDate(booking.preferred_date)}</p></div><button className="rounded-lg p-2 hover:bg-slate-100" onClick={onClose}><FiX /></button></div>
      <div className="space-y-5 p-5">
        <div><div className="mb-3 text-xs font-black uppercase tracking-wide text-slate-500">Milestone stepper</div><div className="grid gap-2 sm:grid-cols-3">{surveyMilestones(booking.service_type).map((item, index) => {
          const selected = item === milestone;
          const achieved = index <= surveyMilestonePosition(current, booking.service_type);
          return <button key={item} type="button" onClick={() => setMilestone(item)} className={`rounded-xl border p-3 text-left text-sm transition ${selected ? "border-amber-400 bg-amber-50 ring-2 ring-amber-100" : "border-slate-200 hover:border-amber-200"}`}><div className="mb-1 flex items-center gap-2"><span className={`flex h-6 w-6 items-center justify-center rounded-full text-xs font-black ${achieved ? "bg-emerald-100 text-emerald-700" : "bg-slate-100 text-slate-500"}`}>{achieved ? <FiCheck /> : index + 1}</span><span className="font-bold">{surveyMilestoneMeta[item].label}</span></div></button>;
        })}</div></div>
        <div className="flex gap-2"><button className={`rounded-lg border px-3 py-2 text-sm font-bold ${milestone === "on_hold" ? "border-slate-500 bg-slate-100" : "border-slate-200"}`} onClick={() => setMilestone("on_hold")}>On Hold</button><button className={`rounded-lg border px-3 py-2 text-sm font-bold ${milestone === "cancelled" ? "border-red-400 bg-red-50 text-red-700" : "border-slate-200 text-red-600"}`} onClick={() => setMilestone("cancelled")}>Cancelled</button></div>
        {scheduledDateMilestones.includes(milestone) ? <label className="block text-sm font-bold text-slate-700">Confirmed date and time<input className="field mt-1" type="datetime-local" value={confirmedAt} onChange={(event) => setConfirmedAt(event.target.value)} /></label> : null}
        <div><div className="mb-2 text-xs font-black uppercase tracking-wide text-slate-500">Internal team information</div><div className="grid gap-3 sm:grid-cols-2"><label className="text-sm font-bold text-slate-700">Team/person name<input className="field mt-1" value={teamName} onChange={(event) => setTeamName(event.target.value)} /></label><label className="text-sm font-bold text-slate-700">Contact, optional<input className="field mt-1" value={teamContact} onChange={(event) => setTeamContact(event.target.value)} /></label></div></div>
        <label className="block text-sm font-bold text-slate-700">Progress note, optional<textarea className="field mt-1 min-h-24 resize-y" value={note} onChange={(event) => setNote(event.target.value)} placeholder="Add a customer-safe progress note" /></label>
        {error ? <div className="rounded-lg border border-red-100 bg-red-50 p-3 text-sm font-semibold text-red-700">{error}</div> : null}
      </div>
      <div className="flex justify-end gap-2 border-t px-5 py-4"><button className="rounded-lg border border-slate-200 px-4 py-2 text-sm font-bold" onClick={onClose} disabled={mutation.isPending}>Cancel</button><button className="rounded-lg bg-amber-400 px-4 py-2 text-sm font-black text-slate-900 disabled:opacity-60" onClick={() => mutation.mutate()} disabled={mutation.isPending}>{mutation.isPending ? "Updating…" : "Confirm Update"}</button></div>
    </div>
  </div>;
};

export function BookingsPage() {
  const query = useQuery({ queryKey: ["bookings"], queryFn: fetchBookings });
  const [filter, setFilter] = useState<"all" | SurveyMilestoneState>("all");
  const [details, setDetails] = useState<SurveyBooking | null>(null);
  const [progress, setProgress] = useState<SurveyBooking | null>(null);
  const [success, setSuccess] = useState("");
  const rows = useMemo(() => (query.data ?? []).filter((booking) => {
    if (filter === "all") return true;
    const lifecycle = resolveSurveyLifecycle(booking.journey_status, booking.current_milestone, booking.status);
    return filter === "on_hold" || filter === "cancelled"
      ? lifecycle === filter
      : resolveSurveyMilestone(booking.current_milestone, booking.status, booking.service_type) === filter;
  }), [filter, query.data]);

  return <>
    <PageHeader title="Survey Bookings" description="Manage solar survey schedules, package context and customer progress." />
    {success ? <div className="mb-4 rounded-xl border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm font-bold text-emerald-700">{success}</div> : null}
    <div className="panel mb-4 flex flex-wrap items-center justify-between gap-3 p-3"><select className="field max-w-64" value={filter} onChange={(event) => setFilter(event.target.value as typeof filter)}><option value="all">All milestones</option>{ALL_SURVEY_MILESTONE_KEYS.map((item) => <option key={item} value={item}>{surveyMilestoneMeta[item].label}</option>)}<option value="on_hold">On Hold</option><option value="cancelled">Cancelled</option></select><div className="text-xs font-semibold text-slate-500">{rows.length} solar survey booking{rows.length === 1 ? "" : "s"}</div></div>
    <section className="panel overflow-hidden">{query.isLoading ? <LoadingState /> : query.error ? <ErrorState message={query.error.message} /> : rows.length === 0 ? <EmptyState label="No solar survey bookings found." /> : <div className="overflow-x-auto"><table className="w-full min-w-[1120px] table-fixed text-left text-sm"><thead className="bg-slate-50 text-xs uppercase text-slate-500"><tr><th className="w-44 px-4 py-3">Customer</th><th className="w-40 px-4 py-3">Survey Date</th><th className="w-48 px-4 py-3">Location</th><th className="w-72 px-4 py-3">Selected System</th><th className="w-48 px-4 py-3">Progress</th><th className="w-40 px-4 py-3">Current Status</th><th className="w-40 px-4 py-3">Actions</th></tr></thead><tbody className="divide-y">{rows.map((booking) => {
      const milestone = resolveSurveyMilestone(booking.current_milestone, booking.status, booking.service_type);
      const lifecycle = resolveSurveyLifecycle(booking.journey_status, booking.current_milestone, booking.status);
      const displayedState = lifecycle === "active" ? milestone : lifecycle;
      const snapshot = canonicalPackageSnapshot(booking);
      return <tr key={booking.id} className="align-top hover:bg-slate-50/60"><td className="px-4 py-4"><div className="font-bold text-slate-900">{booking.full_name}</div><div className="mt-1 text-xs text-slate-500">{booking.phone}</div>{booking.customer_email ? <div className="truncate text-xs text-slate-400">{booking.customer_email}</div> : null}</td><td className="px-4 py-4"><div className="font-semibold">{formatDate(booking.preferred_date)}</div><div className="mt-1 text-xs text-slate-500">{booking.preferred_time_slot || "To be confirmed"}</div>{booking.confirmed_survey_at ? <div className="mt-1 text-xs font-bold text-emerald-700">Confirmed</div> : <div className="mt-1 text-xs text-amber-700">Confirmation pending</div>}</td><td className="px-4 py-4"><div className="font-semibold">{booking.city}</div><div className="mt-1 text-xs text-slate-500" title={booking.address}>{compactText(booking.address)}</div></td><td className="px-4 py-4"><PackageSummary snapshot={snapshot} compact /><button className="mt-2 text-xs font-black text-amber-700 hover:text-amber-800" onClick={() => setDetails(booking)}>View Details</button></td><td className="px-4 py-4"><MilestoneProgress booking={booking} /></td><td className="px-4 py-4"><span className={`inline-flex rounded-full px-2.5 py-1 text-xs font-bold ring-1 ${surveyMilestoneMeta[displayedState].badge}`}>{surveyMilestoneMeta[displayedState].label}</span>{booking.progress_note ? <div className="mt-2 text-xs text-slate-500">{compactText(booking.progress_note, 42)}</div> : null}</td><td className="px-4 py-4"><div className="flex flex-col items-start gap-2"><button className="inline-flex items-center gap-1.5 text-xs font-bold text-slate-700 hover:text-slate-950" onClick={() => setDetails(booking)}><FiEye /> View Details <FiChevronRight /></button>{lifecycle !== "cancelled" ? <button className="inline-flex items-center gap-1.5 rounded-lg bg-amber-100 px-2.5 py-1.5 text-xs font-black text-amber-800 hover:bg-amber-200" onClick={() => { setSuccess(""); setProgress(booking); }}><FiEdit3 /> Update Progress</button> : null}</div></td></tr>;
    })}</tbody></table></div>}</section>
    {details ? <DetailDrawer booking={details} onClose={() => setDetails(null)} /> : null}
    {progress ? <ProgressModal booking={progress} onClose={() => setProgress(null)} onMutationStart={() => setSuccess("")} onSaved={() => { setProgress(null); setSuccess("Survey progress updated successfully."); }} /> : null}
  </>;
}
