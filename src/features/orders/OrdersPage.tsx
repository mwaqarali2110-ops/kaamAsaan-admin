import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useMemo, useState } from "react";
import { FiCheck, FiChevronRight, FiEdit3, FiEye, FiX } from "react-icons/fi";
import { EmptyState, ErrorState, LoadingState } from "../../components/AsyncState";
import { PageHeader } from "../../components/PageHeader";
import { supabase } from "../../lib/supabase";
import { productOrderJourneyKeys, productOrderJourneyMilestones } from "../../lib/solarJourneyMilestones";
import { formatDate, formatMoney } from "../../lib/utils";
import type { ProductOrder } from "../../types/database";

async function fetchOrders() {
  const { data, error } = await supabase
    .from("product_orders")
    .select("*, status_history:product_order_status_history(*)")
    .order("created_at", { ascending: false });
  if (error) throw error;
  return data as ProductOrder[];
}

const hasInstallation = (order: Pick<ProductOrder, "service_option">) => order.service_option === "product_installation";

const resolveOrderMilestone = (order: Pick<ProductOrder, "current_milestone" | "service_option">) => {
  const keys = productOrderJourneyKeys(hasInstallation(order));
  if (order.current_milestone && (keys as string[]).includes(order.current_milestone)) return order.current_milestone;
  return keys[0];
};

const orderMilestonePosition = (order: Pick<ProductOrder, "current_milestone" | "service_option">, milestone: string) =>
  Math.max(0, productOrderJourneyKeys(hasInstallation(order)).indexOf(milestone as never));

const milestoneLabel = (order: Pick<ProductOrder, "service_option">, key: string) =>
  productOrderJourneyMilestones(hasInstallation(order)).find((item) => item.key === key)?.label ?? key;

const statusBadge: Record<ProductOrder["status"], string> = {
  order_received: "bg-amber-50 text-amber-700 ring-amber-200",
  order_confirmed: "bg-blue-50 text-blue-700 ring-blue-200",
  payment_received: "bg-violet-50 text-violet-700 ring-violet-200",
  in_transit: "bg-orange-50 text-orange-700 ring-orange-200",
  product_received: "bg-cyan-50 text-cyan-700 ring-cyan-200",
  product_installed: "bg-emerald-50 text-emerald-700 ring-emerald-200",
  cancelled: "bg-red-50 text-red-700 ring-red-200",
  on_hold: "bg-slate-100 text-slate-700 ring-slate-200",
};

const statusLabel: Record<ProductOrder["status"], string> = {
  order_received: "Order Received",
  order_confirmed: "Order Confirmed",
  payment_received: "Payment Received",
  in_transit: "In-Transit",
  product_received: "Product Received",
  product_installed: "Product Installed",
  cancelled: "Cancelled",
  on_hold: "On Hold",
};

const formatDateTime = (value?: string | null) => value
  ? new Intl.DateTimeFormat("en-PK", { day: "2-digit", month: "short", year: "numeric", hour: "numeric", minute: "2-digit" }).format(new Date(value))
  : "—";

const MilestoneProgress = ({ order }: { order: ProductOrder }) => {
  const milestone = resolveOrderMilestone(order);
  const total = productOrderJourneyKeys(hasInstallation(order)).length;
  const completed = orderMilestonePosition(order, milestone) + 1;
  const isTerminal = order.status === "cancelled" || order.status === "on_hold";
  return (
    <div className="min-w-44">
      <div className="mb-1.5 flex items-center justify-between gap-2 text-xs">
        <span className="font-bold text-slate-700">{milestoneLabel(order, milestone)}</span>
        <span className="text-slate-500">{completed} of {total}</span>
      </div>
      <div className="h-2 overflow-hidden rounded-full bg-slate-100">
        <div className={`h-full rounded-full ${isTerminal ? "bg-slate-400" : "bg-amber-400"}`} style={{ width: `${(completed / total) * 100}%` }} />
      </div>
      {isTerminal ? <div className={`mt-1 text-xs font-bold ${order.status === "cancelled" ? "text-red-600" : "text-slate-500"}`}>{statusLabel[order.status]}</div> : null}
    </div>
  );
};

const DetailDrawer = ({ order, onClose }: { order: ProductOrder; onClose: () => void }) => {
  const history = [...(order.status_history ?? [])].sort((a, b) => Date.parse(a.created_at) - Date.parse(b.created_at));
  const milestone = resolveOrderMilestone(order);
  return (
    <div className="fixed inset-0 z-50 flex justify-end bg-slate-950/35" onMouseDown={onClose}>
      <aside className="h-full w-full max-w-2xl overflow-y-auto bg-white shadow-2xl" onMouseDown={(event) => event.stopPropagation()}>
        <div className="sticky top-0 z-10 flex items-center justify-between border-b bg-white px-5 py-4">
          <div><h2 className="text-lg font-black text-slate-900">Product Order Details</h2><p className="text-xs text-slate-500">{order.reference_code}</p></div>
          <button className="rounded-lg p-2 text-slate-500 hover:bg-slate-100" onClick={onClose} aria-label="Close details"><FiX /></button>
        </div>
        <div className="space-y-5 p-5">
          <section className="rounded-xl border border-slate-200 p-4">
            <h3 className="mb-3 font-black text-slate-800">Customer</h3>
            <div className="grid gap-3 text-sm sm:grid-cols-2">
              <div><span className="text-slate-500">Name</span><div className="font-semibold">{order.full_name}</div></div>
              <div><span className="text-slate-500">Phone</span><div className="font-semibold">{order.phone}</div></div>
              <div><span className="text-slate-500">City</span><div className="font-semibold">{order.city}</div></div>
              <div><span className="text-slate-500">Delivery address</span><div className="font-semibold">{order.delivery_address || "Not provided"}</div></div>
            </div>
          </section>
          <section className="rounded-xl border border-slate-200 p-4">
            <h3 className="mb-3 font-black text-slate-800">Order</h3>
            <div className="grid gap-3 text-sm sm:grid-cols-2">
              <div><span className="text-slate-500">Product</span><div className="font-semibold">{order.product_name}{order.product_brand ? ` · ${order.product_brand}` : ""}</div></div>
              <div><span className="text-slate-500">Quantity</span><div className="font-semibold">{order.quantity}</div></div>
              <div><span className="text-slate-500">Service option</span><div className="font-semibold">{hasInstallation(order) ? "Product + Installation" : "Product only"}</div></div>
              <div><span className="text-slate-500">Created</span><div className="font-semibold">{formatDateTime(order.created_at)}</div></div>
              <div><span className="text-slate-500">Latest milestone</span><div className="font-semibold">{milestoneLabel(order, milestone)}</div></div>
              {order.notes ? <div className="sm:col-span-2"><span className="text-slate-500">Notes</span><div className="font-semibold">{order.notes}</div></div> : null}
            </div>
          </section>
          <section className="rounded-xl border border-slate-200 p-4">
            <h3 className="mb-3 font-black text-slate-800">Pricing</h3>
            <div className="grid gap-2 rounded-lg bg-slate-50 p-3 text-sm sm:grid-cols-3">
              <div><span className="text-slate-500">Product ({order.quantity} × {formatMoney(order.unit_price)})</span><div className="font-bold">{formatMoney(order.unit_price * order.quantity)}</div></div>
              <div><span className="text-slate-500">Transportation</span><div className="font-bold">{formatMoney(order.transportation_charge)}</div></div>
              <div><span className="text-slate-500">Installation</span><div className="font-bold">{formatMoney(order.installation_charge)}</div></div>
              <div><span className="text-slate-500">Discount</span><div className="font-bold text-emerald-700">-{formatMoney(order.discount_amount)}</div></div>
              <div className="sm:col-span-2"><span className="text-slate-500">Total</span><div className="font-black">{formatMoney(order.total)}</div></div>
              {order.promo_code ? <div className="sm:col-span-3 text-xs font-bold text-emerald-700">Promo: {order.promo_code}</div> : null}
            </div>
          </section>
          <section className="rounded-xl border border-slate-200 p-4">
            <h3 className="mb-3 font-black text-slate-800">Progress History</h3>
            {history.length ? <div className="space-y-3">{history.map((entry) => <div key={entry.id} className="flex gap-3 border-l-2 border-amber-300 pl-3 text-sm">
              <div className="min-w-0"><div className="font-bold">{milestoneLabel(order, entry.new_milestone)}</div><div className="text-xs text-slate-500">{formatDateTime(entry.created_at)}{entry.updated_by ? ` · ${entry.updated_by}` : ""}</div>{entry.note ? <div className="mt-1 text-slate-600">{entry.note}</div> : null}</div>
            </div>)}</div> : <p className="text-sm text-slate-500">No progress updates have been recorded yet.</p>}
          </section>
        </div>
      </aside>
    </div>
  );
};

const ProgressModal = ({
  order,
  onClose,
  onSaved,
  onMutationStart,
}: {
  order: ProductOrder;
  onClose: () => void;
  onSaved: () => void;
  onMutationStart: () => void;
}) => {
  const client = useQueryClient();
  const current = resolveOrderMilestone(order);
  const [milestone, setMilestone] = useState<string>(order.status === "cancelled" || order.status === "on_hold" ? order.status : current);
  const [note, setNote] = useState("");
  const [error, setError] = useState("");
  const keys = productOrderJourneyKeys(hasInstallation(order));

  const mutation = useMutation({
    mutationFn: async () => {
      setError("");
      onMutationStart();
      const isTerminal = milestone === "cancelled" || milestone === "on_hold";
      const payload = isTerminal
        ? { status: milestone }
        : { status: milestone, current_milestone: milestone };
      const { error: updateError } = await supabase.from("product_orders").update(payload).eq("id", order.id);
      if (updateError) throw new Error("Unable to update order progress.");
      if (note.trim()) {
        await supabase.from("product_order_status_history").update({ note: note.trim() }).eq("order_id", order.id).order("created_at", { ascending: false }).limit(1);
      }
    },
    onSuccess: async () => {
      await Promise.all([
        client.invalidateQueries({ queryKey: ["orders"] }),
        client.invalidateQueries({ queryKey: ["overview"] }),
      ]);
      onSaved();
    },
    onError: (reason) => setError(reason instanceof Error ? reason.message : "Unable to update order progress."),
  });

  return <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/40 p-4" onMouseDown={onClose}>
    <div className="max-h-[92vh] w-full max-w-2xl overflow-y-auto rounded-2xl bg-white shadow-2xl" onMouseDown={(event) => event.stopPropagation()}>
      <div className="flex items-center justify-between border-b px-5 py-4"><div><h2 className="font-black text-slate-900">Update Order Progress</h2><p className="text-xs text-slate-500">{order.full_name} · {order.reference_code}</p></div><button className="rounded-lg p-2 hover:bg-slate-100" onClick={onClose}><FiX /></button></div>
      <div className="space-y-5 p-5">
        <div><div className="mb-3 text-xs font-black uppercase tracking-wide text-slate-500">Milestone stepper</div><div className="grid gap-2 sm:grid-cols-3">{keys.map((item, index) => {
          const selected = item === milestone;
          const achieved = index <= orderMilestonePosition(order, current);
          return <button key={item} type="button" onClick={() => setMilestone(item)} className={`rounded-xl border p-3 text-left text-sm transition ${selected ? "border-amber-400 bg-amber-50 ring-2 ring-amber-100" : "border-slate-200 hover:border-amber-200"}`}><div className="mb-1 flex items-center gap-2"><span className={`flex h-6 w-6 items-center justify-center rounded-full text-xs font-black ${achieved ? "bg-emerald-100 text-emerald-700" : "bg-slate-100 text-slate-500"}`}>{achieved ? <FiCheck /> : index + 1}</span><span className="font-bold">{milestoneLabel(order, item)}</span></div></button>;
        })}</div></div>
        <div className="flex gap-2"><button className={`rounded-lg border px-3 py-2 text-sm font-bold ${milestone === "on_hold" ? "border-slate-500 bg-slate-100" : "border-slate-200"}`} onClick={() => setMilestone("on_hold")}>On Hold</button><button className={`rounded-lg border px-3 py-2 text-sm font-bold ${milestone === "cancelled" ? "border-red-400 bg-red-50 text-red-700" : "border-slate-200 text-red-600"}`} onClick={() => setMilestone("cancelled")}>Cancelled</button></div>
        <label className="block text-sm font-bold text-slate-700">Progress note, optional<textarea className="field mt-1 min-h-24 resize-y" value={note} onChange={(event) => setNote(event.target.value)} placeholder="Add a customer-safe progress note" /></label>
        {error ? <div className="rounded-lg border border-red-100 bg-red-50 p-3 text-sm font-semibold text-red-700">{error}</div> : null}
      </div>
      <div className="flex justify-end gap-2 border-t px-5 py-4"><button className="rounded-lg border border-slate-200 px-4 py-2 text-sm font-bold" onClick={onClose} disabled={mutation.isPending}>Cancel</button><button className="rounded-lg bg-amber-400 px-4 py-2 text-sm font-black text-slate-900 disabled:opacity-60" onClick={() => mutation.mutate()} disabled={mutation.isPending}>{mutation.isPending ? "Updating…" : "Confirm Update"}</button></div>
    </div>
  </div>;
};

export function OrdersPage() {
  const query = useQuery({ queryKey: ["orders"], queryFn: fetchOrders });
  const [filter, setFilter] = useState<"all" | ProductOrder["status"]>("all");
  const [details, setDetails] = useState<ProductOrder | null>(null);
  const [progress, setProgress] = useState<ProductOrder | null>(null);
  const [success, setSuccess] = useState("");
  const rows = useMemo(() => (query.data ?? []).filter((order) => filter === "all" || order.status === filter), [filter, query.data]);

  return <>
    <PageHeader title="Product Orders" description="Manage standalone product orders, deliveries and installation follow-up." />
    {success ? <div className="mb-4 rounded-xl border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm font-bold text-emerald-700">{success}</div> : null}
    <div className="panel mb-4 flex flex-wrap items-center justify-between gap-3 p-3">
      <select className="field max-w-64" value={filter} onChange={(event) => setFilter(event.target.value as typeof filter)}>
        <option value="all">All statuses</option>
        {(Object.keys(statusLabel) as ProductOrder["status"][]).map((item) => <option key={item} value={item}>{statusLabel[item]}</option>)}
      </select>
      <div className="text-xs font-semibold text-slate-500">{rows.length} product order{rows.length === 1 ? "" : "s"}</div>
    </div>
    <section className="panel overflow-hidden">{query.isLoading ? <LoadingState /> : query.error ? <ErrorState message={query.error.message} /> : rows.length === 0 ? <EmptyState label="No product orders found." /> : <div className="overflow-x-auto"><table className="w-full min-w-[1120px] table-fixed text-left text-sm"><thead className="bg-slate-50 text-xs uppercase text-slate-500"><tr><th className="w-44 px-4 py-3">Customer</th><th className="w-64 px-4 py-3">Product</th><th className="w-32 px-4 py-3">Total</th><th className="w-48 px-4 py-3">Progress</th><th className="w-40 px-4 py-3">Current Status</th><th className="w-40 px-4 py-3">Actions</th></tr></thead><tbody className="divide-y">{rows.map((order) => (
      <tr key={order.id} className="align-top hover:bg-slate-50/60">
        <td className="px-4 py-4"><div className="font-bold text-slate-900">{order.full_name}</div><div className="mt-1 text-xs text-slate-500">{order.phone}</div><div className="mt-1 text-xs text-slate-400">{order.reference_code}</div></td>
        <td className="px-4 py-4"><div className="font-semibold">{order.product_name}</div><div className="mt-1 text-xs text-slate-500">{order.quantity} × {formatMoney(order.unit_price)}{hasInstallation(order) ? " · with installation" : ""}</div><div className="mt-1 text-xs text-slate-400">{formatDate(order.created_at)}</div></td>
        <td className="px-4 py-4 font-bold">{formatMoney(order.total)}</td>
        <td className="px-4 py-4"><MilestoneProgress order={order} /></td>
        <td className="px-4 py-4"><span className={`inline-flex rounded-full px-2.5 py-1 text-xs font-bold ring-1 ${statusBadge[order.status]}`}>{statusLabel[order.status]}</span></td>
        <td className="px-4 py-4"><div className="flex flex-col items-start gap-2"><button className="inline-flex items-center gap-1.5 text-xs font-bold text-slate-700 hover:text-slate-950" onClick={() => setDetails(order)}><FiEye /> View Details <FiChevronRight /></button>{order.status !== "cancelled" ? <button className="inline-flex items-center gap-1.5 rounded-lg bg-amber-100 px-2.5 py-1.5 text-xs font-black text-amber-800 hover:bg-amber-200" onClick={() => { setSuccess(""); setProgress(order); }}><FiEdit3 /> Update Progress</button> : null}</div></td>
      </tr>
    ))}</tbody></table></div>}</section>
    {details ? <DetailDrawer order={details} onClose={() => setDetails(null)} /> : null}
    {progress ? <ProgressModal order={progress} onClose={() => setProgress(null)} onMutationStart={() => setSuccess("")} onSaved={() => { setProgress(null); setSuccess("Order progress updated successfully."); }} /> : null}
  </>;
}
