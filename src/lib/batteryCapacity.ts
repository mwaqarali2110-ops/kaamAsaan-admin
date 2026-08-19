export const MAX_RESIDENTIAL_BATTERY_UNIT_CAPACITY_KWH = 200;

export type BatteryCapacityStatus = 'valid' | 'missing' | 'ambiguous' | 'implausible';

export type BatteryCapacityNormalization = {
  capacityKwh: number | null;
  status: BatteryCapacityStatus;
  sourceField: string | null;
  sourceValue: number | null;
  sourceUnit: 'kWh' | 'Wh' | null;
  issue: string | null;
};

type BatteryCapacitySource = Record<string, unknown> & {
  specifications?: Record<string, unknown> | null;
};

const numericValue = (value: unknown) => {
  if (typeof value === 'number' && Number.isFinite(value)) return value;
  if (typeof value === 'string' && value.trim()) {
    const parsed = Number(value.replace(/,/g, '').trim());
    return Number.isFinite(parsed) ? parsed : null;
  }
  return null;
};

const normalizeUnit = (value: unknown): 'kWh' | 'Wh' | null => {
  const unit = String(value ?? '').toLowerCase().replace(/[\s_-]+/g, '');
  if (unit === 'kwh' || unit === 'kilowatthour' || unit === 'kilowatthours') return 'kWh';
  if (unit === 'wh' || unit === 'watthour' || unit === 'watthours') return 'Wh';
  return null;
};

const invalid = (
  status: Exclude<BatteryCapacityStatus, 'valid'>,
  issue: string,
): BatteryCapacityNormalization => ({
  capacityKwh: null,
  status,
  sourceField: null,
  sourceValue: null,
  sourceUnit: null,
  issue,
});

const validateCapacity = (
  capacityKwh: number,
  sourceField: string,
  sourceValue: number,
  sourceUnit: 'kWh' | 'Wh',
): BatteryCapacityNormalization => {
  if (!Number.isFinite(capacityKwh) || capacityKwh <= 0) {
    return invalid('ambiguous', `${sourceField} must contain a positive battery energy value.`);
  }
  if (capacityKwh > MAX_RESIDENTIAL_BATTERY_UNIT_CAPACITY_KWH) {
    return {
      capacityKwh: null,
      status: 'implausible',
      sourceField,
      sourceValue,
      sourceUnit,
      issue: `${sourceField} resolves to ${capacityKwh} kWh, above the configured residential product limit.`,
    };
  }
  return {
    capacityKwh: Math.round(capacityKwh * 1000) / 1000,
    status: 'valid',
    sourceField,
    sourceValue,
    sourceUnit,
    issue: null,
  };
};

const readCandidate = (
  source: BatteryCapacitySource,
  specifications: Record<string, unknown>,
  keys: string[],
) => {
  for (const key of keys) {
    const directValue = numericValue(source[key]);
    if (directValue != null) return { field: key, value: directValue };
    const specificationValue = numericValue(specifications[key]);
    if (specificationValue != null) return { field: `specifications.${key}`, value: specificationValue };
  }
  return null;
};

/**
 * Resolves one battery product to the app's canonical kWh unit.
 *
 * Numeric magnitude is never used to guess a unit. Wh is converted only from
 * an explicitly Wh-labelled field; canonical kWh fields are accepted as kWh.
 * Product names are deliberately not parsed because they are display text,
 * not unit metadata.
 */
export const normalizeBatteryCapacity = (
  input: BatteryCapacitySource | null | undefined,
): BatteryCapacityNormalization => {
  if (!input) return invalid('missing', 'Battery product data is missing.');
  const specifications = input.specifications ?? {};

  const explicitValue = readCandidate(input, specifications, ['capacity_value', 'capacityValue']);
  const explicitUnit = normalizeUnit(
    input.capacity_unit ?? input.capacityUnit ?? specifications.capacity_unit ?? specifications.capacityUnit,
  );
  if (explicitValue && explicitUnit) {
    const capacityKwh = explicitUnit === 'Wh' ? explicitValue.value / 1000 : explicitValue.value;
    return validateCapacity(capacityKwh, explicitValue.field, explicitValue.value, explicitUnit);
  }

  const whCandidate = readCandidate(input, specifications, ['capacity_wh', 'capacityWh', 'battery_capacity_wh', 'batteryCapacityWh']);
  if (whCandidate) {
    return validateCapacity(whCandidate.value / 1000, whCandidate.field, whCandidate.value, 'Wh');
  }

  const kwhCandidate = readCandidate(input, specifications, [
    'capacity_kwh',
    'capacityKwh',
    'battery_capacity_kwh',
    'batteryCapacityKwh',
    'nominal_capacity_kwh',
    'nominalCapacityKwh',
  ]);
  if (kwhCandidate) {
    return validateCapacity(kwhCandidate.value, kwhCandidate.field, kwhCandidate.value, 'kWh');
  }

  if (explicitValue && !explicitUnit) {
    return invalid('ambiguous', `${explicitValue.field} has no explicit Wh or kWh unit.`);
  }
  return invalid('missing', 'No canonical kWh field or explicitly unit-labelled battery energy field is configured.');
};

/** Canonical V1 commercial sizing accessor. Never infers kWh from magnitude. */
export const normalizeBatteryCapacityKwh = (
  input: BatteryCapacitySource | null | undefined,
) => normalizeBatteryCapacity(input).capacityKwh;
