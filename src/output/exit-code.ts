import { SEVERITY_ORDER, type Report, type Severity } from "../core/model.js";

/**
 * The process exit code for a report. No findings is always 0. With no
 * threshold any finding is 1; with a threshold only a finding at or above that
 * severity is 1, so CI can gate on high-severity results alone.
 */
export function resolveExitCode(report: Report, failOn: Severity | undefined): number {
  if (report.findings.length === 0) return 0;
  if (failOn === undefined) return 1;
  const threshold = SEVERITY_ORDER[failOn];
  return report.findings.some((f) => SEVERITY_ORDER[f.severity] >= threshold) ? 1 : 0;
}
