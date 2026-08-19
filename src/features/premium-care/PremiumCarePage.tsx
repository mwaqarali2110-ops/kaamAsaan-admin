import { useEffect, useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { FiArrowLeft, FiCheck, FiSearch, FiShield, FiUpload } from "react-icons/fi";
import { EmptyState, ErrorState, LoadingState } from "../../components/AsyncState";
import { PageHeader } from "../../components/PageHeader";
import { supabase } from "../../lib/supabase";
import { formatDate } from "../../lib/utils";
import type { MaintenanceFeedback, MaintenancePlan, MaintenanceRequest, MaintenanceStatusHistory, MaintenanceVisit, MaintenanceVisitStatus } from "../../types/database";

type LifecycleRow = { plan: MaintenancePlan; request: MaintenanceRequest | null; visits: MaintenanceVisit[]; feedback: MaintenanceFeedback[]; history: MaintenanceStatusHistory[] };
const terminalStatuses = new Set(["cancelled", "completed", "expired", "closed"]);
const adminStages = ["Request Received", "Customer Contacted", "Team Assigned", "Visit Scheduled", "Visit Completed", "Feedback Received", "Next Visit Scheduled"];
const visitStage: Record<MaintenanceVisitStatus, number> = {
  upcoming: 0, confirmation_pending: 0, customer_contacted: 1, team_assigned: 2, scheduled: 3,
  rescheduled: 3, dispatched: 3, in_progress: 3, completed: 4, feedback_pending: 4,
  feedback_received: 5, cancelled: 0
};
const statusLabel = (status: string) => status.replace(/_/g, " ").replace(/\b\w/g, (letter) => letter.toUpperCase());
const windowLabel = (visit?: MaintenanceVisit) => visit ? `${formatDate(visit.window_start)} – ${formatDate(visit.window_end)}` : "—";

async function fetchPremiumCare(): Promise<LifecycleRow[]> {
  const [plans, requests, visits, feedback, history] = await Promise.all([
    supabase.from("maintenance_plans").select("*").order("updated_at", { ascending: false }),
    supabase.from("maintenance_requests").select("*").eq("plan_id", "premium"),
    supabase.from("maintenance_visits").select("*").order("visit_number"),
    supabase.from("maintenance_feedback").select("*").order("created_at", { ascending: false }),
    supabase.from("maintenance_status_history").select("*").order("created_at")
  ]);
  const error = plans.error ?? requests.error ?? visits.error ?? feedback.error ?? history.error;
  if (error) throw error;
  const requestById = new Map(((requests.data ?? []) as MaintenanceRequest[]).map((row) => [row.id, row]));
  return ((plans.data ?? []) as MaintenancePlan[]).map((plan) => ({
    plan,
    request: requestById.get(plan.maintenance_request_id) ?? null,
    visits: ((visits.data ?? []) as MaintenanceVisit[]).filter((visit) => visit.plan_id === plan.id),
    feedback: ((feedback.data ?? []) as MaintenanceFeedback[]).filter((item) => item.plan_id === plan.id),
    history: ((history.data ?? []) as MaintenanceStatusHistory[]).filter((item) => item.plan_id === plan.id)
  }));
}

const TransitionButton = ({ children, onClick, disabled, secondary = false }: { children: React.ReactNode; onClick: () => void; disabled?: boolean; secondary?: boolean }) => (
  <button type="button" onClick={onClick} disabled={disabled} className={`${secondary ? "border border-slate-300 bg-white text-ink" : "bg-solar text-ink"} rounded-lg px-3 py-2 text-xs font-black disabled:cursor-not-allowed disabled:opacity-50`}>{children}</button>
);

export function PremiumCarePage() {
  const client = useQueryClient();
  const query = useQuery({ queryKey: ["premium-care"], queryFn: fetchPremiumCare });
  const [selectedPlanId, setSelectedPlanId] = useState<string | null>(null);
  const [managedVisitId, setManagedVisitId] = useState<string | null>(null);
  const [search, setSearch] = useState("");
  const [status, setStatus] = useState("all");
  const [city, setCity] = useState("");
  const [team, setTeam] = useState("");
  const [fromDate, setFromDate] = useState("");
  const [toDate, setToDate] = useState("");
  const [teamName, setTeamName] = useState("");
  const [teamPhone, setTeamPhone] = useState("");
  const [scheduledDate, setScheduledDate] = useState("");
  const [timeSlot, setTimeSlot] = useState("");
  const [notes, setNotes] = useState("");
  const [workPerformed, setWorkPerformed] = useState("");
  const [completionNotes, setCompletionNotes] = useState("");
  const [diagnosticFindings, setDiagnosticFindings] = useState("");
  const [productionObservations, setProductionObservations] = useState("");
  const [checklist, setChecklist] = useState({ mc4: false, earthing: false, bolts: false, cleaning: false });
  const [report, setReport] = useState<File | null>(null);
  const [actionError, setActionError] = useState("");

  useEffect(() => {
    const refresh = () => void client.invalidateQueries({ queryKey: ["premium-care"] });
    const channel = supabase.channel("admin-premium-care")
      .on("postgres_changes", { event: "*", schema: "public", table: "maintenance_plans" }, refresh)
      .on("postgres_changes", { event: "*", schema: "public", table: "maintenance_visits" }, refresh)
      .subscribe();
    return () => { void supabase.removeChannel(channel); };
  }, [client]);

  const selected = query.data?.find((row) => row.plan.id === selectedPlanId) ?? null;
  useEffect(() => {
    if (!selected) return;
    const current = selected.visits.find((visit) => visit.visit_number === selected.plan.current_visit_number) ?? selected.visits[0];
    setManagedVisitId(current?.id ?? null);
  }, [selectedPlanId, selected?.plan.current_visit_number]);
  const managedVisit = selected?.visits.find((visit) => visit.id === managedVisitId) ?? null;

  const rows = useMemo(() => (query.data ?? []).filter((row) => {
    const request = row.request;
    const current = row.visits.find((visit) => visit.visit_number === row.plan.current_visit_number);
    const haystack = `${row.plan.reference} ${request?.customer_name ?? ""} ${request?.phone ?? ""}`.toLowerCase();
    if (search && !haystack.includes(search.toLowerCase())) return false;
    if (city && request?.city.toLowerCase() !== city.toLowerCase()) return false;
    if (team && !(current?.assigned_team_name ?? row.plan.assigned_team_name ?? "").toLowerCase().includes(team.toLowerCase())) return false;
    if (fromDate && row.plan.created_at.slice(0, 10) < fromDate) return false;
    if (toDate && row.plan.created_at.slice(0, 10) > toDate) return false;
    if (status === "active" && terminalStatuses.has(row.plan.status)) return false;
    if (status === "completed_plan" && row.plan.status !== "completed") return false;
    if (status === "cancelled" && row.plan.status !== "cancelled") return false;
    if (status === "request_received" && row.plan.status !== "request_received") return false;
    if (status === "visit_completed" && current?.status !== "completed") return false;
    if (!["all", "active", "completed_plan", "cancelled", "request_received", "visit_completed"].includes(status) && current?.status !== status) return false;
    return true;
  }), [city, fromDate, query.data, search, status, team, toDate]);

  const transition = useMutation({
    mutationFn: async ({ newStatus, completeAndRequestFeedback = false }: { newStatus: MaintenanceVisitStatus; completeAndRequestFeedback?: boolean }) => {
      if (!selected || !managedVisit) throw new Error("Select a visit first.");
      setActionError("");
      let reportPath = managedVisit.report_url;
      if (report) {
        const safeName = report.name.replace(/[^a-zA-Z0-9._-]/g, "-");
        reportPath = `${selected.plan.id}/${managedVisit.id}/${Date.now()}-${safeName}`;
        const upload = await supabase.storage.from("maintenance-reports").upload(reportPath, report, { upsert: false });
        if (upload.error) throw upload.error;
      }
      const payload = {
        assigned_team_name: teamName || managedVisit.assigned_team_name,
        assigned_team_phone: teamPhone || managedVisit.assigned_team_phone,
        scheduled_date: scheduledDate || managedVisit.scheduled_date,
        scheduled_time_slot: timeSlot || managedVisit.scheduled_time_slot,
        completion_notes: completionNotes || null,
        work_performed: workPerformed || null,
        mc4_tightening_completed: checklist.mc4,
        earthing_water_filled: checklist.earthing,
        nut_bolts_tightened: checklist.bolts,
        panel_cleaning_completed: checklist.cleaning,
        diagnostic_findings: diagnosticFindings || null,
        production_observations: productionObservations || null,
        report_url: reportPath || null
      };
      const call = (nextStatus: MaintenanceVisitStatus, body: typeof payload) => supabase.rpc("admin_transition_maintenance_visit", {
        p_plan_id: selected.plan.id, p_visit_id: managedVisit.id, p_new_status: nextStatus, p_payload: body, p_notes: notes || null
      });
      const first = await call(newStatus, payload);
      if (first.error) throw first.error;
      if (completeAndRequestFeedback) {
        const second = await call("feedback_pending", payload);
        if (second.error) throw second.error;
      }
    },
    onSuccess: async () => {
      setReport(null); setNotes(""); setActionError("");
      await client.invalidateQueries({ queryKey: ["premium-care"] });
    },
    onError: (error) => setActionError(error instanceof Error ? error.message : "The visit could not be updated.")
  });

  const openReport = async (path: string) => {
    const { data, error } = await supabase.storage.from("maintenance-reports").createSignedUrl(path, 60);
    if (error) setActionError(error.message); else window.open(data.signedUrl, "_blank", "noopener,noreferrer");
  };

  if (selected) return <>
    <button type="button" className="mb-4 flex items-center gap-2 text-sm font-bold text-slate-600" onClick={() => setSelectedPlanId(null)}><FiArrowLeft /> Back to Premium Care</button>
    <PageHeader title={`${selected.plan.reference} · ${selected.request?.customer_name ?? "Premium Care"}`} description="Manage the annual plan and move each visit through one valid step at a time." />
    <div className="grid gap-4 xl:grid-cols-[minmax(0,1fr)_360px]">
      <div className="space-y-4">
        <section className="panel grid gap-4 p-4 sm:grid-cols-2">
          <div><div className="text-xs font-black uppercase text-slate-400">Customer information</div><div className="mt-2 text-lg font-black text-ink">{selected.request?.customer_name ?? "—"}</div><div className="text-sm text-slate-600">{selected.request?.phone} · {selected.request?.city}</div><div className="mt-2 text-sm text-slate-600">{selected.request?.address}</div><div className="mt-2 text-xs text-slate-500">{selected.request?.notes || "No notes"}</div></div>
          <div><div className="text-xs font-black uppercase text-slate-400">Plan information</div><div className="mt-2 flex items-center gap-2"><FiShield className="text-amber-600" /><span className="font-black">Premium Care · PKR {Number(selected.plan.price).toLocaleString()}</span></div><div className="mt-2 text-sm text-slate-600">{formatDate(selected.plan.start_date)} – {formatDate(selected.plan.end_date)}</div><div className="text-sm text-slate-600">4 visits / year · Current visit {selected.plan.current_visit_number}</div><span className="mt-3 inline-flex rounded-full bg-amber-50 px-2 py-1 text-xs font-black text-amber-800">{statusLabel(selected.plan.status)}</span></div>
        </section>
        <section className="panel p-4">
          <h2 className="font-black text-ink">Current Visit Progress</h2>
          <div className="mt-4 grid grid-cols-2 gap-2 md:grid-cols-4 xl:grid-cols-7">{adminStages.map((stage, index) => {
            const currentIndex = managedVisit ? visitStage[managedVisit.status] : 0;
            const done = index < currentIndex || (index === 5 && managedVisit?.status === "feedback_received");
            const active = index === currentIndex;
            return <div key={stage} className={`rounded-xl border p-3 ${active ? "border-amber-400 bg-amber-50" : done ? "border-emerald-200 bg-emerald-50" : "border-slate-200 bg-slate-50"}`}><div className={`mb-2 flex h-6 w-6 items-center justify-center rounded-full text-[10px] font-black ${done ? "bg-emerald-600 text-white" : active ? "bg-solar text-ink" : "bg-slate-200 text-slate-500"}`}>{done ? <FiCheck /> : index + 1}</div><div className="text-xs font-black text-ink">{stage}</div></div>;
          })}</div>
        </section>
        <section className="panel overflow-hidden">
          <div className="border-b p-4"><h2 className="font-black text-ink">Annual Visit Schedule</h2><p className="text-xs text-slate-500">All four visits belong to this annual plan.</p></div>
          <div className="divide-y">{selected.visits.map((visit) => {
            const feedback = selected.feedback.find((item) => item.visit_id === visit.id);
            return <button type="button" key={visit.id} onClick={() => setManagedVisitId(visit.id)} className={`grid w-full gap-3 p-4 text-left sm:grid-cols-[70px_1fr_1fr_130px] ${managedVisitId === visit.id ? "bg-amber-50" : "hover:bg-slate-50"}`}>
              <div><div className="text-xs text-slate-400">VISIT</div><div className="text-xl font-black text-ink">{visit.visit_number}</div></div>
              <div><div className="text-xs font-bold text-slate-400">TARGET WINDOW</div><div className="mt-1 text-sm font-bold">{windowLabel(visit)}</div><div className="text-xs text-slate-500">Exact: {formatDate(visit.scheduled_date)} {visit.scheduled_time_slot ?? ""}</div></div>
              <div><div className="text-xs font-bold text-slate-400">TEAM / RESULT</div><div className="mt-1 text-sm font-bold">{visit.assigned_team_name || "Not assigned"}</div><div className="text-xs text-slate-500">{feedback ? `${feedback.overall_rating}/5 customer rating` : visit.completion_notes || "No report yet"}</div></div>
              <div className="self-center"><span className="rounded-full bg-slate-100 px-2 py-1 text-xs font-black text-slate-700">{statusLabel(visit.status)}</span>{visit.report_url ? <span role="button" tabIndex={0} onClick={(event) => { event.stopPropagation(); void openReport(visit.report_url!); }} className="mt-2 block text-xs font-bold text-amber-700">View report</span> : null}</div>
            </button>;
          })}</div>
        </section>
        <section className="panel p-4"><h2 className="font-black text-ink">Audit History</h2><div className="mt-3 space-y-2">{selected.history.length ? selected.history.map((item) => <div key={item.id} className="flex gap-3 text-xs"><FiCheck className="mt-0.5 text-emerald-600" /><div><span className="font-black">{statusLabel(item.new_status)}</span> <span className="text-slate-500">by {item.changed_by_role} · {new Date(item.created_at).toLocaleString()}</span>{item.notes ? <div className="text-slate-500">{item.notes}</div> : null}</div></div>) : <div className="text-sm text-slate-500">No history yet.</div>}</div></section>
      </div>
      <aside className="panel h-fit p-4 xl:sticky xl:top-20">
        <h2 className="font-black text-ink">Manage Visit {managedVisit?.visit_number ?? ""}</h2><p className="mt-1 text-xs text-slate-500">Current state: {managedVisit ? statusLabel(managedVisit.status) : "—"}</p>
        {managedVisit?.status === "customer_contacted" ? <div className="mt-4 grid gap-3"><label className="text-xs font-bold">Team / technician<input className="field mt-1" value={teamName} onChange={(event) => setTeamName(event.target.value)} /></label><label className="text-xs font-bold">Team phone<input className="field mt-1" value={teamPhone} onChange={(event) => setTeamPhone(event.target.value)} /></label></div> : null}
        {["team_assigned", "scheduled", "rescheduled"].includes(managedVisit?.status ?? "") ? <div className="mt-4 grid gap-3"><label className="text-xs font-bold">Visit date<input type="date" className="field mt-1" value={scheduledDate} onChange={(event) => setScheduledDate(event.target.value)} /></label><label className="text-xs font-bold">Time slot<input className="field mt-1" placeholder="e.g. 10 AM – 12 PM" value={timeSlot} onChange={(event) => setTimeSlot(event.target.value)} /></label></div> : null}
        {["scheduled", "dispatched", "in_progress"].includes(managedVisit?.status ?? "") ? <div className="mt-4 space-y-3 border-t pt-4"><label className="text-xs font-bold">Work performed<textarea className="field mt-1 min-h-20" value={workPerformed} onChange={(event) => setWorkPerformed(event.target.value)} /></label><label className="text-xs font-bold">Completion notes<textarea className="field mt-1 min-h-16" value={completionNotes} onChange={(event) => setCompletionNotes(event.target.value)} /></label><div className="grid grid-cols-2 gap-2 text-xs">{[["mc4", "MC4 tightened"], ["earthing", "Earthing filled"], ["bolts", "Nut-bolts tightened"], ["cleaning", "Panels cleaned"]].map(([key, label]) => <label className="flex items-center gap-2" key={key}><input type="checkbox" checked={checklist[key as keyof typeof checklist]} onChange={(event) => setChecklist({ ...checklist, [key]: event.target.checked })} />{label}</label>)}</div><label className="text-xs font-bold">Diagnostic findings<textarea className="field mt-1 min-h-16" value={diagnosticFindings} onChange={(event) => setDiagnosticFindings(event.target.value)} /></label><label className="text-xs font-bold">Production observations<textarea className="field mt-1 min-h-16" value={productionObservations} onChange={(event) => setProductionObservations(event.target.value)} /></label><label className="flex cursor-pointer items-center gap-2 rounded-lg border border-dashed p-3 text-xs font-bold"><FiUpload /> {report?.name || "Upload maintenance report"}<input type="file" className="hidden" onChange={(event) => setReport(event.target.files?.[0] ?? null)} /></label></div> : null}
        <label className="mt-4 block text-xs font-bold">Admin notes<textarea className="field mt-1 min-h-16" value={notes} onChange={(event) => setNotes(event.target.value)} /></label>
        {actionError ? <div className="mt-3 rounded-lg border border-red-200 bg-red-50 p-2 text-xs font-bold text-red-700">{actionError}</div> : null}
        <div className="mt-4 flex flex-wrap gap-2">
          {managedVisit?.status === "upcoming" ? <TransitionButton disabled={transition.isPending} onClick={() => transition.mutate({ newStatus: "confirmation_pending" })}>Confirm Next Visit Window</TransitionButton> : null}
          {managedVisit?.status === "confirmation_pending" ? <TransitionButton disabled={transition.isPending} onClick={() => transition.mutate({ newStatus: "customer_contacted" })}>Mark Customer Contacted</TransitionButton> : null}
          {managedVisit?.status === "customer_contacted" ? <TransitionButton disabled={transition.isPending || !teamName.trim()} onClick={() => transition.mutate({ newStatus: "team_assigned" })}>Assign Team</TransitionButton> : null}
          {managedVisit?.status === "team_assigned" ? <TransitionButton disabled={transition.isPending || !scheduledDate} onClick={() => transition.mutate({ newStatus: "scheduled" })}>Schedule Visit</TransitionButton> : null}
          {managedVisit?.status === "rescheduled" ? <TransitionButton disabled={transition.isPending || !scheduledDate} onClick={() => transition.mutate({ newStatus: "scheduled" })}>Confirm New Schedule</TransitionButton> : null}
          {managedVisit?.status === "scheduled" ? <><TransitionButton disabled={transition.isPending} onClick={() => transition.mutate({ newStatus: "dispatched" })}>Mark Team Dispatched</TransitionButton><TransitionButton secondary disabled={transition.isPending || !scheduledDate} onClick={() => transition.mutate({ newStatus: "rescheduled" })}>Reschedule</TransitionButton></> : null}
          {managedVisit?.status === "dispatched" ? <TransitionButton disabled={transition.isPending} onClick={() => transition.mutate({ newStatus: "in_progress" })}>Start Visit</TransitionButton> : null}
          {["scheduled", "dispatched", "in_progress"].includes(managedVisit?.status ?? "") ? <TransitionButton disabled={transition.isPending} onClick={() => transition.mutate({ newStatus: "completed", completeAndRequestFeedback: true })}>Complete Visit & Request Feedback</TransitionButton> : null}
          {managedVisit?.status === "completed" ? <TransitionButton disabled={transition.isPending} onClick={() => transition.mutate({ newStatus: "feedback_pending" })}>Request Feedback</TransitionButton> : null}
          {managedVisit?.status === "feedback_pending" ? <div className="rounded-lg bg-blue-50 p-3 text-xs font-bold text-blue-700">Waiting for customer feedback.</div> : null}
        </div>
      </aside>
    </div>
  </>;

  return <>
    <PageHeader title="Premium Care" description="Manage annual maintenance plans, their four visits, teams, reports and customer feedback." />
    <section className="panel mb-4 grid gap-3 p-3 md:grid-cols-3 xl:grid-cols-6">
      <label className="relative md:col-span-2"><FiSearch className="absolute left-3 top-3 text-slate-400" /><input className="field pl-9" placeholder="Reference, customer or phone" value={search} onChange={(event) => setSearch(event.target.value)} /></label>
      <select className="field" value={status} onChange={(event) => setStatus(event.target.value)}><option value="all">All statuses</option><option value="active">Active annual plans</option><option value="request_received">Request received</option><option value="confirmation_pending">Confirmation pending</option><option value="customer_contacted">Team assignment pending</option><option value="scheduled">Visit scheduled</option><option value="visit_completed">Visit completed</option><option value="feedback_pending">Feedback pending</option><option value="completed_plan">Completed plans</option><option value="cancelled">Cancelled plans</option></select>
      <input className="field" placeholder="City" value={city} onChange={(event) => setCity(event.target.value)} /><input className="field" placeholder="Assigned team" value={team} onChange={(event) => setTeam(event.target.value)} />
      <div className="flex gap-2"><input type="date" title="From date" className="field min-w-0" value={fromDate} onChange={(event) => setFromDate(event.target.value)} /><input type="date" title="To date" className="field min-w-0" value={toDate} onChange={(event) => setToDate(event.target.value)} /></div>
    </section>
    <section className="panel overflow-hidden">{query.isLoading ? <LoadingState /> : query.error ? <ErrorState message={query.error.message} /> : rows.length === 0 ? <EmptyState /> : <div className="overflow-x-auto"><table className="min-w-full text-left text-sm"><thead className="bg-slate-50 text-xs uppercase text-slate-500"><tr><th className="px-4 py-3">Reference / Customer</th><th className="px-4 py-3">Plan</th><th className="px-4 py-3">Current Visit</th><th className="px-4 py-3">Next Window</th><th className="px-4 py-3">Team</th><th className="px-4 py-3">Updated</th><th className="px-4 py-3"></th></tr></thead><tbody className="divide-y">{rows.map((row) => { const visit = row.visits.find((item) => item.visit_number === row.plan.current_visit_number); return <tr key={row.plan.id}><td className="px-4 py-3"><div className="font-black text-ink">{row.plan.reference}</div><div className="text-xs text-slate-500">{row.request?.customer_name} · {row.request?.phone}</div><div className="text-xs text-slate-400">{row.request?.city}</div></td><td className="px-4 py-3"><div className="font-bold">Premium Care</div><span className="text-xs text-slate-500">{statusLabel(row.plan.status)}</span></td><td className="px-4 py-3"><div className="font-bold">Visit {row.plan.current_visit_number} of 4</div><span className="rounded-full bg-amber-50 px-2 py-1 text-xs font-black text-amber-800">{statusLabel(visit?.status ?? row.plan.status)}</span></td><td className="px-4 py-3 text-xs">{windowLabel(visit)}</td><td className="px-4 py-3 text-xs">{visit?.assigned_team_name || row.plan.assigned_team_name || "Not assigned"}</td><td className="px-4 py-3 text-xs text-slate-500">{new Date(row.plan.updated_at).toLocaleString()}</td><td className="px-4 py-3"><button className="rounded-lg bg-solar px-3 py-2 text-xs font-black" onClick={() => setSelectedPlanId(row.plan.id)}>Open</button></td></tr>; })}</tbody></table></div>}</section>
  </>;
}
