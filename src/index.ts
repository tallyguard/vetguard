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
export { renderJson, JSON_SCHEMA_VERSION } from "./output/json.js";
export { renderSarif } from "./output/sarif.js";
export { resolveExitCode } from "./output/exit-code.js";
export { readManifestFacts, classifySource } from "./ecosystems/npm/manifest.js";
export {
  readLockfile,
  detectOtherLockfiles,
  nameFromLockPath,
  type LockfileOutcome,
} from "./ecosystems/npm/lockfile.js";
export {
  createRegistryClient,
  encodePackageName,
  type Packument,
  type RegistryClient,
  type RegistryClientOptions,
  type RegistryLookup,
} from "./ecosystems/npm/registry.js";
export {
  createDownloadsClient,
  type DownloadsClient,
  type DownloadsClientOptions,
} from "./ecosystems/npm/downloads.js";
export {
  enrichWithRegistry,
  type EnrichmentResult,
  type EnrichOptions,
} from "./ecosystems/npm/enrich.js";
export { parsePackageSpec, type PackageSpec } from "./ecosystems/npm/spec.js";
export { scanProject, checkPackage, type ScanOptions } from "./scan.js";

export const VERSION = "0.0.0";
