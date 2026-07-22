import { describe, expect, it } from "vitest";
import { nonexistentPackage } from "../../src/core/rules/nonexistent-package.js";
import type { PackageFacts } from "../../src/core/model.js";

function facts(overrides: Partial<PackageFacts>): PackageFacts {
  return {
    name: "example",
    kind: "prod",
    source: "registry",
    ...overrides,
  };
}

describe("nonexistent-package detector", () => {
  it("flags a registry package that does not exist", () => {
    const found = nonexistentPackage.detect(
      facts({ name: "react-codeshift", existsOnRegistry: false }),
    );
    expect(found).toHaveLength(1);
    expect(found[0]?.ruleId).toBe("nonexistent-package");
    expect(found[0]?.severity).toBe("high");
    expect(found[0]?.packageName).toBe("react-codeshift");
    expect(found[0]?.evidence).toContain("react-codeshift");
  });

  it("stays silent when existence is unknown (honest degradation)", () => {
    expect(nonexistentPackage.detect(facts({ existsOnRegistry: undefined }))).toHaveLength(0);
  });

  it("stays silent for a package that does exist", () => {
    expect(nonexistentPackage.detect(facts({ existsOnRegistry: true }))).toHaveLength(0);
  });

  it("does not judge non-registry sources (git, file, alias)", () => {
    for (const source of ["git", "file", "link", "workspace", "alias"] as const) {
      expect(nonexistentPackage.detect(facts({ source, existsOnRegistry: false }))).toHaveLength(0);
    }
  });
});
