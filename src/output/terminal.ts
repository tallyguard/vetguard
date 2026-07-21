import type { Report, ScanVerdict, Severity } from "../core/model.js";
import { paint, severityColor } from "./color.js";

const SEVERITY_LABEL: Record<Severity, string> = {
  critical: "CRIT",
  high: "HIGH",
  medium: "MED ",
  low: "LOW ",
  info: "INFO",
};

const VERDICT_COLOR = {
  findings: "red",
  "could-not-verify": "yellow",
  clean: "green",
} as const;

export interface TerminalOptions {
  /** ANSI colors; the CLI enables this only on a TTY without NO_COLOR. */
  color?: boolean;
  /** Print only findings and the verdict, no header or informational lines. */
  quiet?: boolean;
}

/** Renders a report as text. Dependency-free; colors are opt-in and TTY-gated by the caller. */
export function renderTerminal(report: Report, options: TerminalOptions = {}): string {
  const color = options.color ?? false;
  const quiet = options.quiet ?? false;
  const lines: string[] = [];

  if (!quiet) {
    const from = report.basis === "lockfile" ? " from package-lock.json" : "";
    lines.push(`vetguard: scanned ${report.packagesScanned} package(s) in ${report.target}${from}`);

    for (const warning of report.warnings ?? []) {
      lines.push(paint(`warning: ${warning}`, "yellow", color));
    }

    if (report.findings.length === 0) {
      lines.push(
        report.verdict === "could-not-verify"
          ? "No findings, but some packages could not be verified (see below)."
          : "No findings.",
      );
    }
  }

  for (const f of report.findings) {
    const version = f.packageVersion ? `@${f.packageVersion}` : "";
    const label = paint(`[${SEVERITY_LABEL[f.severity]}]`, severityColor(f.severity), color);
    lines.push(`${label} ${f.packageName}${version}  (${f.ruleId})`);
    lines.push(`       ${f.title}`);
    lines.push(`       ${f.detail}`);
    if (f.location) lines.push(`       at ${f.location}`);
  }

  if (!quiet) {
    if (report.unverified.length > 0) {
      lines.push(`Could not verify: ${report.unverified.join(", ")}`);
    }
    for (const f of report.suppressed ?? []) {
      const version = f.packageVersion ? `@${f.packageVersion}` : "";
      lines.push(
        paint(
          `[SUPPRESSED] ${f.packageName}${version} (${f.ruleId}): ${f.suppressedReason}`,
          "gray",
          color,
        ),
      );
    }
  }

  lines.push(`Verdict: ${paint(report.verdict, verdictColor(report.verdict), color)}`);
  return lines.join("\n");
}

function verdictColor(verdict: ScanVerdict): "red" | "yellow" | "green" {
  return VERDICT_COLOR[verdict];
}
