import { describe, expect, it } from "vitest";
import { applyBaseline, toBaselineEntries } from "../../src/core/baseline.js";
import type { Finding } from "../../src/core/model.js";

function finding(ruleId: string, packageName: string, packageVersion?: string): Finding {
  return {
    ruleId,
    severity: "high",
    confidence: "high",
    packageName,
    ...(packageVersion === undefined ? {} : { packageVersion }),
    title: "t",
    detail: "d",
  };
}

describe("applyBaseline", () => {
  it("keeps every finding active when the baseline is empty", () => {
    const { active, suppressed } = applyBaseline([finding("typosquat", "a", "1.0.0")], []);
    expect(active).toHaveLength(1);
    expect(suppressed).toHaveLength(0);
  });

  it("suppresses a pre-existing finding and passes a new one through", () => {
    const findings = [
      finding("typosquat", "old", "1.0.0"),
      finding("young-package", "new", "1.0.0"),
    ];
    const { active, suppressed } = applyBaseline(findings, [
      { rule: "typosquat", package: "old", version: "1.0.0" },
    ]);
    expect(active.map((f) => f.packageName)).toEqual(["new"]);
    expect(suppressed).toHaveLength(1);
    expect(suppressed[0]?.suppressedReason).toContain("baseline");
  });

  it("treats a version change as a new finding (version is part of identity)", () => {
    const findings = [finding("typosquat", "a", "2.0.0")];
    const { active } = applyBaseline(findings, [
      { rule: "typosquat", package: "a", version: "1.0.0" },
    ]);
    expect(active).toHaveLength(1);
  });
});

describe("toBaselineEntries", () => {
  it("reduces findings to rule/package/version identity", () => {
    const entries = toBaselineEntries([
      finding("typosquat", "a", "1.0.0"),
      finding("young-package", "b"),
    ]);
    expect(entries).toEqual([
      { rule: "typosquat", package: "a", version: "1.0.0" },
      { rule: "young-package", package: "b" },
    ]);
  });
});
