import { describe, expect, it } from "vitest";
import {
  youngPackage,
  YOUNG_AGE_DAYS,
  LOW_WEEKLY_DOWNLOADS,
} from "../../src/core/rules/young-package.js";
import type { PackageFacts } from "../../src/core/model.js";

function facts(overrides: Partial<PackageFacts>): PackageFacts {
  return {
    name: "example",
    kind: "prod",
    source: "registry",
    existsOnRegistry: true,
    ...overrides,
  };
}

describe("young-package detector", () => {
  it("flags a young package with low downloads", () => {
    const found = youngPackage.detect(facts({ ageDays: 3, weeklyDownloads: 12 }));
    expect(found).toHaveLength(1);
    expect(found[0]?.ruleId).toBe("young-package");
    expect(found[0]?.severity).toBe("medium");
    expect(found[0]?.confidence).toBe("medium");
  });

  it("flags a young package with unknown downloads at lower confidence", () => {
    const found = youngPackage.detect(facts({ ageDays: 3 }));
    expect(found).toHaveLength(1);
    expect(found[0]?.confidence).toBe("low");
  });

  it("stays silent for a young but widely-installed package", () => {
    expect(
      youngPackage.detect(facts({ ageDays: 1, weeklyDownloads: LOW_WEEKLY_DOWNLOADS })),
    ).toHaveLength(0);
  });

  it("stays silent for an established package", () => {
    expect(
      youngPackage.detect(facts({ ageDays: YOUNG_AGE_DAYS + 1, weeklyDownloads: 5 })),
    ).toHaveLength(0);
  });

  it("stays silent when age is unknown (honest degradation)", () => {
    expect(youngPackage.detect(facts({ ageDays: undefined, weeklyDownloads: 1 }))).toHaveLength(0);
  });

  it("does not judge a package that does not exist or is unverified", () => {
    expect(youngPackage.detect(facts({ existsOnRegistry: false, ageDays: 1 }))).toHaveLength(0);
    expect(youngPackage.detect(facts({ existsOnRegistry: undefined, ageDays: 1 }))).toHaveLength(0);
  });

  it("fires exactly at the age boundary", () => {
    expect(
      youngPackage.detect(facts({ ageDays: YOUNG_AGE_DAYS, weeklyDownloads: 0 })),
    ).toHaveLength(1);
  });
});
