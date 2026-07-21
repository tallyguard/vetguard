import type { Report, Severity } from "../core/model.js";

const SEVERITY_LABEL: Record<Severity, string> = {
  critical: "CRIT",
  high: "HIGH",
  medium: "MED ",
  low: "LOW ",
  info: "INFO",
};

/** Renders a report as plain text. No color codes yet; kept dependency-free. */
export function renderTerminal(report: Report): string {
  const lines: string[] = [];
  lines.push(`vetguard: scanned ${report.packagesScanned} package(s) in ${report.target}`);

  if (report.findings.length === 0) {
    lines.push(
      report.verdict === "could-not-verify"
        ? "No findings, but some packages could not be verified (see below)."
        : "No findings.",
    );
  }

  for (const f of report.findings) {
    const version = f.packageVersion ? `@${f.packageVersion}` : "";
    lines.push(`[${SEVERITY_LABEL[f.severity]}] ${f.packageName}${version}  (${f.ruleId})`);
    lines.push(`       ${f.title}`);
    lines.push(`       ${f.detail}`);
    if (f.location) lines.push(`       at ${f.location}`);
  }

  if (report.unverified.length > 0) {
    lines.push(`Could not verify: ${report.unverified.join(", ")}`);
  }

  lines.push(`Verdict: ${report.verdict}`);
  return lines.join("\n");
}
