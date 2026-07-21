import { describe, expect, it } from "vitest";
import { buildCorpus, defaultCorpus, POPULAR_META } from "../../src/ecosystems/npm/popular.js";

describe("buildCorpus", () => {
  const corpus = buildCorpus(["react", "express", "lodash", "cross-env", "color", "colors"]);

  it("does membership case-insensitively and reports rank", () => {
    expect(corpus.has("react")).toBe(true);
    expect(corpus.has("React")).toBe(true);
    expect(corpus.has("nope")).toBe(false);
    expect(corpus.rankOf("express")).toBe(1);
  });

  it("finds a distance-1 near-miss for a non-member", () => {
    expect(corpus.findNearMiss("expres")?.target).toBe("express");
    expect(corpus.findNearMiss("lodahs")?.target).toBe("lodash");
  });

  it("catches a separator-collapse squat (crossenv vs cross-env)", () => {
    const m = corpus.findNearMiss("crossenv");
    expect(m?.target).toBe("cross-env");
    expect(m?.transform).toBe("separator");
  });

  it("returns nothing for a corpus member (self-membership)", () => {
    expect(corpus.findNearMiss("react")).toBeUndefined();
    expect(corpus.findNearMiss("color")).toBeUndefined();
  });

  it("does not distance-match very short names", () => {
    const shortCorpus = buildCorpus(["ms", "qs"]);
    expect(shortCorpus.findNearMiss("md")).toBeUndefined();
  });
});

describe("defaultCorpus (bundled npm-high-impact)", () => {
  it("loads a large, ranked corpus with provenance", () => {
    expect(defaultCorpus.size).toBeGreaterThan(10_000);
    expect(defaultCorpus.has("react")).toBe(true);
    expect(defaultCorpus.has("express")).toBe(true);
    expect(POPULAR_META.source).toBe("npm-high-impact");
    expect(POPULAR_META.sourceLicense).toBe("MIT");
  });
});
