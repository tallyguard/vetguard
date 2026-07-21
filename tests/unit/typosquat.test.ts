import { describe, expect, it } from "vitest";
import { createTyposquatDetector } from "../../src/core/rules/typosquat.js";
import { buildCorpus } from "../../src/ecosystems/npm/popular.js";
import type { PackageFacts } from "../../src/core/model.js";

const corpus = buildCorpus([
  "react",
  "express",
  "lodash",
  "cross-env",
  "chalk",
  "preact",
  "color",
  "colors",
  "ms",
]);
const detector = createTyposquatDetector(corpus);

function facts(overrides: Partial<PackageFacts>): PackageFacts {
  return { name: "expres", kind: "prod", source: "registry", ...overrides };
}

describe("typosquat detector", () => {
  it("flags a nonexistent near-miss as high", () => {
    const found = detector.detect(facts({ name: "expres", existsOnRegistry: false }));
    expect(found).toHaveLength(1);
    expect(found[0]?.ruleId).toBe("typosquat");
    expect(found[0]?.severity).toBe("high");
    expect(found[0]?.evidence).toContain("express");
  });

  it("flags a young, low-adoption near-miss as high", () => {
    const found = detector.detect(
      facts({ name: "lodahs", existsOnRegistry: true, ageDays: 3, weeklyDownloads: 5 }),
    );
    expect(found[0]?.severity).toBe("high");
  });

  it("catches a separator-collapse squat (crossenv vs cross-env)", () => {
    const found = detector.detect(facts({ name: "crossenv", existsOnRegistry: false }));
    expect(found[0]?.evidence).toContain("cross-env");
  });

  it("suppresses a corpus member (self-membership first)", () => {
    // preact resembles react but is itself popular; must never be flagged.
    expect(detector.detect(facts({ name: "preact", existsOnRegistry: true }))).toHaveLength(0);
    expect(detector.detect(facts({ name: "colors", existsOnRegistry: true }))).toHaveLength(0);
  });

  it("suppresses an established look-alike (corpus staleness, not a squat)", () => {
    const found = detector.detect(
      facts({ name: "expres", existsOnRegistry: true, weeklyDownloads: 2_000_000 }),
    );
    expect(found).toHaveLength(0);
  });

  it("fires low on a deliberate offline scan, without the confident-transform bump", () => {
    // chakl transposes chalk, a confident transform that raises confidence
    // online; the offline branch must stay low/low and not apply that bump.
    const found = detector.detect(
      facts({ name: "chakl", existsOnRegistry: undefined, existenceUnverifiedReason: "offline" }),
    );
    expect(found).toHaveLength(1);
    expect(found[0]?.severity).toBe("low");
    expect(found[0]?.confidence).toBe("low");
    expect(found[0]?.evidence).toContain("chalk");
    expect(found[0]?.evidence).toContain("unverified");
  });

  it("stays silent on a transient registry error (no rate-limit false positive)", () => {
    expect(
      detector.detect(
        facts({ name: "expres", existsOnRegistry: undefined, existenceUnverifiedReason: "error" }),
      ),
    ).toHaveLength(0);
  });

  it("skips scoped names", () => {
    expect(detector.detect(facts({ name: "@types/expres", existsOnRegistry: false }))).toHaveLength(
      0,
    );
  });

  it("skips non-registry sources", () => {
    expect(
      detector.detect(facts({ name: "expres", source: "git", existsOnRegistry: false })),
    ).toHaveLength(0);
  });

  it("does not fire on a far-away name", () => {
    expect(
      detector.detect(facts({ name: "totally-unrelated-thing", existsOnRegistry: false })),
    ).toHaveLength(0);
  });

  it("gives unknown-adoption look-alikes only low severity", () => {
    const found = detector.detect(
      facts({ name: "expres", existsOnRegistry: true, weeklyDownloads: undefined }),
    );
    expect(found[0]?.severity).toBe("low");
  });
});
