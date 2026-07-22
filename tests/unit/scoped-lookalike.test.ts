import { describe, expect, it } from "vitest";
import { createScopedLookalikeDetector } from "../../src/core/rules/scoped-lookalike.js";
import { buildCorpus } from "../../src/ecosystems/npm/popular.js";
import type { PackageFacts } from "../../src/core/model.js";

const corpus = buildCorpus(["@babel/core", "@babel/types", "@types/node", "express", "lodash"]);
const detector = createScopedLookalikeDetector(corpus);

function facts(overrides: Partial<PackageFacts>): PackageFacts {
  return { name: "babel-core", kind: "prod", source: "registry", ...overrides };
}

describe("scoped-lookalike detector", () => {
  it("flags a nonexistent dropped-scope lookalike as high", () => {
    const found = detector.detect(facts({ name: "babel-core", existsOnRegistry: false }));
    expect(found).toHaveLength(1);
    expect(found[0]?.ruleId).toBe("scoped-lookalike");
    expect(found[0]?.severity).toBe("high");
    expect(found[0]?.evidence).toContain("@babel/core");
  });

  it("matches through depunctuation (babelcore -> @babel/core)", () => {
    expect(detector.detect(facts({ name: "babelcore", existsOnRegistry: false }))).toHaveLength(1);
  });

  it("allowlists @types (types-node does not flag)", () => {
    expect(detector.detect(facts({ name: "types-node", existsOnRegistry: false }))).toHaveLength(0);
  });

  it("never treats the scoped package itself as a suspect", () => {
    expect(detector.detect(facts({ name: "@babel/core", existsOnRegistry: false }))).toHaveLength(
      0,
    );
  });

  it("suppresses a corpus member (a real unscoped package)", () => {
    expect(detector.detect(facts({ name: "express", existsOnRegistry: true }))).toHaveLength(0);
  });

  it("suppresses an established look-alike (a real legacy unscoped form)", () => {
    const found = detector.detect(
      facts({ name: "babel-core", existsOnRegistry: true, weeklyDownloads: 2_000_000 }),
    );
    expect(found).toHaveLength(0);
  });

  it("fires low on a deliberate offline scan", () => {
    const found = detector.detect(
      facts({
        name: "babel-core",
        existsOnRegistry: undefined,
        existenceUnverifiedReason: "offline",
      }),
    );
    expect(found[0]?.severity).toBe("low");
    expect(found[0]?.confidence).toBe("low");
    expect(found[0]?.evidence).toContain("unverified");
  });

  it("stays silent on a transient registry error (no rate-limit false positive)", () => {
    expect(
      detector.detect(
        facts({
          name: "babel-core",
          existsOnRegistry: undefined,
          existenceUnverifiedReason: "error",
        }),
      ),
    ).toHaveLength(0);
  });

  it("skips non-registry sources", () => {
    expect(
      detector.detect(facts({ name: "babel-core", source: "git", existsOnRegistry: false })),
    ).toHaveLength(0);
  });

  it("does not fire on an unrelated name", () => {
    expect(
      detector.detect(facts({ name: "totally-unrelated-thing", existsOnRegistry: false })),
    ).toHaveLength(0);
  });
});
