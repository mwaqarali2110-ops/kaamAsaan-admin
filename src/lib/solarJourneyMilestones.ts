// ⚠️ PLACEHOLDER CONTRACT — the values below are assumptions, not the source of truth.
//
// This is a mirror of kaamAsaan-mobile-app/src/contracts/solarJourneyMilestones.ts.
// Admin's own copy previously imported this module from
// `../../../../backend-development/supabase/contracts/solarJourneyMilestones`, a
// path that doesn't exist on disk (found while resolving this repo's
// feature-language merge conflicts) and broke `tsc -b`. Keep this file in sync
// by hand with the mobile app's copy until there's a real shared/published
// backend contract — do NOT re-point the import outside this repo.
//
// Consumers: src/features/bookings/surveyMilestones.ts, src/types/database.ts,
// src/features/orders/OrdersPage.tsx

export type InstallationJourneyMilestone =
  | 'request_received'
  | 'survey_scheduled'
  | 'quotation_shared'
  | 'installation_date'
  | 'installation_completed'
  | 'feedback';

export type CleaningJourneyMilestone =
  | 'request_received'
  | 'service_confirmed'
  | 'cleaning_datetime'
  | 'service_completed'
  | 'feedback';

export type ProductOrderJourneyMilestone =
  | 'order_received'
  | 'order_confirmed'
  | 'payment_received'
  | 'in_transit'
  | 'product_received'
  | 'product_installed';

export type SolarJourneyMilestone =
  | InstallationJourneyMilestone
  | CleaningJourneyMilestone
  | ProductOrderJourneyMilestone;

export type SolarJourneyLifecycle = 'active' | 'cancelled' | 'on_hold';

export type SolarJourneyKind = 'installation' | 'cleaning';

type MilestoneDefinition<T extends string> = {
  key: T;
  label: string;
  customerDescription: string;
};

export const INSTALLATION_JOURNEY_MILESTONE_KEYS: InstallationJourneyMilestone[] = [
  'request_received',
  'survey_scheduled',
  'quotation_shared',
  'installation_date',
  'installation_completed',
  'feedback',
];

export const INSTALLATION_JOURNEY_MILESTONES: MilestoneDefinition<InstallationJourneyMilestone>[] = [
  {
    key: 'request_received',
    label: 'Request Received',
    customerDescription: 'We have received your request and are reviewing it.',
  },
  {
    key: 'survey_scheduled',
    label: 'Survey Scheduled',
    customerDescription: 'A site survey has been scheduled with our team.',
  },
  {
    key: 'quotation_shared',
    label: 'Quotation Shared',
    customerDescription: 'Your solar system quotation has been shared.',
  },
  {
    key: 'installation_date',
    label: 'Installation Date',
    customerDescription: 'An installation date has been confirmed for your system.',
  },
  {
    key: 'installation_completed',
    label: 'Installation Completed',
    customerDescription: 'Your solar system installation is complete.',
  },
  {
    key: 'feedback',
    label: 'Feedback',
    customerDescription: 'Share feedback about your installation experience.',
  },
];

export const CLEANING_JOURNEY_MILESTONE_KEYS: CleaningJourneyMilestone[] = [
  'request_received',
  'service_confirmed',
  'cleaning_datetime',
  'service_completed',
  'feedback',
];

export const CLEANING_JOURNEY_MILESTONES: MilestoneDefinition<CleaningJourneyMilestone>[] = [
  {
    key: 'request_received',
    label: 'Request Received',
    customerDescription: 'We have received your cleaning request and are reviewing it.',
  },
  {
    key: 'service_confirmed',
    label: 'Service Confirmed',
    customerDescription: 'Your solar panel cleaning service has been confirmed.',
  },
  {
    key: 'cleaning_datetime',
    label: 'Cleaning Date/Time',
    customerDescription: 'A cleaning date and time has been scheduled with our team.',
  },
  {
    key: 'service_completed',
    label: 'Service Completed',
    customerDescription: 'Your solar panel cleaning is complete.',
  },
  {
    key: 'feedback',
    label: 'Feedback',
    customerDescription: 'Share feedback about your cleaning experience.',
  },
];

export const PRODUCT_ORDER_JOURNEY_MILESTONE_KEYS: ProductOrderJourneyMilestone[] = [
  'order_received',
  'order_confirmed',
  'payment_received',
  'in_transit',
  'product_received',
  'product_installed',
];

export const PRODUCT_ORDER_JOURNEY_MILESTONES: MilestoneDefinition<ProductOrderJourneyMilestone>[] = [
  {
    key: 'order_received',
    label: 'Order Received',
    customerDescription: 'We have received your order and are reviewing it.',
  },
  {
    key: 'order_confirmed',
    label: 'Order Confirmed',
    customerDescription: 'Your order has been confirmed.',
  },
  {
    key: 'payment_received',
    label: 'Payment Received',
    customerDescription: 'We have received your payment for this order.',
  },
  {
    key: 'in_transit',
    label: 'In-Transit',
    customerDescription: 'Your order is on its way.',
  },
  {
    key: 'product_received',
    label: 'Product Received',
    customerDescription: 'Your product has been delivered.',
  },
  {
    key: 'product_installed',
    label: 'Product Installed',
    customerDescription: 'Your product has been professionally installed.',
  },
];

// Product orders with `service_option: 'product_only'` skip the trailing
// `product_installed` step entirely — it only applies to `product_installation` orders.
export const productOrderJourneyKeys = (hasInstallation: boolean): ProductOrderJourneyMilestone[] =>
  hasInstallation
    ? PRODUCT_ORDER_JOURNEY_MILESTONE_KEYS
    : PRODUCT_ORDER_JOURNEY_MILESTONE_KEYS.filter((key) => key !== 'product_installed');

export const productOrderJourneyMilestones = (hasInstallation: boolean) =>
  PRODUCT_ORDER_JOURNEY_MILESTONES.filter((item) => hasInstallation || item.key !== 'product_installed');

export const journeyKindForServiceType = (serviceType?: string | null): SolarJourneyKind =>
  serviceType === 'cleaning' ? 'cleaning' : 'installation';

const legacyStatusToInstallationMilestone: Record<string, InstallationJourneyMilestone> = {
  survey_requested: 'request_received',
  survey_booked: 'request_received',
  survey_pending: 'request_received',
  pending: 'request_received',
  survey_confirmed: 'survey_scheduled',
  site_visit_scheduled: 'survey_scheduled',
  site_survey_scheduled: 'survey_scheduled',
  assigned: 'survey_scheduled',
  scheduled: 'survey_scheduled',
  survey_in_progress: 'survey_scheduled',
  confirmed: 'survey_scheduled',
  survey_scheduled: 'survey_scheduled',
  survey_completed: 'survey_scheduled',
  design_in_progress: 'survey_scheduled',
  proposal_preparation: 'survey_scheduled',
  quotation_pending: 'survey_scheduled',
  quotation_ready: 'survey_scheduled',
  quotation_shared: 'quotation_shared',
  installation_scheduled: 'installation_date',
  installation_pending: 'installation_date',
  installation_planning: 'installation_date',
  installation_started: 'installation_date',
  installation_in_progress: 'installation_date',
  installation_completed: 'installation_completed',
  project_in_progress: 'installation_completed',
  project_completed: 'installation_completed',
  installed: 'installation_completed',
  system_active: 'installation_completed',
};

const legacyStatusToCleaningMilestone: Record<string, CleaningJourneyMilestone> = {
  survey_requested: 'request_received',
  survey_booked: 'request_received',
  survey_pending: 'request_received',
  pending: 'request_received',
  survey_confirmed: 'service_confirmed',
  assigned: 'service_confirmed',
  scheduled: 'service_confirmed',
  confirmed: 'service_confirmed',
  survey_scheduled: 'cleaning_datetime',
  site_visit_scheduled: 'cleaning_datetime',
  site_survey_scheduled: 'cleaning_datetime',
  survey_in_progress: 'cleaning_datetime',
  survey_completed: 'service_completed',
  installation_completed: 'service_completed',
  project_completed: 'service_completed',
  installed: 'service_completed',
  system_active: 'service_completed',
  completed: 'service_completed',
};

export const resolveSolarJourneyMilestone = (
  kind: SolarJourneyKind,
  currentMilestone?: string | null,
  legacyStatus?: string | null,
): SolarJourneyMilestone => {
  const keys: string[] = kind === 'cleaning' ? CLEANING_JOURNEY_MILESTONE_KEYS : INSTALLATION_JOURNEY_MILESTONE_KEYS;
  if (currentMilestone && keys.includes(currentMilestone)) {
    return currentMilestone as SolarJourneyMilestone;
  }
  const legacyMap = kind === 'cleaning' ? legacyStatusToCleaningMilestone : legacyStatusToInstallationMilestone;
  if (legacyStatus && legacyMap[legacyStatus]) {
    return legacyMap[legacyStatus];
  }
  return 'request_received';
};

export const resolveSolarJourneyLifecycle = (
  journeyStatus?: SolarJourneyLifecycle | null,
  _currentMilestone?: string | null,
  legacyStatus?: string | null,
): SolarJourneyLifecycle => {
  if (journeyStatus === 'active' || journeyStatus === 'cancelled' || journeyStatus === 'on_hold') {
    return journeyStatus;
  }
  if (legacyStatus === 'cancelled') return 'cancelled';
  return 'active';
};

export const getSolarJourneyStepState = (
  keys: string[],
  milestone: string,
  _lifecycle: SolarJourneyLifecycle,
  index: number,
): 'completed' | 'active' | 'pending' => {
  const currentIndex = keys.indexOf(milestone);
  if (index < currentIndex) return 'completed';
  if (index === currentIndex) return 'active';
  return 'pending';
};
