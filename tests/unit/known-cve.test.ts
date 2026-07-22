import { describe, expect, it } from "vitest";
import { knownCve } from "../../src/core/rules/known-cve.js";
import type { Advisory, PackageFacts } from "../../src/core/model.js";

function facts(overrides: Partial<PackageFacts>): PackageFacts {
  return {
    name: "lodash",
    version: "4.17.4",
    kind: "prod",
    source: "registry",
    evidencePath: "package-lock.json",
    ...overrides,
  };
}

const adv = (o: Partial<Advisory>): Advisory => ({
  id: "GHSA-x",
  severity: "high",
  severitySource: "label",
  url: "https://osv.dev/vulnerability/GHSA-x",
  ...o,
});

describe("known-cve detector", () => {
  it("is silent when advisories were not checked (undefined)", () => {
    expect(knownCve.detect(facts({}))).toHaveLength(0);
  });

  it("is silent when checked and clean (empty array)", () => {
    expect(knownCve.detect(facts({ knownVulnerabilities: [] }))).toHaveLength(0);
  });

  it("emits one finding per advisory with id, severity, and traceable evidence", () => {
    const found = knownCve.detect(
      facts({
        knownVulnerabilities: [
          adv({ id: "GHSA-a", severity: "critical", aliases: ["CVE-1"], url: "https://x/a" }),
          adv({ id: "GHSA-b", severity: "low" }),
        ],
      }),
    );
    expect(found).toHaveLength(2);
    expect(found[0]?.ruleId).toBe("known-cve");
    expect(found[0]?.severity).toBe("critical");
    expect(found[0]?.confidence).toBe("high");
    expect(found[0]?.title).toContain("GHSA-a");
    expect(found[0]?.evidence).toContain("CVE-1");
    expect(found[0]?.evidence).toContain("https://x/a");
    expect(found[0]?.packageVersion).toBe("4.17.4");
    expect(found[0]?.location).toBe("package-lock.json");
    expect(found[1]?.severity).toBe("low");
  });

  it("notes when severity was not rated by the source (floor)", () => {
    const found = knownCve.detect(
      facts({ knownVulnerabilities: [adv({ severity: "medium", severitySource: "floor" })] }),
    );
    expect(found[0]?.severity).toBe("medium");
    expect(found[0]?.detail).toContain("not rated");
  });
});
