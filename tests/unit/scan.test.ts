import { describe, expect, it } from "vitest";
import { mkdtemp, writeFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { scanProject } from "../../src/scan.js";
import type { RegistryClient } from "../../src/ecosystems/npm/registry.js";
import type { DownloadsClient } from "../../src/ecosystems/npm/downloads.js";

const notFoundRegistry: RegistryClient = {
  getPackument: async () => ({ status: "not-found" }),
};
const noDownloads: DownloadsClient = { getWeeklyDownloads: async () => undefined };

async function makeProject(files: Record<string, unknown>): Promise<string> {
  const dir = await mkdtemp(path.join(tmpdir(), "vetguard-scan-"));
  for (const [name, content] of Object.entries(files)) {
    await writeFile(path.join(dir, name), JSON.stringify(content), "utf8");
  }
  return dir;
}

describe("scanProject", () => {
  it("scans the resolved lockfile tree and reports a lockfile basis", async () => {
    const dir = await makeProject({
      "package.json": { name: "app", dependencies: { "ghost-pkg": "^1.0.0" } },
      "package-lock.json": {
        lockfileVersion: 3,
        packages: {
          "": { name: "app" },
          "node_modules/ghost-pkg": {
            version: "1.0.0",
            resolved: "https://registry.npmjs.org/ghost-pkg",
          },
        },
      },
    });

    const report = await scanProject(dir, { client: notFoundRegistry, downloads: noDownloads });
    expect(report.basis).toBe("lockfile");
    expect(report.packagesScanned).toBe(1);
    expect(report.findings.some((f) => f.ruleId === "nonexistent-package")).toBe(true);
    await rm(dir, { recursive: true, force: true });
  });

  it("falls back to the manifest when there is no lockfile", async () => {
    const dir = await makeProject({
      "package.json": { name: "app", dependencies: { "ghost-pkg": "^1.0.0" } },
    });
    const report = await scanProject(dir, { client: notFoundRegistry, downloads: noDownloads });
    expect(report.basis).toBe("manifest");
    expect(report.findings.some((f) => f.ruleId === "nonexistent-package")).toBe(true);
    await rm(dir, { recursive: true, force: true });
  });

  it("warns instead of silently skipping an unsupported lockfile", async () => {
    const dir = await makeProject({
      "package.json": { name: "app", dependencies: {} },
      "package-lock.json": { lockfileVersion: 1, dependencies: {} },
    });
    const report = await scanProject(dir, { client: notFoundRegistry, downloads: noDownloads });
    expect(report.basis).toBe("manifest");
    expect(report.warnings?.some((w) => w.includes("not supported"))).toBe(true);
    await rm(dir, { recursive: true, force: true });
  });
});
