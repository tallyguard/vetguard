import { describe, expect, it } from "vitest";
import { applyIgnores } from "../../src/core/ignore.js";
import type { Finding } from "../../src/core/model.js";

function finding(ruleId: string, packageName: string): Finding {
  return { ruleId, severity: "high", confidence: "high", packageName, title: "t", detail: "d" };
}

describe("applyIgnores", () => {
  it("returns all findings active when there are no ignores", () => {
    const findings = [finding("typosquat", "a")];
    const { active, suppressed } = applyIgnores(findings, []);
    expect(active).toHaveLength(1);
    expect(suppressed).toHaveLength(0);
  });

  it("suppresses a matching rule+package and attaches the reason", () => {
    const findings = [finding("typosquat", "expresss"), finding("young-package", "b")];
    const { active, suppressed } = applyIgnores(findings, [
      { rule: "typosquat", package: "expresss", reason: "internal fork, reviewed" },
    ]);
    expect(active.map((f) => f.packageName)).toEqual(["b"]);
    expect(suppressed).toHaveLength(1);
    expect(suppressed[0]?.suppressedReason).toBe("internal fork, reviewed");
  });

  it("does not suppress when only the rule or only the package matches", () => {
    const findings = [finding("typosquat", "a")];
    expect(
      applyIgnores(findings, [{ rule: "typosquat", package: "b", reason: "x" }]).suppressed,
    ).toHaveLength(0);
    expect(
      applyIgnores(findings, [{ rule: "young-package", package: "a", reason: "x" }]).suppressed,
    ).toHaveLength(0);
  });
});
