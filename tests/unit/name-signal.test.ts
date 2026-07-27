import { describe, it, expect } from "vitest";
import { nameSignalBasis, rateNameSignal } from "../../src/core/rules/name-signal.js";
import { typosquat } from "../../src/core/rules/typosquat.js";
import { hallucinationName } from "../../src/core/rules/hallucination-name.js";
import { scopedLookalike } from "../../src/core/rules/scoped-lookalike.js";
import type { PackageFacts } from "../../src/core/model.js";

function facts(overrides: Partial<PackageFacts> = {}): PackageFacts {
  return { name: "suspect-pkg", kind: "prod", source: "registry", ...overrides };
}

describe("nameSignalBasis", () => {
  it("skips packages that did not come from the registry", () => {
    expect(nameSignalBasis(facts({ source: "git", existsOnRegistry: false }), false)).toBe("skip");
  });

  it("skips scoped names, which are ownership-gated", () => {
    expect(nameSignalBasis(facts({ name: "@scope/pkg", existsOnRegistry: false }), false)).toBe(
      "skip",
    );
  });

  it("skips a corpus member, which is never a squat of another popular name", () => {
    expect(nameSignalBasis(facts({ existsOnRegistry: false }), true)).toBe("skip");
  });

  it("judges online when existence is known either way", () => {
    expect(nameSignalBasis(facts({ existsOnRegistry: true }), false)).toBe("online");
    expect(nameSignalBasis(facts({ existsOnRegistry: false }), false)).toBe("online");
  });

  it("allows the offline tier only for a deliberate offline scan", () => {
    expect(nameSignalBasis(facts({ existenceUnverifiedReason: "offline" }), false)).toBe("offline");
  });

  it("skips a failed lookup, so a rate-limit never becomes a finding", () => {
    expect(nameSignalBasis(facts({ existenceUnverifiedReason: "error" }), false)).toBe("skip");
    expect(nameSignalBasis(facts(), false)).toBe("skip");
  });
});

describe("rateNameSignal", () => {
  it("does not rate an existing, widely-installed package", () => {
    expect(rateNameSignal(facts({ existsOnRegistry: true, weeklyDownloads: 15_000 }))).toBe(
      undefined,
    );
  });

  it("rates a nonexistent name highest, on existence alone", () => {
    expect(rateNameSignal(facts({ existsOnRegistry: false }))).toEqual({
      severity: "high",
      confidence: "high",
    });
  });

  it("rates a young or barely-installed existing package high", () => {
    expect(rateNameSignal(facts({ existsOnRegistry: true, ageDays: 30 }))).toEqual({
      severity: "high",
      confidence: "medium",
    });
    expect(rateNameSignal(facts({ existsOnRegistry: true, weeklyDownloads: 99 }))).toEqual({
      severity: "high",
      confidence: "medium",
    });
  });

  it("rates a measured but unremarkable package medium", () => {
    expect(
      rateNameSignal(facts({ existsOnRegistry: true, weeklyDownloads: 5_000, ageDays: 400 })),
    ).toEqual({ severity: "medium", confidence: "medium" });
  });

  it("falls to the lowest tier when adoption could not be measured", () => {
    expect(rateNameSignal(facts({ existsOnRegistry: true, ageDays: 400 }))).toEqual({
      severity: "low",
      confidence: "low",
    });
  });

  it("never rates a nonexistent name away, however high its download count claims to be", () => {
    expect(rateNameSignal(facts({ existsOnRegistry: false, weeklyDownloads: 10_000_000 }))).toEqual(
      { severity: "high", confidence: "high" },
    );
  });
});

// The point of the shared gate: the three name detectors must agree on who is
// eligible and how bad it is. A detector drifting off this policy is the
// regression this block exists to catch. Each suspect name corpus-matches its
// detector, and each silent case first proves the name flags without the
// blocking facts, so silence is attributable to the gate, never to a no-match.
// The scoped-name and corpus-member gates cannot be exercised this way (a
// scoped or popular name has no corpus hit to suppress) and are covered by the
// nameSignalBasis tests above.
describe("the name detectors share one gating policy", () => {
  const suspects = [
    { name: "expres", detector: typosquat },
    { name: "unused-imports", detector: hallucinationName },
    { name: "babel-parser", detector: scopedLookalike },
  ];

  const silent: { label: string; overrides: Partial<PackageFacts> }[] = [
    {
      label: "an established package",
      overrides: { existsOnRegistry: true, weeklyDownloads: 2_000_000 },
    },
    { label: "an off-registry source", overrides: { source: "git", existsOnRegistry: false } },
    { label: "a failed lookup", overrides: { existenceUnverifiedReason: "error" } },
  ];

  for (const { label, overrides } of silent) {
    it(`all three stay silent on ${label}`, () => {
      for (const { name, detector } of suspects) {
        const flagging = detector.detect(facts({ name, existsOnRegistry: false }));
        expect(flagging, `${detector.id} has no corpus match for ${name}`).not.toEqual([]);
        expect(detector.detect(facts({ name, ...overrides }))).toEqual([]);
      }
    });
  }

  it("all three rate the same facts identically", () => {
    // "expres" is a deletion, not one of typosquat's confident transforms, so
    // no detector applies a bump here and all three must land on the raw rating.
    for (const { name, detector } of suspects) {
      const pkg = facts({ name, existsOnRegistry: true, ageDays: 3, weeklyDownloads: 4 });
      const rating = rateNameSignal(pkg);
      const [finding] = detector.detect(pkg);
      expect(finding, `${detector.id} did not flag ${name}`).toBeDefined();
      expect(finding?.severity).toBe(rating?.severity);
      expect(finding?.confidence).toBe(rating?.confidence);
    }
  });
});
