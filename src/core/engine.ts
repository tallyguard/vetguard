import type { Detector, Finding, IgnoreRule, PackageFacts, Report, ScanVerdict } from "./model.js";
import { SEVERITY_ORDER } from "./model.js";
import { applyIgnores } from "./ignore.js";

interface DetectContext {
  target: string;
  ecosystem: string;
  unverified: string[];
  generatedAt: string;
  ignore?: readonly IgnoreRule[];
}

/**
 * Runs every detector over every package's facts and aggregates a report.
 * This is deliberately pure: given the same facts and detectors it produces
 * the same report, which is what makes CI runs deterministic and testable.
 */
export function runDetectors(
  facts: PackageFacts[],
  detectors: Detector[],
  context: DetectContext,
): Report {
  const raw: Finding[] = [];
  for (const pkg of facts) {
    for (const detector of detectors) {
      raw.push(...detector.detect(pkg));
    }
  }

  raw.sort(
    (a, b) =>
      SEVERITY_ORDER[b.severity] - SEVERITY_ORDER[a.severity] ||
      a.packageName.localeCompare(b.packageName),
  );

  const { active, suppressed } = applyIgnores(raw, context.ignore ?? []);
  const verdict = decideVerdict(active, context.unverified);

  return {
    verdict,
    target: context.target,
    ecosystem: context.ecosystem,
    packagesScanned: facts.length,
    findings: active,
    ...(suppressed.length > 0 ? { suppressed } : {}),
    unverified: context.unverified,
    generatedAt: context.generatedAt,
  };
}

/**
 * Honest degradation: findings win, then "could-not-verify" if anything was
 * unverifiable, and only a fully-checked clean scan reports "clean". We never
 * report clean when we could not actually look.
 */
function decideVerdict(findings: Finding[], unverified: string[]): ScanVerdict {
  if (findings.length > 0) return "findings";
  if (unverified.length > 0) return "could-not-verify";
  return "clean";
}
