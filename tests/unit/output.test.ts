import { describe, expect, it } from "vitest";
import { renderJson, JSON_SCHEMA_VERSION } from "../../src/output/json.js";
import { resolveExitCode } from "../../src/output/exit-code.js";
import type { Finding, Report } from "../../src/core/model.js";

function finding(severity: Finding["severity"]): Finding {
  return {
    ruleId: "typosquat",
    severity,
    confidence: "high",
    packageName: "pkg",
    title: "t",
    detail: "d",
  };
}

function report(findings: Finding[]): Report {
  return {
    verdict: findings.length > 0 ? "findings" : "clean",
    target: ".",
    ecosystem: "npm",
    packagesScanned: 1,
    findings,
    unverified: [],
    generatedAt: "2026-07-21T00:00:00.000Z",
    basis: "lockfile",
  };
}

describe("renderJson", () => {
  it("emits stable, parseable JSON with tool metadata", () => {
    const parsed = JSON.parse(renderJson(report([finding("high")]), "1.2.3"));
    expect(parsed.tool).toBe("vetguard");
    expect(parsed.version).toBe("1.2.3");
    expect(parsed.schemaVersion).toBe(JSON_SCHEMA_VERSION);
    expect(parsed.findings).toHaveLength(1);
    expect(parsed.basis).toBe("lockfile");
  });
});

describe("resolveExitCode", () => {
  it("is 0 when there are no findings", () => {
    expect(resolveExitCode(report([]), undefined)).toBe(0);
    expect(resolveExitCode(report([]), "low")).toBe(0);
  });

  it("is 1 for any finding without a threshold", () => {
    expect(resolveExitCode(report([finding("low")]), undefined)).toBe(1);
  });

  it("gates on the threshold when given", () => {
    const r = report([finding("medium")]);
    expect(resolveExitCode(r, "high")).toBe(0); // medium is below high
    expect(resolveExitCode(r, "medium")).toBe(1); // at threshold
    expect(resolveExitCode(r, "low")).toBe(1); // above threshold
  });

  it("passes the threshold when a higher-severity finding is present", () => {
    const r = report([finding("low"), finding("critical")]);
    expect(resolveExitCode(r, "high")).toBe(1);
  });
});
