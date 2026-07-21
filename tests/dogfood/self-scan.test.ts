import { describe, expect, it } from "vitest";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { scanProject } from "../../src/scan.js";

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..", "..");

/**
 * vetguard scans its own dependency set on every test run. This guards two
 * things: that the scanner does not crash on the real project manifest, and
 * that vetguard never flags its own supply chain. Run offline so the default
 * test suite stays network-free; CI additionally runs a live self-scan
 * (`node dist/cli.js scan .`) against the registry. As offline-capable
 * detectors land (e.g. typosquat against the bundled popular-package corpus),
 * this test gains teeth automatically: a false positive on our own deps
 * becomes a failing test.
 */
describe("dogfood: vetguard scans its own repo", () => {
  it("reads the real manifest and scans its dependencies", async () => {
    const report = await scanProject(repoRoot, {
      offline: true,
      now: () => new Date("2026-07-21T00:00:00.000Z"),
    });
    expect(report.ecosystem).toBe("npm");
    expect(report.packagesScanned).toBeGreaterThan(0);
  });

  it("flags nothing in its own dependencies", async () => {
    const report = await scanProject(repoRoot, {
      offline: true,
      now: () => new Date("2026-07-21T00:00:00.000Z"),
    });
    expect(report.findings).toEqual([]);
  });
});
