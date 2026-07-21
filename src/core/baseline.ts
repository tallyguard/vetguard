import type { BaselineEntry, Finding, SuppressedFinding } from "./model.js";

const BASELINE_REASON = "in baseline (pre-existing)";

function matches(finding: Finding, entry: BaselineEntry): boolean {
  return (
    finding.ruleId === entry.rule &&
    finding.packageName === entry.package &&
    (finding.packageVersion ?? "") === (entry.version ?? "")
  );
}

/**
 * Partitions findings into new (absent from the baseline) and pre-existing
 * (present in it). A baselined finding is reported as suppressed, so the
 * pre-existing state is visible but only genuinely new findings drive the
 * verdict. This is what lets a project adopt vetguard on a messy tree today and
 * ratchet the baseline down over time.
 */
export function applyBaseline(
  findings: readonly Finding[],
  baseline: readonly BaselineEntry[],
): { active: Finding[]; suppressed: SuppressedFinding[] } {
  if (baseline.length === 0) return { active: [...findings], suppressed: [] };

  const active: Finding[] = [];
  const suppressed: SuppressedFinding[] = [];
  for (const finding of findings) {
    if (baseline.some((entry) => matches(finding, entry))) {
      suppressed.push({ ...finding, suppressedReason: BASELINE_REASON });
    } else {
      active.push(finding);
    }
  }
  return { active, suppressed };
}

/** Reduces findings to baseline entries, the snapshot a `baseline` run records. */
export function toBaselineEntries(findings: readonly Finding[]): BaselineEntry[] {
  return findings.map((f) => ({
    rule: f.ruleId,
    package: f.packageName,
    ...(f.packageVersion === undefined ? {} : { version: f.packageVersion }),
  }));
}
