import { describe, expect, it } from "vitest";
import { parsePackageSpec } from "../../src/ecosystems/npm/spec.js";

describe("parsePackageSpec", () => {
  it("parses a bare name", () => {
    expect(parsePackageSpec("express")).toEqual({ name: "express" });
  });

  it("parses name@version", () => {
    expect(parsePackageSpec("express@4.18.2")).toEqual({ name: "express", version: "4.18.2" });
  });

  it("parses a scoped name without a version", () => {
    expect(parsePackageSpec("@scope/pkg")).toEqual({ name: "@scope/pkg" });
  });

  it("parses a scoped name with a version, not treating the scope @ as a separator", () => {
    expect(parsePackageSpec("@scope/pkg@1.0.0")).toEqual({ name: "@scope/pkg", version: "1.0.0" });
  });

  it("trims surrounding whitespace", () => {
    expect(parsePackageSpec("  lodash@4  ")).toEqual({ name: "lodash", version: "4" });
  });
});
