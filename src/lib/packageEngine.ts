// One canonical, pure engine is shared with the customer app. Keep admin preview
// mapping/UI here, but do not create a second package-sizing implementation.
export {
  evaluateBatteryCompatibility,
  generateCatalogPackageDiagnostics,
  generateCatalogPackages,
  normalizePackageText,
} from "../../../kaamAsaan-mobile-app/src/utils/packageEngine";
export type {
  GeneratedPackage,
  PackageCompatibilityException,
  PackageEngineProduct,
  PackageGenerationDiagnostic,
  PackagePhase,
} from "../../../kaamAsaan-mobile-app/src/utils/packageEngine";
