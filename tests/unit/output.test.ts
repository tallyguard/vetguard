import { describe, expect, it } from "vitest";
import { renderJson, JSON_SCHEMA_VERSION } from "../../src/output/json.js";
import { renderMarkdown, MARKDOWN_COMMENT_MARKER } from "../../src/output/markdown.js";
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

describe("renderMarkdown", () => {
  it("includes the update marker, verdict, and a findings table", () => {
    const md = renderMarkdown(report([finding("high")]));
    expect(md.startsWith(MARKDOWN_COMMENT_MARKER)).toBe(true);
    expect(md).toContain("### vetguard: findings");
    expect(md).toContain("| Severity | Package | Rule | Finding |");
    expect(md).toContain("| high | pkg | typosquat | t |");
  });

  it("says no findings for a clean report", () => {
    const md = renderMarkdown(report([]));
    expect(md).toContain("No findings.");
    expect(md).not.toContain("| Severity |");
  });

  it("escapes a pipe so a value cannot break the table", () => {
    const md = renderMarkdown(report([{ ...finding("low"), packageName: "a|b" }]));
    expect(md).toContain("a\\|b");
  });

  it("collapses newlines so an attacker-controlled version cannot break out of the row", () => {
    const md = renderMarkdown(
      report([{ ...finding("high"), packageVersion: "1.0.0\n### INJECTED" }]),
    );
    expect(md).not.toContain("\n### INJECTED");
    // Every table row (a line starting with '|') stays a single physical line.
    for (const line of md.split("\n")) {
      if (line.startsWith("|")) expect(line.split("|").length).toBeGreaterThanOrEqual(5);
    }
  });

  it("escapes angle brackets so raw HTML cannot render in the comment", () => {
    const md = renderMarkdown(report([{ ...finding("high"), packageName: "<img src=x>" }]));
    expect(md).not.toContain("<img");
    expect(md).toContain("&lt;img src=x&gt;");
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
