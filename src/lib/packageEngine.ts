// Vendored copy of the canonical package-sizing engine from kaamAsaan-mobile-app
// (src/utils/packageEngine.ts). It previously lived here as a cross-repo relative
// import, which resolved locally but broke every deploy build that only checks
// out this repo. Keep this in sync with the mobile app's copy by hand; do not
// fork the sizing logic itself.
import { MAX_RESIDENTIAL_BATTERY_UNIT_CAPACITY_KWH } from './batteryCapacity';
import {
  createRecommendedCapacityShortlist,
  DEFAULT_ACCEPTABLE_BATTERY_SHORTFALL_PERCENT,
  resolveAllowedBatteryQuantity,
} from './batteryCommercialRules';

export type PackageTier = 'basic' | 'recommended' | 'better' | 'alternative';
export type PackagePhase = 'single' | 'three';
export type VoltageClass = 'LV' | 'HV' | 'NONE';
export type CompatibilityStatus = 'preferred' | 'compatible' | 'incompatible';

export type PackageEngineProduct = {
  id: string;
  category: 'inverter' | 'battery' | 'panel';
  brandId: string;
  productFamilyId?: string | null;
  brandName: string;
  brandAliases?: string[];
  brandPriority?: number;
  brandPackageGenerationEnabled?: boolean;
  brandPackageImageUrl?: string | null;
  brandLogo?: string | null;
  name: string;
  model?: string | null;
  imageUrl?: string | null;
  price?: number | null;
  active?: boolean;
  packageEligible?: boolean;
  priority?: number;
  available?: boolean;
  stockStatus?: string | null;
  capacityKw?: number;
  capacityKwh?: number;
  usableCapacityKwh?: number | null;
  maximumRecommendedPvKwp?: number | null;
  panelWattage?: number;
  pricePerWatt?: number | null;
  phase?: PackagePhase | null;
  voltageClass?: VoltageClass | null;
  compatibilityGroups?: string[];
  parallelSupported?: boolean;
  maxParallelUnits?: number;
  sameModelParallelOnly?: boolean;
  maxParallelModules?: number | null;
  commercialMaxParallelModules?: number | null;
  sameBrandCompatibilityEnabled?: boolean;
};

export type PackageCompatibilityException = {
  sourceProductId?: string;
  targetProductId?: string;
  sourceFamilyId?: string;
  targetFamilyId?: string;
  sourceBrandId?: string;
  targetBrandId?: string;
  voltageType?: VoltageClass;
  status: CompatibilityStatus;
  active?: boolean;
};

export type GeneratePackageEngineInput = {
  requiredSolarKw: number;
  requiredInverterKw: number;
  requiredBatteryKwh: number;
  runningLoadKw?: number;
  peakLoadKw?: number;
  backupHours?: number;
  phase?: PackagePhase | null;
  minimumBasicSizingPercentage?: number | null;
  selectedPanelWattage?: number;
  products: PackageEngineProduct[];
  compatibilityExceptions?: PackageCompatibilityException[];
  configuredInstallationCost?: number;
  configuredStructureCost?: number;
  configuredAccessoriesCost?: number;
  acceptableBatteryShortfallPercent?: number;
  selectedBatteryTier?: 'loadManaged' | 'recommended' | 'extended';
};

export type PackageGenerationDiagnostic = {
  templateName: string;
  live: boolean;
  requiredInverterKw: number;
  eligibleInverterProducts: string[];
  selectedInverter?: string;
  compatibleBatteryFamilies: string[];
  eligibleBatteryProducts: string[];
  selectedBattery?: string;
  eligiblePanels: string[];
  generated: boolean;
  rejectionReason: string;
};

export type GeneratedPackage = {
  id: string;
  packageType: PackageTier;
  primaryBrandId: string;
  primaryBrand: string;
  packageImageUrl?: string | null;
  brandLogo?: string | null;
  inverter: {
    productId: string;
    quantity: number;
    totalCapacityKw: number;
  };
  battery?: {
    productId: string;
    quantity: number;
    totalCapacityKwh: number;
  };
  panel: {
    productId: string;
    quantity: number;
    panelWattage: number;
    totalCapacityKw: number;
  };
  compatibilityGroup?: string;
  preferredCompatibility: boolean;
  totalPrice: number | null;
  recommendationReason: string;
  limitations: string[];
  score: number;
};

type InverterConfiguration = {
  product: PackageEngineProduct;
  quantity: number;
  totalCapacityKw: number;
};

type BatteryConfiguration = {
  product: PackageEngineProduct;
  quantity: number;
  totalCapacityKwh: number;
  compatibilityGroup?: string;
  preferred: boolean;
};

const round = (value: number, precision = 2) => {
  const factor = 10 ** precision;
  return Math.round(value * factor) / factor;
};

const DEFAULT_MINIMUM_BASIC_SIZING_PERCENTAGE = 90;

export const normalizePackageText = (value = '') => value
  .toLowerCase()
  .replace(/[\s_-]+/g, '')
  .replace(/[^a-z0-9]/g, '')
  .trim();

const normalizeGroup = (value: string) => value.trim().toUpperCase();
const groupsFor = (product: PackageEngineProduct) => (product.compatibilityGroups ?? [])
  .map(normalizeGroup)
  .filter(Boolean);

const findException = (
  inverter: PackageEngineProduct,
  battery: PackageEngineProduct,
  exceptions: PackageCompatibilityException[]
) => exceptions.find((rule) =>
  rule.active !== false &&
  (
    (rule.sourceProductId === inverter.id && rule.targetProductId === battery.id) ||
    (Boolean(rule.sourceFamilyId) && rule.sourceFamilyId === inverter.productFamilyId && Boolean(rule.targetFamilyId) && rule.targetFamilyId === battery.productFamilyId) ||
    (Boolean(rule.sourceFamilyId) && rule.sourceFamilyId === inverter.productFamilyId && Boolean(rule.targetBrandId) && rule.targetBrandId === battery.brandId && (!rule.voltageType || rule.voltageType === battery.voltageClass)) ||
    (rule.sourceBrandId === inverter.brandId && rule.targetBrandId === battery.brandId)
  )
);

export const evaluateBatteryCompatibility = (
  inverter: PackageEngineProduct,
  battery: PackageEngineProduct,
  exceptions: PackageCompatibilityException[] = []
) => {
  const exception = findException(inverter, battery, exceptions);
  if (exception?.status === 'incompatible') {
    return { compatible: false, preferred: false, reason: 'Explicitly marked incompatible.' };
  }

  const inverterVoltage = inverter.voltageClass;
  const batteryVoltage = battery.voltageClass;
  if (!inverterVoltage || !batteryVoltage || inverterVoltage === 'NONE' || batteryVoltage === 'NONE') {
    return { compatible: false, preferred: false, reason: 'Battery voltage class is not configured.' };
  }
  if (inverterVoltage !== batteryVoltage) {
    return { compatible: false, preferred: false, reason: 'Battery and inverter voltage classes do not match.' };
  }

  const inverterGroups = groupsFor(inverter);
  const batteryGroups = groupsFor(battery);
  const sharedGroup = inverterGroups.find((group) => batteryGroups.includes(group));
  const explicitlyCompatible = exception?.status === 'compatible' || exception?.status === 'preferred';

  if (!sharedGroup && !explicitlyCompatible) {
    return { compatible: false, preferred: false, reason: 'No shared compatibility family.' };
  }

  return {
    compatible: true,
    preferred: exception?.status === 'preferred',
    group: sharedGroup,
    reason: exception?.status === 'preferred'
      ? 'Preferred product compatibility.'
      : sharedGroup
        ? `Shared ${sharedGroup} compatibility family.`
        : 'Explicitly marked compatible.'
  };
};

const isLive = (product: PackageEngineProduct) =>
  product.active !== false &&
  product.packageEligible !== false &&
  product.available !== false &&
  (product.category !== 'inverter' || product.brandPackageGenerationEnabled !== false);

const productPrice = (product: PackageEngineProduct, quantity: number) =>
  product.price == null ? null : product.price * quantity;

const createInverterConfigurations = (products: PackageEngineProduct[]) => products.flatMap((product) => {
  const capacity = product.capacityKw ?? 0;
  if (capacity <= 0) return [];
  const configurations: InverterConfiguration[] = [{ product, quantity: 1, totalCapacityKw: capacity }];
  if (!product.parallelSupported) return configurations;
  const maximum = Math.max(1, Math.floor(product.maxParallelUnits ?? 1));
  for (let quantity = 2; quantity <= maximum; quantity += 1) {
    configurations.push({ product, quantity, totalCapacityKw: round(capacity * quantity) });
  }
  return configurations;
});

const createBatteryConfigurations = (
  inverter: PackageEngineProduct,
  products: PackageEngineProduct[],
  exceptions: PackageCompatibilityException[]
) => products.flatMap((product) => {
  const compatibility = evaluateBatteryCompatibility(inverter, product, exceptions);
  if (!compatibility.compatible) return [];
  const unitCapacity = product.capacityKwh ?? 0;
  if (unitCapacity <= 0 || unitCapacity > MAX_RESIDENTIAL_BATTERY_UNIT_CAPACITY_KWH) return [];
  const maximum = resolveAllowedBatteryQuantity({
    unitCapacityKwh: unitCapacity,
    parallelSupported: product.parallelSupported === true,
    technicalMaximumParallelModules: product.maxParallelModules ?? product.maxParallelUnits,
    commercialMaximumParallelModules: product.commercialMaxParallelModules,
  });
  return Array.from({ length: maximum }, (_, index): BatteryConfiguration => {
    const quantity = index + 1;
    return {
      product,
      quantity,
      totalCapacityKwh: round(unitCapacity * quantity),
      compatibilityGroup: compatibility.group,
      preferred: compatibility.preferred
    };
  });
});

const sortByCapacity = <T extends { totalCapacityKw?: number; totalCapacityKwh?: number; product: PackageEngineProduct }>(items: T[]) =>
  [...items].sort((left, right) =>
    (left.totalCapacityKw ?? left.totalCapacityKwh ?? 0) - (right.totalCapacityKw ?? right.totalCapacityKwh ?? 0) ||
    (right.product.priority ?? 0) - (left.product.priority ?? 0) ||
    ((left as T & { quantity?: number }).quantity ?? 1) - ((right as T & { quantity?: number }).quantity ?? 1) ||
    (left.product.price ?? Number.MAX_SAFE_INTEGER) - (right.product.price ?? Number.MAX_SAFE_INTEGER)
  );

const minimumBasicRatio = (percentage?: number | null) => {
  const parsed = Number(percentage);
  if (!Number.isFinite(parsed) || parsed <= 0) return DEFAULT_MINIMUM_BASIC_SIZING_PERCENTAGE / 100;
  return parsed > 1 ? parsed / 100 : parsed;
};

const selectCapacityTiers = <T extends { totalCapacityKw?: number; totalCapacityKwh?: number }>(
  items: T[],
  required: number,
  minimumBasicPercentage?: number | null
) => {
  const capacity = (item: T) => item.totalCapacityKw ?? item.totalCapacityKwh ?? 0;
  const sorted = [...items].sort((left, right) => capacity(left) - capacity(right));
  const recommendedIndex = sorted.findIndex((item) => capacity(item) >= required);
  const recommended = recommendedIndex >= 0 ? sorted[recommendedIndex] : undefined;
  const minimumBasicCapacity = required * minimumBasicRatio(minimumBasicPercentage);
  const basic = [...sorted].reverse().find((item) =>
    capacity(item) < required &&
    capacity(item) >= minimumBasicCapacity
  );
  const better = recommended
    ? sorted.find((item) => capacity(item) > capacity(recommended))
    : undefined;
  return { basic, recommended, better };
};

const batteryConfigurationPrice = (configuration: BatteryConfiguration) =>
  configuration.product.price == null
    ? Number.MAX_SAFE_INTEGER
    : configuration.product.price * configuration.quantity;

const batteryAvailabilityPriority = (configuration: BatteryConfiguration) =>
  normalizePackageText(configuration.product.stockStatus ?? '').includes('onrequest') ? 1 : 0;

const batteryPriceAndIdTieBreak = (
  left: BatteryConfiguration,
  right: BatteryConfiguration
) =>
  batteryConfigurationPrice(left) - batteryConfigurationPrice(right) ||
  left.product.id.localeCompare(right.product.id);

const recommendedBatteryTieBreak = (
  left: BatteryConfiguration,
  right: BatteryConfiguration
) =>
  batteryConfigurationPrice(left) - batteryConfigurationPrice(right) ||
  batteryAvailabilityPriority(left) - batteryAvailabilityPriority(right) ||
  left.product.id.localeCompare(right.product.id);

const selectBatteryCapacityTiers = (
  items: BatteryConfiguration[],
  targetKwh: number,
  acceptableShortfallPercent = DEFAULT_ACCEPTABLE_BATTERY_SHORTFALL_PERCENT,
  allowBelowTarget = false
) => {
  const normalizedTarget = Math.max(0, Number(targetKwh) || 0);
  const parsedTolerance = Number(acceptableShortfallPercent);
  const normalizedTolerance = Number.isFinite(parsedTolerance)
    ? Math.max(0, Math.min(100, parsedTolerance))
    : DEFAULT_ACCEPTABLE_BATTERY_SHORTFALL_PERCENT;
  const shortfallKwh = (item: BatteryConfiguration) =>
    Math.max(0, normalizedTarget - item.totalCapacityKwh);
  const shortfallPercent = (item: BatteryConfiguration) =>
    normalizedTarget > 0 ? (shortfallKwh(item) / normalizedTarget) * 100 : 0;

  const basic = [...items]
    .filter((item) =>
      allowBelowTarget &&
      item.totalCapacityKwh < normalizedTarget &&
      shortfallPercent(item) <= normalizedTolerance
    )
    .sort((left, right) =>
      left.quantity - right.quantity ||
      shortfallKwh(left) - shortfallKwh(right) ||
      batteryPriceAndIdTieBreak(left, right)
    )[0];

  // Apply the same practical capacity shortlist used by Step 6 before
  // quantity ranking. This keeps a selected 20 kWh bank from becoming 24 kWh
  // merely because the latter uses fewer physical modules.
  const recommendedShortlist = createRecommendedCapacityShortlist(
    items,
    (item) => item.totalCapacityKwh,
    normalizedTarget,
  );
  const recommended = [...recommendedShortlist.practicalShortlist]
    .sort((left, right) =>
      left.quantity - right.quantity ||
      (left.totalCapacityKwh - normalizedTarget) - (right.totalCapacityKwh - normalizedTarget) ||
      recommendedBatteryTieBreak(left, right)
    )[0];

  // A selected Load-Managed tier compares both tolerated-below and covering
  // equivalents as one customer-facing pool. This prevents a 3-unit covering
  // bank from masking a valid 2-unit near-target bank.
  const primary = allowBelowTarget
    ? [...recommendedShortlist.practicalShortlist, ...items.filter((item) =>
      item.totalCapacityKwh < normalizedTarget &&
      shortfallPercent(item) <= normalizedTolerance
    )]
      .sort((left, right) =>
        left.quantity - right.quantity ||
        Math.abs(left.totalCapacityKwh - normalizedTarget) -
          Math.abs(right.totalCapacityKwh - normalizedTarget) ||
        batteryPriceAndIdTieBreak(left, right)
      )[0]
    : recommended;

  const better = recommended
    ? [...items]
      .filter((item) => item.totalCapacityKwh > recommended.totalCapacityKwh)
      .sort((left, right) =>
        left.quantity - right.quantity ||
        (left.totalCapacityKwh - recommended.totalCapacityKwh) -
          (right.totalCapacityKwh - recommended.totalCapacityKwh) ||
        batteryPriceAndIdTieBreak(left, right)
      )[0]
    : undefined;

  return { basic, recommended, better, primary };
};

const selectPanel = (
  products: PackageEngineProduct[],
  requiredSolarKw: number,
  selectedPanelWattage?: number
) => products
  .map((product) => {
    const panelWattage = product.panelWattage ?? 0;
    if (panelWattage <= 0) return null;
    const quantity = Math.max(1, Math.ceil((requiredSolarKw * 1000) / panelWattage));
    const totalCapacityKw = round((quantity * panelWattage) / 1000);
    const unitPrice = product.pricePerWatt != null
      ? product.pricePerWatt * panelWattage
      : product.price ?? null;
    return {
      product,
      quantity,
      panelWattage,
      totalCapacityKw,
      unitPrice,
      preferredWattage: selectedPanelWattage === panelWattage,
      oversize: totalCapacityKw - requiredSolarKw
    };
  })
  .filter((item): item is NonNullable<typeof item> => Boolean(item))
  .sort((left, right) =>
    Number(right.preferredWattage) - Number(left.preferredWattage) ||
    Number(right.product.available !== false) - Number(left.product.available !== false) ||
    left.oversize - right.oversize ||
    (right.product.priority ?? 0) - (left.product.priority ?? 0) ||
    (left.unitPrice ?? Number.MAX_SAFE_INTEGER) - (right.unitPrice ?? Number.MAX_SAFE_INTEGER)
  )[0];

const reasonForTier = (tier: Exclude<PackageTier, 'alternative'>) => {
  if (tier === 'basic') return 'Lower-cost nearest available configuration.';
  if (tier === 'better') return 'Additional capacity for backup or future expansion.';
  return 'Nearest configuration that meets the selected requirements.';
};

const buildCandidate = (
  tier: Exclude<PackageTier, 'alternative'>,
  inverter: InverterConfiguration,
  battery: BatteryConfiguration | undefined,
  panel: NonNullable<ReturnType<typeof selectPanel>>,
  input: GeneratePackageEngineInput
): GeneratedPackage => {
  const limitations: string[] = [];
  if (inverter.totalCapacityKw < input.requiredInverterKw) {
    limitations.push(`Inverter capacity is ${round(input.requiredInverterKw - inverter.totalCapacityKw, 1)} kW below the selected requirement.`);
  }
  if (input.requiredBatteryKwh > 0 && battery && battery.totalCapacityKwh < input.requiredBatteryKwh) {
    limitations.push(`Battery capacity is ${round(input.requiredBatteryKwh - battery.totalCapacityKwh, 1)} kWh below the selected backup requirement.`);
  }
  if (inverter.quantity > 1) {
    limitations.push(`${inverter.quantity} matching inverter units are used in parallel.`);
  }

  const inverterTotal = productPrice(inverter.product, inverter.quantity);
  const batteryTotal = battery ? productPrice(battery.product, battery.quantity) : 0;
  const panelTotal = panel.unitPrice == null ? null : panel.unitPrice * panel.quantity;
  const configuredCosts = Math.max(0, input.configuredInstallationCost ?? 0) +
    Math.max(0, input.configuredStructureCost ?? 0) +
    Math.max(0, input.configuredAccessoriesCost ?? 0);
  const totalPrice = inverterTotal == null || batteryTotal == null || panelTotal == null
    ? null
    : round(inverterTotal + batteryTotal + panelTotal + configuredCosts);
  const inverterShortfall = Math.max(0, input.requiredInverterKw - inverter.totalCapacityKw);
  const batteryShortfall = Math.max(0, input.requiredBatteryKwh - (battery?.totalCapacityKwh ?? 0));
  const inverterOversize = Math.max(0, inverter.totalCapacityKw - input.requiredInverterKw);
  const batteryOversize = Math.max(0, (battery?.totalCapacityKwh ?? 0) - input.requiredBatteryKwh);
  const priority = (inverter.product.brandPriority ?? 0) +
    (inverter.product.priority ?? 0) +
    (battery?.product.priority ?? 0) +
    (panel.product.priority ?? 0);
  const score = round(
    inverterShortfall * 100 +
    batteryShortfall * 80 +
    inverterOversize * 3 +
    batteryOversize * 2 +
    panel.oversize +
    Math.max(0, inverter.quantity - 1) * 8 -
    priority * 0.5 -
    (battery?.preferred ? 10 : 0) +
    (totalPrice == null ? 2 : Math.min(totalPrice / 10_000_000, 5)),
    3
  );

  return {
    id: [tier, inverter.product.brandId, inverter.product.id, `x${inverter.quantity}`, battery?.product.id ?? 'no-battery', `x${battery?.quantity ?? 0}`, panel.product.id].join('-'),
    packageType: tier,
    primaryBrandId: inverter.product.brandId,
    primaryBrand: inverter.product.brandName,
    packageImageUrl: inverter.product.brandPackageImageUrl,
    brandLogo: inverter.product.brandLogo,
    inverter: {
      productId: inverter.product.id,
      quantity: inverter.quantity,
      totalCapacityKw: inverter.totalCapacityKw
    },
    battery: battery ? {
      productId: battery.product.id,
      quantity: battery.quantity,
      totalCapacityKwh: battery.totalCapacityKwh
    } : undefined,
    panel: {
      productId: panel.product.id,
      quantity: panel.quantity,
      panelWattage: panel.panelWattage,
      totalCapacityKw: panel.totalCapacityKw
    },
    compatibilityGroup: battery?.compatibilityGroup,
    preferredCompatibility: Boolean(battery?.preferred),
    totalPrice,
    recommendationReason: reasonForTier(tier),
    limitations,
    score
  };
};

const describeConfiguration = (
  configuration: InverterConfiguration | BatteryConfiguration | undefined,
  unit: 'kW' | 'kWh'
) => configuration
  ? `${configuration.product.brandName} ${configuration.product.model ?? configuration.product.name} (${'totalCapacityKw' in configuration ? configuration.totalCapacityKw : configuration.totalCapacityKwh} ${unit})`
  : undefined;

const evaluateCatalogPackages = (input: GeneratePackageEngineInput) => {
  const liveProducts = input.products.filter(isLive);
  const panels = liveProducts.filter((product) => product.category === 'panel');
  const inverters = liveProducts.filter((product) =>
    product.category === 'inverter' &&
    (!input.phase || !product.phase || product.phase === input.phase)
  );
  const batteries = liveProducts.filter((product) => product.category === 'battery');
  const panel = selectPanel(panels, input.requiredSolarKw, input.selectedPanelWattage);
  const eligiblePanels = panels
    .filter((product) => (product.panelWattage ?? 0) > 0)
    .map((product) => `${product.brandName} ${product.model ?? product.name} (${product.panelWattage} W)`);
  const diagnostics: PackageGenerationDiagnostic[] = [];
  if (!panel || inverters.length === 0) {
    return {
      packages: [],
      diagnostics: [{
        templateName: 'Catalog',
        live: liveProducts.length > 0,
        requiredInverterKw: input.requiredInverterKw,
        eligibleInverterProducts: inverters.map((product) => `${product.brandName} ${product.model ?? product.name} (${product.capacityKw} kW)`),
        compatibleBatteryFamilies: [],
        eligibleBatteryProducts: [],
        eligiblePanels,
        generated: false,
        rejectionReason: !panel ? 'No eligible panel product found.' : 'No eligible inverter products found.'
      }]
    };
  }

  const configurations = createInverterConfigurations(inverters).filter((configuration) =>
    configuration.product.maximumRecommendedPvKwp == null ||
    configuration.product.maximumRecommendedPvKwp * configuration.quantity >= input.requiredSolarKw
  );
  const byBrand = new Map<string, InverterConfiguration[]>();
  configurations.forEach((configuration) => {
    const key = configuration.product.brandId || normalizePackageText(configuration.product.brandName);
    byBrand.set(key, [...(byBrand.get(key) ?? []), configuration]);
  });

  const candidatesByBrand = new Map<string, Partial<Record<'basic' | 'recommended' | 'better', GeneratedPackage>>>();
  byBrand.forEach((brandConfigurations, brandKey) => {
    const templateName = brandConfigurations[0]?.product.brandName ?? brandKey;
    // Size tiers must be selected from configurations that can form a complete
    // package. Otherwise a nearer but unconfigured inverter can mask a slightly
    // smaller valid inverter and incorrectly reduce the whole brand to zero.
    const completeConfigurations = input.requiredBatteryKwh > 0
      ? brandConfigurations.filter((configuration) => createBatteryConfigurations(
        configuration.product,
        batteries,
        input.compatibilityExceptions ?? []
      ).length > 0)
      : brandConfigurations;
    const inverterTiers = selectCapacityTiers(
      sortByCapacity(completeConfigurations),
      input.requiredInverterKw,
      input.minimumBasicSizingPercentage
    );
    const result: Partial<Record<'basic' | 'recommended' | 'better', GeneratedPackage>> = {};
    const diagnostic: PackageGenerationDiagnostic = {
      templateName,
      live: brandConfigurations.some((configuration) => isLive(configuration.product)),
      requiredInverterKw: input.requiredInverterKw,
      eligibleInverterProducts: brandConfigurations.map((configuration) =>
        `${configuration.product.brandName} ${configuration.product.model ?? configuration.product.name} (${configuration.totalCapacityKw} kW)`
      ),
      compatibleBatteryFamilies: [],
      eligibleBatteryProducts: [],
      eligiblePanels,
      generated: false,
      rejectionReason: ''
    };

    if (completeConfigurations.length === 0) {
      diagnostic.rejectionReason = input.requiredBatteryKwh > 0
        ? 'No inverter in this brand has a compatible active battery product.'
        : 'No complete inverter configuration found.';
      diagnostics.push(diagnostic);
      candidatesByBrand.set(brandKey, result);
      return;
    }

    if (!inverterTiers.basic && !inverterTiers.recommended && !inverterTiers.better) {
      const highestCapacity = Math.max(...completeConfigurations.map((configuration) => configuration.totalCapacityKw));
      diagnostic.rejectionReason = `Highest valid inverter is ${highestCapacity} kW against a ${input.requiredInverterKw} kW requirement; Basic minimum is ${round(input.requiredInverterKw * minimumBasicRatio(input.minimumBasicSizingPercentage), 1)} kW.`;
      diagnostics.push(diagnostic);
      candidatesByBrand.set(brandKey, result);
      return;
    }

    (['basic', 'recommended', 'better'] as const).forEach((tier) => {
      const inverter = tier === 'basic'
        ? inverterTiers.basic ?? inverterTiers.recommended
        : tier === 'better'
          ? inverterTiers.better ?? inverterTiers.recommended
          : inverterTiers.recommended;
      if (!inverter) return;
      let battery: BatteryConfiguration | undefined;
      let batteryTiers: ReturnType<typeof selectBatteryCapacityTiers> | undefined;
      if (input.requiredBatteryKwh > 0) {
        const batteryConfigurations = createBatteryConfigurations(
          inverter.product,
          batteries,
          input.compatibilityExceptions ?? []
        );
        batteryTiers = selectBatteryCapacityTiers(
          batteryConfigurations,
          input.requiredBatteryKwh,
          input.acceptableBatteryShortfallPercent,
          input.selectedBatteryTier === 'loadManaged'
        );
        battery = tier === 'basic'
          ? batteryTiers.basic ?? batteryTiers.recommended
          : tier === 'better'
            ? batteryTiers.better ?? batteryTiers.recommended
            : batteryTiers.primary;
        if (!battery) return;
        diagnostic.compatibleBatteryFamilies = [...new Set(batteryConfigurations.map((configuration) => configuration.compatibilityGroup).filter((group): group is string => Boolean(group)))];
        diagnostic.eligibleBatteryProducts = batteryConfigurations.map((configuration) =>
          `${configuration.product.brandName} ${configuration.product.model ?? configuration.product.name} (${configuration.totalCapacityKwh} kWh)`
        );
      }
      if (
        tier === 'basic' &&
        inverter === inverterTiers.recommended &&
        (!batteryTiers || battery === batteryTiers.recommended)
      ) return;
      if (
        tier === 'better' &&
        inverter === inverterTiers.recommended &&
        (!batteryTiers || battery === batteryTiers.recommended)
      ) return;
      result[tier] = buildCandidate(tier, inverter, battery, panel, input);
    });

    const selected = result.recommended ?? result.basic ?? result.better;
    diagnostic.generated = Boolean(selected);
    diagnostic.selectedInverter = describeConfiguration(
      selected
        ? {
          product: completeConfigurations.find((configuration) => configuration.product.id === selected.inverter.productId)?.product ?? completeConfigurations[0].product,
          quantity: selected.inverter.quantity,
          totalCapacityKw: selected.inverter.totalCapacityKw
        }
        : undefined,
      'kW'
    );
    diagnostic.selectedBattery = selected?.battery
      ? diagnostic.eligibleBatteryProducts.find((label) => label.includes(`(${selected.battery?.totalCapacityKwh} kWh)`))
      : undefined;
    diagnostic.rejectionReason = selected
      ? `Generated ${selected.packageType} package.`
      : diagnostic.rejectionReason || 'No valid Basic, Recommended, or Better tier could be formed.';
    diagnostics.push(diagnostic);
    candidatesByBrand.set(brandKey, result);
  });

  // Explore Packages needs one independently sized package per eligible brand.
  // A valid Fox result must never suppress GoodWe, Solis, or any future brand.
  const packages = [...candidatesByBrand.values()]
    .map((tiers) => tiers.recommended ?? tiers.basic ?? tiers.better)
    .filter((item): item is GeneratedPackage => Boolean(item))
    .sort((left, right) => left.score - right.score || left.primaryBrand.localeCompare(right.primaryBrand));
  return { packages, diagnostics };
};

export function generateCatalogPackageDiagnostics(input: GeneratePackageEngineInput): PackageGenerationDiagnostic[] {
  return evaluateCatalogPackages(input).diagnostics;
}

export function generateCatalogPackages(input: GeneratePackageEngineInput): GeneratedPackage[] {
  return evaluateCatalogPackages(input).packages;
}
