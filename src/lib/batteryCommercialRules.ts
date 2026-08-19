export const DEFAULT_ACCEPTABLE_BATTERY_SHORTFALL_PERCENT = 5;
export const DEFAULT_RECOMMENDED_CAPACITY_WINDOW_PERCENT = 10;

const FIVE_KWH_CLASS_MINIMUM_KWH = 4.8;
const FIVE_KWH_CLASS_MAXIMUM_KWH = 5.2;
const FIVE_KWH_CLASS_MAXIMUM_QUANTITY = 4;

const positiveWholeNumber = (value: unknown) => {
  const parsed = Number(value);
  return Number.isFinite(parsed) && parsed > 0 ? Math.floor(parsed) : null;
};

export const isFiveKwhCommercialClass = (unitCapacityKwh: number) =>
  Number.isFinite(unitCapacityKwh) &&
  unitCapacityKwh >= FIVE_KWH_CLASS_MINIMUM_KWH &&
  unitCapacityKwh <= FIVE_KWH_CLASS_MAXIMUM_KWH;

export const resolveAllowedBatteryQuantity = ({
  unitCapacityKwh,
  parallelSupported,
  technicalMaximumParallelModules,
  commercialMaximumParallelModules,
}: {
  unitCapacityKwh: number;
  parallelSupported: boolean;
  technicalMaximumParallelModules: number | null | undefined;
  commercialMaximumParallelModules?: number | null;
}) => {
  if (!parallelSupported) return 1;

  const technicalMaximum = positiveWholeNumber(technicalMaximumParallelModules) ?? 1;
  const configuredCommercialMaximum = positiveWholeNumber(commercialMaximumParallelModules);
  const commercialMaximum = isFiveKwhCommercialClass(unitCapacityKwh)
    ? Math.min(configuredCommercialMaximum ?? FIVE_KWH_CLASS_MAXIMUM_QUANTITY, FIVE_KWH_CLASS_MAXIMUM_QUANTITY)
    : configuredCommercialMaximum ?? technicalMaximum;

  return Math.max(1, Math.min(technicalMaximum, commercialMaximum));
};

/**
 * Keeps Recommended sizing practical before quantity-based ranking is applied.
 * Both Step 6 and package generation use this shared shortlist so a smaller
 * valid bank is not displaced solely because a larger bank has fewer modules.
 */
export const createRecommendedCapacityShortlist = <T>(
  candidates: readonly T[],
  getCapacityKwh: (candidate: T) => number,
  targetKwh: number,
  windowPercent = DEFAULT_RECOMMENDED_CAPACITY_WINDOW_PERCENT,
) => {
  const normalizedTarget = Math.max(0, Number(targetKwh) || 0);
  const normalizedWindow = Number.isFinite(Number(windowPercent))
    ? Math.max(0, Number(windowPercent))
    : DEFAULT_RECOMMENDED_CAPACITY_WINDOW_PERCENT;
  const qualifyingCandidates = candidates.filter((candidate) => {
    const capacityKwh = Number(getCapacityKwh(candidate));
    return Number.isFinite(capacityKwh) && capacityKwh >= normalizedTarget;
  });
  const minimumQualifyingCapacityKwh = qualifyingCandidates.length > 0
    ? Math.min(...qualifyingCandidates.map((candidate) => Number(getCapacityKwh(candidate))))
    : null;
  const shortlistMaximumCapacityKwh = minimumQualifyingCapacityKwh == null
    ? null
    : minimumQualifyingCapacityKwh * (1 + normalizedWindow / 100);
  const practicalShortlist = shortlistMaximumCapacityKwh == null
    ? []
    : qualifyingCandidates.filter((candidate) =>
      Number(getCapacityKwh(candidate)) <= shortlistMaximumCapacityKwh + 0.0001
    );

  return {
    qualifyingCandidates,
    minimumQualifyingCapacityKwh,
    shortlistMaximumCapacityKwh,
    practicalShortlist,
  };
};
