import {
  SOLAR_JOURNEY_MILESTONES,
  SOLAR_JOURNEY_MILESTONE_KEYS,
  resolveSolarJourneyLifecycle,
  resolveSolarJourneyMilestone,
} from "../../../../backend-development/supabase/contracts/solarJourneyMilestones";
import type { BookingStatus, SurveyJourneyLifecycle, SurveyMilestone, SurveyMilestoneState } from "../../types/database";

export const surveyMilestoneDefinitions = SOLAR_JOURNEY_MILESTONES;

const milestoneBadges: Record<SurveyMilestone, string> = {
  request_received: "bg-amber-50 text-amber-700 ring-amber-200",
  survey_scheduled: "bg-blue-50 text-blue-700 ring-blue-200",
  survey_completed: "bg-emerald-50 text-emerald-700 ring-emerald-200",
  quotation_shared: "bg-violet-50 text-violet-700 ring-violet-200",
  installation_completed: "bg-cyan-50 text-cyan-700 ring-cyan-200",
};

export const surveyMilestones = SOLAR_JOURNEY_MILESTONE_KEYS;

export const surveyMilestoneMeta: Record<SurveyMilestoneState, { label: string; description: string; badge: string }> = {
  ...Object.fromEntries(surveyMilestoneDefinitions.map((item) => [item.key, { label: item.label, description: item.customerDescription, badge: milestoneBadges[item.key] }])) as Record<SurveyMilestone, { label: string; description: string; badge: string }>,
  cancelled: { label: "Cancelled", description: "The survey booking was cancelled.", badge: "bg-red-50 text-red-700 ring-red-200" },
  on_hold: { label: "On Hold", description: "Progress is temporarily paused.", badge: "bg-slate-100 text-slate-700 ring-slate-200" },
};

export const resolveSurveyMilestone = (
  milestone: SurveyMilestoneState | string | null | undefined,
  legacyStatus: BookingStatus | string,
): SurveyMilestone => resolveSolarJourneyMilestone(milestone, legacyStatus);

export const resolveSurveyLifecycle = (
  journeyStatus: SurveyJourneyLifecycle | null | undefined,
  milestone: SurveyMilestoneState | string | null | undefined,
  legacyStatus: BookingStatus | string,
): SurveyJourneyLifecycle => resolveSolarJourneyLifecycle(journeyStatus, milestone, legacyStatus);

export const resolveSurveyMilestoneState = (
  milestone: SurveyMilestoneState | string | null | undefined,
  legacyStatus: BookingStatus | string = "pending",
): SurveyMilestoneState => milestone === "cancelled" || milestone === "on_hold"
  ? milestone
  : resolveSurveyMilestone(milestone, legacyStatus);

export const surveyMilestonePosition = (milestone: SurveyMilestoneState) => {
  const index = surveyMilestones.indexOf(milestone as SurveyMilestone);
  return index < 0 ? 0 : index;
};
