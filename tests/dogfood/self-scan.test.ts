import { describe, expect, it } from "vitest";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { scanProject } from "../../src/scan.js";

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..", "..");

/**
 * vetguard scans its own dependency set on every test run, offline so the
 * default suite stays network-free. This guards two things: that the scanner
 * does not crash on the real manifest, and that vetguard never flags its own
 * supply chain. The name detectors are offline-capable, so this test has teeth:
 * an introduced dependency whose name resembles a popular package (a typosquat
 * or slopsquat) fires offline and fails here. All current deps are
 * popular-corpus members, so the scan stays clean. The pull-request workflow
 * (`pr-scan.yml`) additionally runs a live scan against the registry, which is
 * informational.
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
