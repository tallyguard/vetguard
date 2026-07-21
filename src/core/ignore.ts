import type { Finding, IgnoreRule, SuppressedFinding } from "./model.js";

function matches(finding: Finding, ignore: IgnoreRule): boolean {
  return finding.ruleId === ignore.rule && finding.packageName === ignore.package;
}

/**
 * Partitions findings into those that remain active and those a configured
 * ignore rule suppresses. A suppressed finding keeps its data and gains the
 * ignore's reason, so it is reported as suppressed rather than silently
 * dropped. Active findings alone drive the verdict and exit code.
 */
export function applyIgnores(
  findings: readonly Finding[],
  ignores: readonly IgnoreRule[],
): { active: Finding[]; suppressed: SuppressedFinding[] } {
  if (ignores.length === 0) return { active: [...findings], suppressed: [] };

  const active: Finding[] = [];
  const suppressed: SuppressedFinding[] = [];
  for (const finding of findings) {
    const ignore = ignores.find((rule) => matches(finding, rule));
    if (ignore) {
      suppressed.push({ ...finding, suppressedReason: ignore.reason });
    } else {
      active.push(finding);
    }
  }
  return { active, suppressed };
}
