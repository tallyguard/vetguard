import { describe, expect, it } from "vitest";
import { unpublishedVersion } from "../../src/core/rules/unpublished-version.js";
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

describe("unpublished-version detector", () => {
  it("flags a package whose pinned version is not published", () => {
    const found = unpublishedVersion.detect(facts({ version: "9.9.9", versionPublished: false }));
    expect(found).toHaveLength(1);
    expect(found[0]?.ruleId).toBe("unpublished-version");
    expect(found[0]?.severity).toBe("high");
    expect(found[0]?.packageVersion).toBe("9.9.9");
  });

  it("stays silent when the version is published", () => {
    expect(
      unpublishedVersion.detect(facts({ version: "1.0.0", versionPublished: true })),
    ).toHaveLength(0);
  });

  it("stays silent when no version was checked (versionPublished unknown)", () => {
    expect(unpublishedVersion.detect(facts({ versionPublished: undefined }))).toHaveLength(0);
  });

  it("does not judge a package that does not exist or was not confirmed", () => {
    expect(
      unpublishedVersion.detect(facts({ existsOnRegistry: false, versionPublished: false })),
    ).toHaveLength(0);
    expect(
      unpublishedVersion.detect(facts({ existsOnRegistry: undefined, versionPublished: false })),
    ).toHaveLength(0);
  });
});
