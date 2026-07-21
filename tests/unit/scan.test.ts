import { describe, expect, it } from "vitest";
import { mkdtemp, writeFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { scanProject, diffScan } from "../../src/scan.js";
import type { RegistryClient } from "../../src/ecosystems/npm/registry.js";
import type { DownloadsClient } from "../../src/ecosystems/npm/downloads.js";
import type { OsvClient } from "../../src/ecosystems/npm/osv.js";
import type { Advisory } from "../../src/core/model.js";

const notFoundRegistry: RegistryClient = {
  getPackument: async () => ({ status: "not-found" }),
};
const foundRegistry: RegistryClient = {
  getPackument: async () => ({
    status: "found",
    packument: { name: "x", versionCount: 5, hasInstallScript: false },
  }),
};
const noDownloads: DownloadsClient = { getWeeklyDownloads: async () => undefined };
// No-op OSV: every version checks clean. Injected so the default suite never
// reaches the live OSV API (scan.ts builds a real client otherwise).
const noOsv: OsvClient = {
  queryVersions: async (queries) => queries.map(() => ({ status: "checked", advisories: [] })),
};
function osvWith(byKey: Record<string, Advisory[]>): OsvClient {
  return {
    queryVersions: async (queries) =>
      queries.map((q) => ({
        status: "checked",
        advisories: byKey[`${q.name}@${q.version}`] ?? [],
      })),
  };
}

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

    const report = await scanProject(dir, {
      client: notFoundRegistry,
      downloads: noDownloads,
      osv: noOsv,
    });
    expect(report.basis).toBe("lockfile");
    expect(report.packagesScanned).toBe(1);
    expect(report.findings.some((f) => f.ruleId === "nonexistent-package")).toBe(true);
    await rm(dir, { recursive: true, force: true });
  });

  it("suppresses a configured finding without changing the clean verdict", async () => {
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
    const report = await scanProject(dir, {
      client: notFoundRegistry,
      downloads: noDownloads,
      osv: noOsv,
      ignore: [
        { rule: "nonexistent-package", package: "ghost-pkg", reason: "known internal name" },
      ],
    });
    expect(report.findings).toHaveLength(0);
    expect(report.verdict).toBe("clean");
    expect(report.suppressed?.[0]?.suppressedReason).toBe("known internal name");
    await rm(dir, { recursive: true, force: true });
  });

  it("falls back to the manifest when there is no lockfile", async () => {
    const dir = await makeProject({
      "package.json": { name: "app", dependencies: { "ghost-pkg": "^1.0.0" } },
    });
    const report = await scanProject(dir, {
      client: notFoundRegistry,
      downloads: noDownloads,
      osv: noOsv,
    });
    expect(report.basis).toBe("manifest");
    expect(report.findings.some((f) => f.ruleId === "nonexistent-package")).toBe(true);
    await rm(dir, { recursive: true, force: true });
  });

  it("warns instead of silently skipping an unsupported lockfile", async () => {
    const dir = await makeProject({
      "package.json": { name: "app", dependencies: {} },
      "package-lock.json": { lockfileVersion: 1, dependencies: {} },
    });
    const report = await scanProject(dir, {
      client: notFoundRegistry,
      downloads: noDownloads,
      osv: noOsv,
    });
    expect(report.basis).toBe("manifest");
    expect(report.warnings?.some((w) => w.includes("not supported"))).toBe(true);
    await rm(dir, { recursive: true, force: true });
  });
});

describe("known-cve via OSV", () => {
  it("flags a resolved version with a known advisory", async () => {
    const dir = await makeProject({
      "package.json": { name: "app", dependencies: { lodash: "4.17.4" } },
      "package-lock.json": lock({ lodash: { version: "4.17.4" } }),
    });
    const report = await scanProject(dir, {
      client: foundRegistry,
      downloads: noDownloads,
      osv: osvWith({
        "lodash@4.17.4": [
          {
            id: "GHSA-jf85-cpcp-j695",
            aliases: ["CVE-2019-10744"],
            severity: "high",
            severitySource: "label",
            url: "https://osv.dev/vulnerability/GHSA-jf85-cpcp-j695",
          },
        ],
      }),
    });
    const cve = report.findings.filter((f) => f.ruleId === "known-cve");
    expect(cve).toHaveLength(1);
    expect(cve[0]?.severity).toBe("high");
    expect(cve[0]?.title).toContain("GHSA-jf85-cpcp-j695");
    expect(cve[0]?.evidence).toContain("CVE-2019-10744");
    expect(report.verdict).toBe("findings");
    await rm(dir, { recursive: true, force: true });
  });

  it("stays clean when the resolved version has no advisories", async () => {
    const dir = await makeProject({
      "package.json": { name: "app", dependencies: { lodash: "4.17.21" } },
      "package-lock.json": lock({ lodash: { version: "4.17.21" } }),
    });
    const report = await scanProject(dir, {
      client: foundRegistry,
      downloads: noDownloads,
      osv: osvWith({}),
    });
    expect(report.findings.some((f) => f.ruleId === "known-cve")).toBe(false);
    expect(report.verdict).toBe("clean");
    await rm(dir, { recursive: true, force: true });
  });

  it("reports could-not-verify (never clean) when advisory lookup is offline", async () => {
    const dir = await makeProject({
      "package.json": { name: "app", dependencies: { lodash: "4.17.21" } },
      "package-lock.json": lock({ lodash: { version: "4.17.21" } }),
    });
    const report = await scanProject(dir, { offline: true });
    expect(report.verdict).toBe("could-not-verify");
    expect(report.findings).toHaveLength(0);
    await rm(dir, { recursive: true, force: true });
  });

  it("degrades to could-not-verify when a version-less (manifest) scan cannot check advisories", async () => {
    // No lockfile: facts have no resolved version, so no advisory can be
    // checked, so an existing dependency cannot make the scan read clean.
    const dir = await makeProject({
      "package.json": { name: "app", dependencies: { existing: "^1.0.0" } },
    });
    const report = await scanProject(dir, {
      client: foundRegistry,
      downloads: noDownloads,
      osv: noOsv,
    });
    expect(report.basis).toBe("manifest");
    expect(report.verdict).toBe("could-not-verify");
    await rm(dir, { recursive: true, force: true });
  });
});

function lock(packages: Record<string, { version: string; resolved?: string }>): unknown {
  return {
    lockfileVersion: 3,
    packages: {
      "": { name: "app" },
      ...Object.fromEntries(
        Object.entries(packages).map(([name, entry]) => [
          `node_modules/${name}`,
          { resolved: `https://registry.npmjs.org/${name}`, ...entry },
        ]),
      ),
    },
  };
}

describe("diffScan", () => {
  it("scans only the dependency a change introduces", async () => {
    const dir = await makeProject({
      "base.json": lock({ safe: { version: "1.0.0" } }),
      "head.json": lock({ safe: { version: "1.0.0" }, "ghost-pkg": { version: "1.0.0" } }),
    });
    const report = await diffScan(path.join(dir, "base.json"), path.join(dir, "head.json"), {
      client: notFoundRegistry,
      downloads: noDownloads,
      osv: noOsv,
    });
    // Only ghost-pkg is new; the unchanged "safe" is not scanned.
    expect(report.packagesScanned).toBe(1);
    expect(report.findings.every((f) => f.packageName === "ghost-pkg")).toBe(true);
    expect(report.findings.some((f) => f.ruleId === "nonexistent-package")).toBe(true);
    await rm(dir, { recursive: true, force: true });
  });

  it("throws a clear error when the base lockfile is missing", async () => {
    const dir = await makeProject({ "head.json": lock({ a: { version: "1.0.0" } }) });
    await expect(
      diffScan(path.join(dir, "nope.json"), path.join(dir, "head.json"), {
        client: notFoundRegistry,
        downloads: noDownloads,
        osv: noOsv,
      }),
    ).rejects.toThrow(/base lockfile/);
    await rm(dir, { recursive: true, force: true });
  });

  it("throws when the base lockfile is an unsupported version", async () => {
    const dir = await makeProject({
      "base.json": { lockfileVersion: 1, dependencies: {} },
      "head.json": lock({ a: { version: "1.0.0" } }),
    });
    await expect(
      diffScan(path.join(dir, "base.json"), path.join(dir, "head.json"), {
        client: notFoundRegistry,
        downloads: noDownloads,
        osv: noOsv,
      }),
    ).rejects.toThrow(/not supported/);
    await rm(dir, { recursive: true, force: true });
  });
});
