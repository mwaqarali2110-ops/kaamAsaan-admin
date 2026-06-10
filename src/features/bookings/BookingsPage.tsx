import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { EmptyState, ErrorState, LoadingState } from "../../components/AsyncState";
import { PageHeader } from "../../components/PageHeader";
import { supabase } from "../../lib/supabase";
import { formatDate } from "../../lib/utils";
import type { BookingStatus, SurveyBooking } from "../../types/database";
import { bookingStatuses, bookingStatusMeta, legacyBookingStatus } from "./bookingStatus";

async function fetchBookings() {
  const { data, error } = await supabase.from("survey_bookings").select("*").order("created_at", { ascending: false });
  if (error) throw error;
  return data as SurveyBooking[];
}

export function BookingsPage() {
  const client = useQueryClient();
  const query = useQuery({ queryKey: ["bookings"], queryFn: fetchBookings });
  const [status, setStatus] = useState<"all" | BookingStatus>("all");
  const update = useMutation({
    mutationFn: async ({ id, status }: { id: string; status: BookingStatus }) => {
      const { error } = await supabase.from("survey_bookings").update({ status }).eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => {
      client.invalidateQueries({ queryKey: ["bookings"] });
      client.invalidateQueries({ queryKey: ["overview"] });
    },
  });
  const rows = (query.data ?? []).filter((item) => status === "all" || item.status === status);

  return (
    <>
      <PageHeader title="Survey Bookings" description="Process each customer journey from survey request to completed installation." />
      <div className="panel mb-4 p-3">
        <select className="field max-w-64" value={status} onChange={(event) => setStatus(event.target.value as typeof status)}>
          <option value="all">All statuses</option>
          {bookingStatuses.map((item) => <option value={item} key={item}>{bookingStatusMeta[item].label}</option>)}
          <option value={legacyBookingStatus}>{bookingStatusMeta.completed.label}</option>
        </select>
      </div>
      <section className="panel overflow-hidden">
        {query.isLoading ? <LoadingState /> : query.error ? <ErrorState message={query.error.message} /> : rows.length === 0 ? <EmptyState /> : (
          <div className="overflow-x-auto">
            <table className="min-w-full text-left text-sm">
              <thead className="bg-slate-50 text-xs uppercase text-slate-500">
                <tr><th className="px-4 py-3">Customer</th><th className="px-4 py-3">Booking</th><th className="px-4 py-3">Schedule</th><th className="px-4 py-3">Address</th><th className="px-4 py-3">Notes</th><th className="px-4 py-3">Status</th></tr>
              </thead>
              <tbody className="divide-y">
                {rows.map((item) => {
                  const meta = bookingStatusMeta[item.status];
                  return (
                    <tr key={item.id}>
                      <td className="px-4 py-3"><div className="font-bold">{item.full_name}</div><div className="text-xs text-slate-500">{item.phone} · {item.city}</div></td>
                      <td className="px-4 py-3 capitalize">{item.booking_type.replace(/_/g, " ")}</td>
                      <td className="px-4 py-3">{formatDate(item.preferred_date)}<div className="text-xs text-slate-500">{item.preferred_time_slot || "No time slot"}</div></td>
                      <td className="max-w-56 px-4 py-3 text-slate-600">{item.address}</td>
                      <td className="max-w-48 px-4 py-3 text-slate-500">{item.notes || "—"}</td>
                      <td className="min-w-64 px-4 py-3">
                        <span className={`mb-2 inline-flex rounded-full px-2 py-1 text-xs font-bold ring-1 ${meta.badge}`}>{meta.label}</span>
                        <div className="mb-2 text-xs text-slate-500">{meta.description}</div>
                        <select
                          className="field min-w-52 py-1.5"
                          value={item.status}
                          disabled={update.isPending}
                          onChange={(event) => update.mutate({ id: item.id, status: event.target.value as BookingStatus })}
                        >
                          {bookingStatuses.map((option) => <option value={option} key={option}>{bookingStatusMeta[option].label}</option>)}
                          {item.status === legacyBookingStatus ? <option value={legacyBookingStatus}>{bookingStatusMeta.completed.label}</option> : null}
                        </select>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </section>
    </>
  );
}

