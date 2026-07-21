/** Public library API. The CLI is a thin consumer of these exports. */
export type {
  Confidence,
  DependencyKind,
  DependencySource,
  Detector,
  Finding,
  IgnoreRule,
  PackageFacts,
  Report,
  ScanVerdict,
  Severity,
  SuppressedFinding,
} from "./core/model.js";
export { applyIgnores } from "./core/ignore.js";
export { loadConfig, ConfigError, CONFIG_FILENAME, type Config } from "./config.js";
export { SEVERITY_ORDER } from "./core/model.js";
export { runDetectors } from "./core/engine.js";
export { builtinDetectors } from "./core/rules/index.js";
export { renderTerminal } from "./output/terminal.js";
export { renderJson, JSON_SCHEMA_VERSION } from "./output/json.js";
export { renderSarif } from "./output/sarif.js";
export { renderMarkdown, MARKDOWN_COMMENT_MARKER } from "./output/markdown.js";
export { resolveExitCode } from "./output/exit-code.js";
export { introducedFacts } from "./core/diff.js";
export { readManifestFacts, classifySource } from "./ecosystems/npm/manifest.js";
export {
  readLockfile,
  readLockfileFile,
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
export { scanProject, checkPackage, diffScan, type ScanOptions } from "./scan.js";

import { readFileSync } from "node:fs";

// Single source of truth: read the version from package.json, which ships at the
// tarball root next to dist/, so the CLI and reports never drift from the manifest.
const pkg = JSON.parse(readFileSync(new URL("../package.json", import.meta.url), "utf8")) as {
  version: string;
};

export const VERSION = pkg.version;
