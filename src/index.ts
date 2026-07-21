/** Public library API. The CLI is a thin consumer of these exports. */
export type {
  Confidence,
  DependencyKind,
  DependencySource,
  Detector,
  Finding,
  PackageFacts,
  Report,
  ScanVerdict,
  Severity,
} from "./core/model.js";
export { SEVERITY_ORDER } from "./core/model.js";
export { runDetectors } from "./core/engine.js";
export { builtinDetectors } from "./core/rules/index.js";
export { renderTerminal } from "./output/terminal.js";
export { readManifestFacts, classifySource } from "./ecosystems/npm/manifest.js";
export {
  createRegistryClient,
  encodePackageName,
  type Packument,
  type RegistryClient,
  type RegistryClientOptions,
  type RegistryLookup,
} from "./ecosystems/npm/registry.js";
export { enrichWithRegistry, type EnrichmentResult } from "./ecosystems/npm/enrich.js";
export { parsePackageSpec, type PackageSpec } from "./ecosystems/npm/spec.js";

export const VERSION = "0.0.0";
