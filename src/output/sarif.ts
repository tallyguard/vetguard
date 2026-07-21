import type { Detector, Report, Severity } from "../core/model.js";
import { builtinDetectors } from "../core/rules/index.js";

const INFO_URI = "https://github.com/Poolchaos/vetguard";

const LEVEL: Record<Severity, "error" | "warning" | "note"> = {
  critical: "error",
  high: "error",
  medium: "warning",
  low: "note",
  info: "note",
};

/** The file a finding annotates, relative to the repo, so code scanning can place it. */
function artifactUri(report: Report): string {
  return report.basis === "lockfile" ? "package-lock.json" : "package.json";
}

/**
 * Renders a report as SARIF 2.1.0 for GitHub code scanning. Findings become
 * results anchored to the manifest or lockfile; every built-in detector is
 * advertised as a rule so the tool's coverage is discoverable.
 */
export function renderSarif(
  report: Report,
  toolVersion: string,
  detectors: Detector[] = builtinDetectors,
): string {
  const uri = artifactUri(report);
  const rules = detectors.map((d) => ({
    id: d.id,
    name: d.id,
    shortDescription: { text: d.description },
    helpUri: INFO_URI,
  }));

  const results = report.findings.map((f) => ({
    ruleId: f.ruleId,
    level: LEVEL[f.severity],
    message: {
      text: `${f.packageName}${f.packageVersion ? `@${f.packageVersion}` : ""}: ${f.title}. ${f.detail}`,
    },
    locations: [{ physicalLocation: { artifactLocation: { uri } } }],
    properties: {
      severity: f.severity,
      confidence: f.confidence,
      packageName: f.packageName,
      ...(f.packageVersion === undefined ? {} : { packageVersion: f.packageVersion }),
      ...(f.evidence === undefined ? {} : { evidence: f.evidence }),
    },
  }));

  const doc = {
    $schema: "https://json.schemastore.org/sarif-2.1.0.json",
    version: "2.1.0",
    runs: [
      {
        tool: {
          driver: {
            name: "vetguard",
            version: toolVersion,
            informationUri: INFO_URI,
            rules,
          },
        },
        results,
      },
    ],
  };
  return JSON.stringify(doc, null, 2);
}
