import { describe, expect, it } from "vitest";
import { createHallucinationNameDetector } from "../../src/core/rules/hallucination-name.js";
import { buildCorpus } from "../../src/ecosystems/npm/popular.js";
import type { PackageFacts } from "../../src/core/model.js";

const corpus = buildCorpus([
  "eslint-plugin-unused-imports",
  "react-router-dom",
  "@tanstack/react-query-devtools",
  "express",
  "lodash",
]);
const detector = createHallucinationNameDetector(corpus);

function facts(overrides: Partial<PackageFacts>): PackageFacts {
  return { name: "unused-imports", kind: "prod", source: "registry", ...overrides };
}

describe("hallucination-name detector", () => {
  it("flags an affix-drop of a convention package as high when nonexistent", () => {
    const found = detector.detect(facts({ name: "unused-imports", existsOnRegistry: false }));
    expect(found).toHaveLength(1);
    expect(found[0]?.ruleId).toBe("hallucination-name");
    expect(found[0]?.severity).toBe("high");
    expect(found[0]?.evidence).toContain("eslint-plugin-unused-imports");
  });

  it("flags a token reorder of a popular package", () => {
    const found = detector.detect(facts({ name: "react-dom-router", existsOnRegistry: false }));
    expect(found[0]?.evidence).toContain("react-router-dom");
  });

  it("flags a scope-drop of a scoped popular package", () => {
    const found = detector.detect(
      facts({ name: "react-query-devtools", existsOnRegistry: true, ageDays: 3 }),
    );
    expect(found[0]?.evidence).toContain("@tanstack/react-query-devtools");
    expect(found[0]?.severity).toBe("high");
  });

  it("suppresses the real popular package itself (self-membership)", () => {
    expect(
      detector.detect(facts({ name: "eslint-plugin-unused-imports", existsOnRegistry: true })),
    ).toHaveLength(0);
  });

  it("suppresses an established look-alike", () => {
    expect(
      detector.detect(
        facts({ name: "unused-imports", existsOnRegistry: true, weeklyDownloads: 2_000_000 }),
      ),
    ).toHaveLength(0);
  });

  it("fires low on a deliberate offline scan", () => {
    const found = detector.detect(
      facts({
        name: "unused-imports",
        existsOnRegistry: undefined,
        existenceUnverifiedReason: "offline",
      }),
    );
    expect(found).toHaveLength(1);
    expect(found[0]?.severity).toBe("low");
    expect(found[0]?.confidence).toBe("low");
    expect(found[0]?.evidence).toContain("eslint-plugin-unused-imports");
    expect(found[0]?.evidence).toContain("unverified");
  });

  it("stays silent on a transient registry error (no rate-limit false positive)", () => {
    expect(
      detector.detect(
        facts({
          name: "unused-imports",
          existsOnRegistry: undefined,
          existenceUnverifiedReason: "error",
        }),
      ),
    ).toHaveLength(0);
  });

  it("ignores single-token and unrelated names", () => {
    expect(detector.detect(facts({ name: "lodash", existsOnRegistry: false }))).toHaveLength(0);
    expect(
      detector.detect(facts({ name: "totally-unrelated-thing", existsOnRegistry: false })),
    ).toHaveLength(0);
  });

  it("skips scoped names and non-registry sources", () => {
    expect(
      detector.detect(facts({ name: "@x/unused-imports", existsOnRegistry: false })),
    ).toHaveLength(0);
    expect(
      detector.detect(facts({ name: "unused-imports", source: "git", existsOnRegistry: false })),
    ).toHaveLength(0);
  });
});
