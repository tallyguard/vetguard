import { describe, expect, it } from "vitest";
import {
  resolveAdvisorySeverity,
  cvss3BaseScore,
  severityFromScore,
} from "../../src/ecosystems/npm/cvss.js";

describe("cvss3BaseScore", () => {
  it("scores a scope-unchanged critical vector (9.8)", () => {
    expect(cvss3BaseScore("CVSS:3.1/AV:N/AC:L/PR:N/UI:N/S:U/C:H/I:H/A:H")).toBe(9.8);
  });

  it("scores a scope-changed maximal vector (10.0)", () => {
    expect(cvss3BaseScore("CVSS:3.1/AV:N/AC:L/PR:N/UI:N/S:C/C:H/I:H/A:H")).toBe(10.0);
  });

  it("scores a no-impact vector as 0", () => {
    expect(cvss3BaseScore("CVSS:3.1/AV:N/AC:L/PR:N/UI:N/S:U/C:N/I:N/A:N")).toBe(0);
  });

  it("accepts 3.0 vectors", () => {
    expect(cvss3BaseScore("CVSS:3.0/AV:N/AC:L/PR:N/UI:N/S:U/C:H/I:H/A:H")).toBe(9.8);
  });

  it("returns undefined for non-CVSS-v3 or malformed input", () => {
    expect(cvss3BaseScore("nonsense")).toBeUndefined();
    expect(cvss3BaseScore("CVSS:2.0/AV:N/AC:L/Au:N/C:P/I:P/A:P")).toBeUndefined();
    expect(cvss3BaseScore("CVSS:3.1/AV:X/AC:L/PR:N/UI:N/S:U/C:H/I:H/A:H")).toBeUndefined();
  });
});

describe("severityFromScore bands", () => {
  it("maps CVSS bands to severities", () => {
    expect(severityFromScore(9.0)).toBe("critical");
    expect(severityFromScore(7.0)).toBe("high");
    expect(severityFromScore(4.0)).toBe("medium");
    expect(severityFromScore(0.1)).toBe("low");
    expect(severityFromScore(0)).toBe("info");
  });
});

describe("resolveAdvisorySeverity", () => {
  it("prefers the qualitative GHSA label", () => {
    expect(resolveAdvisorySeverity({ database_specific: { severity: "CRITICAL" } })).toEqual({
      severity: "critical",
      source: "label",
    });
    expect(resolveAdvisorySeverity({ database_specific: { severity: "MODERATE" } })).toEqual({
      severity: "medium",
      source: "label",
    });
  });

  it("falls back to a CVSS v3 vector when there is no label", () => {
    expect(
      resolveAdvisorySeverity({
        severity: [{ type: "CVSS_V3", score: "CVSS:3.1/AV:N/AC:L/PR:N/UI:N/S:U/C:H/I:H/A:H" }],
      }),
    ).toEqual({ severity: "critical", source: "cvss-v3" });
  });

  it("reads a package-level (affected[].severity) label", () => {
    expect(
      resolveAdvisorySeverity({ affected: [{ database_specific: { severity: "LOW" } }] }),
    ).toEqual({ severity: "low", source: "label" });
  });

  it("floors at medium when severity is absent or only CVSS v2/v4", () => {
    expect(resolveAdvisorySeverity({})).toEqual({ severity: "medium", source: "floor" });
    expect(
      resolveAdvisorySeverity({
        severity: [{ type: "CVSS_V2", score: "AV:N/AC:L/Au:N/C:P/I:P/A:P" }],
      }),
    ).toEqual({ severity: "medium", source: "floor" });
  });

  it("takes the higher of a low label and a critical CVSS (never masks)", () => {
    expect(
      resolveAdvisorySeverity({
        database_specific: { severity: "LOW" },
        severity: [{ type: "CVSS_V3", score: "CVSS:3.1/AV:N/AC:L/PR:N/UI:N/S:U/C:H/I:H/A:H" }],
      }),
    ).toEqual({ severity: "critical", source: "cvss-v3" });
  });

  it("clamps a matched advisory to at least low (never info)", () => {
    // A zero-impact CVSS vector scores 0.0 (info band) but a matched advisory is
    // a known vulnerability, so it must at least trip --fail-on low.
    expect(
      resolveAdvisorySeverity({
        severity: [{ type: "CVSS_V3", score: "CVSS:3.1/AV:N/AC:L/PR:N/UI:N/S:U/C:N/I:N/A:N" }],
      }),
    ).toEqual({ severity: "low", source: "cvss-v3" });
  });

  it("is total on hostile shapes (never throws)", () => {
    expect(resolveAdvisorySeverity({ severity: "nope" as never })).toEqual({
      severity: "medium",
      source: "floor",
    });
    expect(resolveAdvisorySeverity({ affected: "nope" as never })).toEqual({
      severity: "medium",
      source: "floor",
    });
    expect(resolveAdvisorySeverity({ database_specific: null })).toEqual({
      severity: "medium",
      source: "floor",
    });
  });
});
