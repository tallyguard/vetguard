import { describe, expect, it } from "vitest";
import {
  installScripts,
  INSTALL_SCRIPT_TRUST_DOWNLOADS,
  INSTALL_SCRIPT_LOW_DOWNLOADS,
} from "../../src/core/rules/install-scripts.js";
import type { PackageFacts } from "../../src/core/model.js";

function facts(overrides: Partial<PackageFacts>): PackageFacts {
  return {
    name: "example",
    kind: "prod",
    source: "registry",
    existsOnRegistry: true,
    hasInstallScript: true,
    ...overrides,
  };
}

describe("install-scripts detector", () => {
  it("does not fire without an install script", () => {
    expect(installScripts.detect(facts({ hasInstallScript: false, ageDays: 1 }))).toHaveLength(0);
  });

  it("suppresses an established, widely-installed package (protects the FP budget)", () => {
    const found = installScripts.detect(
      facts({ weeklyDownloads: INSTALL_SCRIPT_TRUST_DOWNLOADS, ageDays: 2000 }),
    );
    expect(found).toHaveLength(0);
  });

  it("suppresses an old package even when adoption is unknown (rate-limited scan)", () => {
    const found = installScripts.detect(facts({ ageDays: 2000, weeklyDownloads: undefined }));
    expect(found).toHaveLength(0);
  });

  it("flags a young package with an install script as high", () => {
    const found = installScripts.detect(facts({ ageDays: 4, weeklyDownloads: 30 }));
    expect(found).toHaveLength(1);
    expect(found[0]?.ruleId).toBe("install-scripts");
    expect(found[0]?.severity).toBe("high");
  });

  it("flags a low-adoption package with an install script as high", () => {
    const found = installScripts.detect(
      facts({ ageDays: 500, weeklyDownloads: INSTALL_SCRIPT_LOW_DOWNLOADS - 1 }),
    );
    expect(found[0]?.severity).toBe("high");
  });

  it("flags a mid-adoption, older package as medium", () => {
    const found = installScripts.detect(facts({ ageDays: 500, weeklyDownloads: 5000 }));
    expect(found).toHaveLength(1);
    expect(found[0]?.severity).toBe("medium");
  });

  it("flags unknown-adoption at low confidence", () => {
    const found = installScripts.detect(facts({ ageDays: undefined, weeklyDownloads: undefined }));
    expect(found).toHaveLength(1);
    expect(found[0]?.severity).toBe("medium");
    expect(found[0]?.confidence).toBe("low");
  });

  it("does not judge a package that was not confirmed on the registry", () => {
    expect(installScripts.detect(facts({ existsOnRegistry: undefined, ageDays: 1 }))).toHaveLength(
      0,
    );
    expect(installScripts.detect(facts({ existsOnRegistry: false, ageDays: 1 }))).toHaveLength(0);
  });
});
