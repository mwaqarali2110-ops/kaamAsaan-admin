import {
  CLEANING_JOURNEY_MILESTONES,
  CLEANING_JOURNEY_MILESTONE_KEYS,
  INSTALLATION_JOURNEY_MILESTONES,
  INSTALLATION_JOURNEY_MILESTONE_KEYS,
  getSolarJourneyStepState,
  journeyKindForServiceType,
  resolveSolarJourneyLifecycle,
  resolveSolarJourneyMilestone,
  type SolarJourneyKind,
} from "../../lib/solarJourneyMilestones";
import type { BookingStatus, SurveyJourneyLifecycle, SurveyMilestone, SurveyMilestoneState } from "../../types/database";

export type { SolarJourneyKind } from "../../lib/solarJourneyMilestones";

const milestoneBadges: Record<string, string> = {
  request_received: "bg-amber-50 text-amber-700 ring-amber-200",
  survey_scheduled: "bg-blue-50 text-blue-700 ring-blue-200",
  quotation_shared: "bg-violet-50 text-violet-700 ring-violet-200",
  installation_date: "bg-orange-50 text-orange-700 ring-orange-200",
  installation_completed: "bg-cyan-50 text-cyan-700 ring-cyan-200",
  feedback: "bg-emerald-50 text-emerald-700 ring-emerald-200",
  service_confirmed: "bg-blue-50 text-blue-700 ring-blue-200",
  cleaning_datetime: "bg-violet-50 text-violet-700 ring-violet-200",
  service_completed: "bg-cyan-50 text-cyan-700 ring-cyan-200",
};

const buildMeta = (definitions: { key: string; label: string; customerDescription: string }[]) =>
  Object.fromEntries(
    definitions.map((item) => [item.key, { label: item.label, description: item.customerDescription, badge: milestoneBadges[item.key] }]),
  ) as Record<SurveyMilestone, { label: string; description: string; badge: string }>;

export const surveyMilestoneMeta: Record<SurveyMilestoneState, { label: string; description: string; badge: string }> = {
  ...buildMeta(INSTALLATION_JOURNEY_MILESTONES),
  ...buildMeta(CLEANING_JOURNEY_MILESTONES),
  cancelled: { label: "Cancelled", description: "The booking was cancelled.", badge: "bg-red-50 text-red-700 ring-red-200" },
  on_hold: { label: "On Hold", description: "Progress is temporarily paused.", badge: "bg-slate-100 text-slate-700 ring-slate-200" },
} as Record<SurveyMilestoneState, { label: string; description: string; badge: string }>;

export const surveyJourneyKind = (serviceType?: string | null): SolarJourneyKind => journeyKindForServiceType(serviceType);

export const surveyMilestones = (serviceType?: string | null): SurveyMilestone[] =>
  (surveyJourneyKind(serviceType) === "cleaning" ? CLEANING_JOURNEY_MILESTONE_KEYS : INSTALLATION_JOURNEY_MILESTONE_KEYS) as SurveyMilestone[];

export const surveyMilestoneDefinitions = (serviceType?: string | null) =>
  surveyJourneyKind(serviceType) === "cleaning" ? CLEANING_JOURNEY_MILESTONES : INSTALLATION_JOURNEY_MILESTONES;

export const resolveSurveyMilestone = (
  milestone: SurveyMilestoneState | string | null | undefined,
  legacyStatus: BookingStatus | string,
  serviceType?: string | null,
): SurveyMilestone => resolveSolarJourneyMilestone(surveyJourneyKind(serviceType), milestone, legacyStatus) as SurveyMilestone;

export const resolveSurveyLifecycle = (
  journeyStatus: SurveyJourneyLifecycle | null | undefined,
  milestone: SurveyMilestoneState | string | null | undefined,
  legacyStatus: BookingStatus | string,
): SurveyJourneyLifecycle => resolveSolarJourneyLifecycle(journeyStatus, milestone, legacyStatus);

export const resolveSurveyMilestoneState = (
  milestone: SurveyMilestoneState | string | null | undefined,
  legacyStatus: BookingStatus | string = "pending",
  serviceType?: string | null,
): SurveyMilestoneState => milestone === "cancelled" || milestone === "on_hold"
  ? milestone
  : resolveSurveyMilestone(milestone, legacyStatus, serviceType);

export const surveyMilestonePosition = (milestone: SurveyMilestoneState, serviceType?: string | null) => {
  const index = surveyMilestones(serviceType).indexOf(milestone as SurveyMilestone);
  return index < 0 ? 0 : index;
};

// Union of both journeys' keys, deduped — used for the "all milestones" filter
// dropdown, where bookings from either journey kind may need to be filterable.
export const ALL_SURVEY_MILESTONE_KEYS: SurveyMilestone[] = Array.from(
  new Set([...INSTALLATION_JOURNEY_MILESTONE_KEYS, ...CLEANING_JOURNEY_MILESTONE_KEYS]),
) as SurveyMilestone[];

export const surveyMilestoneStepState = (
  milestone: string,
  lifecycle: SurveyJourneyLifecycle,
  index: number,
  serviceType?: string | null,
) => getSolarJourneyStepState(surveyMilestones(serviceType), milestone, lifecycle, index);
