import type { Report, Severity } from "../core/model.js";

/** Marker so an automated PR comment can find and update its previous post in place. */
export const MARKDOWN_COMMENT_MARKER = "<!-- vetguard-report -->";

const SEVERITY_LABEL: Record<Severity, string> = {
  critical: "critical",
  high: "high",
  medium: "medium",
  low: "low",
  info: "info",
};

/**
 * Neutralizes an untrusted value so it cannot break out of a markdown table
 * cell or inject content into the rendered comment. In diff mode the package
 * name and version come from the pull request's own lockfile, so they are
 * attacker-controlled: collapse line breaks (no row or heading breakout),
 * escape the pipe (no cell breakout), escape angle brackets (no raw HTML), and
 * escape backticks (no code-span games).
 */
function cell(value: string): string {
  return value
    .replace(/[\r\n]+/g, " ")
    .replace(/`/g, "\\`")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/\|/g, "\\|");
}

/** Renders a report as compact markdown for a PR comment or CI job summary. */
export function renderMarkdown(report: Report): string {
  const lines: string[] = [MARKDOWN_COMMENT_MARKER];
  const from = report.basis === "lockfile" ? " from `package-lock.json`" : "";
  lines.push(`### vetguard: ${report.verdict}`);
  lines.push("");
  lines.push(`Scanned ${report.packagesScanned} package(s)${from} in \`${report.target}\`.`);

  for (const warning of report.warnings ?? []) {
    lines.push("");
    lines.push(`> warning: ${warning}`);
  }

  if (report.findings.length > 0) {
    lines.push("");
    lines.push("| Severity | Package | Rule | Finding |");
    lines.push("| --- | --- | --- | --- |");
    for (const f of report.findings) {
      const pkg = f.packageVersion ? `${f.packageName}@${f.packageVersion}` : f.packageName;
      lines.push(
        `| ${SEVERITY_LABEL[f.severity]} | ${cell(pkg)} | ${cell(f.ruleId)} | ${cell(f.title)} |`,
      );
    }
  } else {
    lines.push("");
    lines.push(
      report.verdict === "could-not-verify"
        ? "No findings, but some packages could not be verified."
        : "No findings.",
    );
  }

  if (report.unverified.length > 0) {
    lines.push("");
    lines.push(`Could not verify ${report.unverified.length} package(s).`);
  }

  return lines.join("\n") + "\n";
}
