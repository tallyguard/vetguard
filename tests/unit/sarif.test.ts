import { describe, expect, it } from "vitest";
import { renderSarif } from "../../src/output/sarif.js";
import type { Finding, Report } from "../../src/core/model.js";

function report(findings: Finding[], basis: Report["basis"] = "lockfile"): Report {
  return {
    verdict: findings.length > 0 ? "findings" : "clean",
    target: ".",
    ecosystem: "npm",
    packagesScanned: 1,
    findings,
    unverified: [],
    generatedAt: "2026-07-21T00:00:00.000Z",
    basis,
  };
}

const finding: Finding = {
  ruleId: "typosquat",
  severity: "high",
  confidence: "high",
  packageName: "expres",
  packageVersion: "1.0.0",
  title: "Name closely resembles a popular package",
  detail: "resembles express",
  evidence: "resembles express",
};

describe("renderSarif", () => {
  it("produces valid SARIF 2.1.0 with a tool driver and rules", () => {
    const doc = JSON.parse(renderSarif(report([finding]), "1.0.0"));
    expect(doc.version).toBe("2.1.0");
    expect(doc.runs[0].tool.driver.name).toBe("vetguard");
    expect(doc.runs[0].tool.driver.rules.length).toBeGreaterThan(0);
    expect(doc.runs[0].tool.driver.rules.some((r: { id: string }) => r.id === "typosquat")).toBe(
      true,
    );
  });

  it("maps a finding to a result anchored to the lockfile with the right level", () => {
    const result = JSON.parse(renderSarif(report([finding]), "1.0.0")).runs[0].results[0];
    expect(result.ruleId).toBe("typosquat");
    expect(result.level).toBe("error"); // high -> error
    expect(result.locations[0].physicalLocation.artifactLocation.uri).toBe("package-lock.json");
    expect(result.properties.packageName).toBe("expres");
  });

  it("anchors to package.json when the scan used the manifest", () => {
    const result = JSON.parse(renderSarif(report([finding], "manifest"), "1.0.0")).runs[0]
      .results[0];
    expect(result.locations[0].physicalLocation.artifactLocation.uri).toBe("package.json");
  });

  it("maps severity to SARIF levels", () => {
    const levels = (["critical", "high", "medium", "low", "info"] as const).map((severity) => {
      const doc = JSON.parse(renderSarif(report([{ ...finding, severity }]), "1.0.0"));
      return doc.runs[0].results[0].level;
    });
    expect(levels).toEqual(["error", "error", "warning", "note", "note"]);
  });

  it("emits an empty results array for a clean report", () => {
    const doc = JSON.parse(renderSarif(report([]), "1.0.0"));
    expect(doc.runs[0].results).toEqual([]);
  });
});
