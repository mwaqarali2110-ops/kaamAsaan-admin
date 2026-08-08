import type { BookingStatus } from "../../types/database";

export const bookingStatuses = [
  "pending",
  "confirmed",
  "assigned",
  "scheduled",
  "survey_in_progress",
  "survey_scheduled",
  "survey_completed",
  "proposal_preparation",
  "quotation_shared",
  "installation_planning",
  "installation_started",
  "installation_completed",
  "cancelled",
] as const satisfies readonly BookingStatus[];

export const legacyBookingStatus = "completed" as const;

export const bookingStatusMeta: Record<BookingStatus, { label: string; description: string; badge: string }> = {
  pending: {
    label: "Pending",
    description: "Survey request received",
    badge: "bg-amber-50 text-amber-700 ring-amber-200",
  },
  confirmed: {
    label: "Confirmed",
    description: "Representative call confirmed",
    badge: "bg-blue-50 text-blue-700 ring-blue-200",
  },
  assigned: {
    label: "Assigned",
    description: "Representative or surveyor assigned",
    badge: "bg-indigo-50 text-indigo-700 ring-indigo-200",
  },
  scheduled: {
    label: "Scheduled",
    description: "Survey visit scheduled",
    badge: "bg-sky-50 text-sky-700 ring-sky-200",
  },
  survey_in_progress: {
    label: "Survey In Progress",
    description: "Survey process has started",
    badge: "bg-cyan-50 text-cyan-700 ring-cyan-200",
  },
  survey_scheduled: {
    label: "Survey Scheduled",
    description: "Site survey date and time confirmed",
    badge: "bg-sky-50 text-sky-700 ring-sky-200",
  },
  survey_completed: {
    label: "Survey Completed",
    description: "Site inspection completed",
    badge: "bg-emerald-50 text-emerald-700 ring-emerald-200",
  },
  proposal_preparation: {
    label: "Proposal Preparation",
    description: "System proposal is being prepared",
    badge: "bg-orange-50 text-orange-700 ring-orange-200",
  },
  quotation_shared: {
    label: "Quotation Shared",
    description: "Quotation shared with customer",
    badge: "bg-violet-50 text-violet-700 ring-violet-200",
  },
  installation_planning: {
    label: "Installation Planning",
    description: "Installation schedule is being finalized",
    badge: "bg-teal-50 text-teal-700 ring-teal-200",
  },
  installation_started: {
    label: "Installation Started",
    description: "Installation process has started",
    badge: "bg-teal-50 text-teal-700 ring-teal-200",
  },
  installation_completed: {
    label: "Installation Completed",
    description: "Solar installation completed",
    badge: "bg-green-50 text-green-700 ring-green-200",
  },
  cancelled: {
    label: "Cancelled",
    description: "Booking cancelled",
    badge: "bg-red-50 text-red-700 ring-red-200",
  },
  completed: {
    label: "Survey Completed (Legacy)",
    description: "Previous completed survey record",
    badge: "bg-emerald-50 text-emerald-700 ring-emerald-200",
  },
};
