import { describe, expect, it } from "vitest";
import { classifySource } from "../../src/ecosystems/npm/manifest.js";

describe("classifySource", () => {
  it("treats semver ranges as registry sources", () => {
    for (const spec of ["^1.0.0", "~2.3.4", "1.2.3", "*", ">=1 <2", "latest"]) {
      expect(classifySource(spec)).toBe("registry");
    }
  });

  it("classifies non-registry specifiers", () => {
    expect(classifySource("npm:real-pkg@1.0.0")).toBe("alias");
    expect(classifySource("file:../local")).toBe("file");
    expect(classifySource("link:../local")).toBe("link");
    expect(classifySource("workspace:*")).toBe("workspace");
    expect(classifySource("git+https://example.com/x.git")).toBe("git");
    expect(classifySource("github:user/repo")).toBe("git");
    expect(classifySource("user/repo")).toBe("git");
  });
});
