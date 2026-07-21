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

export const VERSION = "0.0.0";
