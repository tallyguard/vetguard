/**
 * Dependency-free severity resolution for OSV advisories. Prefers the qualitative
 * label GHSA sets (`database_specific.severity`), falls back to computing a CVSS
 * v3.0/v3.1 base score from the vector, and floors at medium when neither is
 * available. Hand-rolled on purpose: a CVSS library would be a runtime dependency
 * and refute the near-zero-deps thesis.
 */
import type { Severity } from "../../core/model.js";
import { SEVERITY_ORDER } from "../../core/model.js";

export type SeveritySource = "label" | "cvss-v3" | "floor";

interface RawSeverityEntry {
  type?: string;
  score?: string;
}

/** The subset of an OSV vuln this module reads to derive a severity. */
export interface RawVulnSeverity {
  severity?: RawSeverityEntry[];
  database_specific?: { severity?: string } | null;
  affected?: Array<{
    severity?: RawSeverityEntry[];
    database_specific?: { severity?: string } | null;
  }>;
}

const LABELS: Record<string, Severity> = {
  CRITICAL: "critical",
  HIGH: "high",
  MODERATE: "medium",
  MEDIUM: "medium",
  LOW: "low",
};

/** CVSS 3.x qualitative bands. */
export function severityFromScore(score: number): Severity {
  if (score >= 9.0) return "critical";
  if (score >= 7.0) return "high";
  if (score >= 4.0) return "medium";
  if (score > 0.0) return "low";
  return "info";
}

// CVSS v3.1 base-metric weights.
const AV: Record<string, number> = { N: 0.85, A: 0.62, L: 0.55, P: 0.2 };
const AC: Record<string, number> = { L: 0.77, H: 0.44 };
const UI: Record<string, number> = { N: 0.85, R: 0.62 };
const CIA: Record<string, number> = { H: 0.56, L: 0.22, N: 0.0 };
const PR_UNCHANGED: Record<string, number> = { N: 0.85, L: 0.62, H: 0.27 };
const PR_CHANGED: Record<string, number> = { N: 0.85, L: 0.68, H: 0.5 };

/** The CVSS 3.1 Roundup: round up to one decimal place, float-safe. */
function roundup(input: number): number {
  const intInput = Math.round(input * 100000);
  if (intInput % 10000 === 0) return intInput / 100000;
  return (Math.floor(intInput / 10000) + 1) / 10;
}

/** Base score of a CVSS v3.0/v3.1 vector string, or undefined if not parseable. */
export function cvss3BaseScore(vector: string): number | undefined {
  if (!/^CVSS:3\.[01]\//.test(vector)) return undefined;
  const m = new Map<string, string>();
  for (const part of vector.split("/").slice(1)) {
    const [k, v] = part.split(":");
    if (k && v) m.set(k, v);
  }
  const scope = m.get("S");
  const av = AV[m.get("AV") ?? ""];
  const ac = AC[m.get("AC") ?? ""];
  const ui = UI[m.get("UI") ?? ""];
  const c = CIA[m.get("C") ?? ""];
  const i = CIA[m.get("I") ?? ""];
  const a = CIA[m.get("A") ?? ""];
  const pr = (scope === "C" ? PR_CHANGED : PR_UNCHANGED)[m.get("PR") ?? ""];
  if (
    av === undefined ||
    ac === undefined ||
    ui === undefined ||
    pr === undefined ||
    c === undefined ||
    i === undefined ||
    a === undefined ||
    (scope !== "U" && scope !== "C")
  ) {
    return undefined;
  }
  const iss = 1 - (1 - c) * (1 - i) * (1 - a);
  const impact =
    scope === "C" ? 7.52 * (iss - 0.029) - 3.25 * Math.pow(iss - 0.02, 15) : 6.42 * iss;
  if (impact <= 0) return 0;
  const exploitability = 8.22 * av * ac * pr * ui;
  const raw = scope === "C" ? 1.08 * (impact + exploitability) : impact + exploitability;
  return roundup(Math.min(raw, 10));
}

// labelOf/cvssVectorOf are total: OSV detail is untrusted, so `affected` and
// `severity` may be non-arrays and `database_specific` may be null. Guard every
// access; an unexpected shape yields undefined, never a throw.
function labelOf(vuln: RawVulnSeverity): string | undefined {
  const top = vuln.database_specific?.severity;
  if (typeof top === "string") return top;
  const affected = Array.isArray(vuln.affected) ? vuln.affected : [];
  const hit = affected.find((a) => typeof a?.database_specific?.severity === "string");
  return hit?.database_specific?.severity;
}

function cvssVectorOf(vuln: RawVulnSeverity): string | undefined {
  const affected = Array.isArray(vuln.affected) ? vuln.affected : [];
  const pools = [vuln.severity, ...affected.map((a) => a?.severity)];
  for (const pool of pools) {
    if (!Array.isArray(pool)) continue;
    const entry = pool.find((e) => e?.type === "CVSS_V3" && typeof e.score === "string");
    if (entry?.score) return entry.score;
  }
  return undefined;
}

/**
 * Resolves an OSV advisory's severity to vetguard's scale with a traceable
 * source. A known advisory we cannot rate is never dropped and never guessed
 * high or low: it floors at medium, so it stays visible without burning trust.
 */
export function resolveAdvisorySeverity(vuln: RawVulnSeverity): {
  severity: Severity;
  source: SeveritySource;
} {
  const candidates: { severity: Severity; source: SeveritySource }[] = [];
  const label = labelOf(vuln);
  if (label && LABELS[label.toUpperCase()]) {
    candidates.push({ severity: LABELS[label.toUpperCase()]!, source: "label" });
  }
  const vector = cvssVectorOf(vuln);
  if (vector) {
    const score = cvss3BaseScore(vector);
    if (score !== undefined) {
      candidates.push({ severity: severityFromScore(score), source: "cvss-v3" });
    }
  }
  if (candidates.length === 0) return { severity: "medium", source: "floor" };
  // Take the highest available rating so a low label can never mask a higher
  // CVSS, then clamp: a matched advisory is a known vulnerability, so it is never
  // rated below "low" (it must trip `--fail-on low`).
  const best = candidates.reduce((a, b) =>
    SEVERITY_ORDER[b.severity] > SEVERITY_ORDER[a.severity] ? b : a,
  );
  const severity = SEVERITY_ORDER[best.severity] < SEVERITY_ORDER.low ? "low" : best.severity;
  return { severity, source: best.source };
}
