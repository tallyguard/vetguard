import { describe, expect, it } from "vitest";
import { enrichWithRegistry } from "../../src/ecosystems/npm/enrich.js";
import type { PackageFacts } from "../../src/core/model.js";
import type { RegistryClient, RegistryLookup } from "../../src/ecosystems/npm/registry.js";

function fact(overrides: Partial<PackageFacts>): PackageFacts {
  return { name: "x", kind: "prod", source: "registry", ...overrides };
}

function clientReturning(map: Record<string, RegistryLookup>): RegistryClient {
  return {
    getPackument: async (name) =>
      map[name] ?? { status: "unverified", reason: "no stub for " + name },
  };
}

describe("enrichWithRegistry", () => {
  it("marks a 404 package as not existing so the detector can fire", async () => {
    const client = clientReturning({ ghost: { status: "not-found" } });
    const { facts, unverified } = await enrichWithRegistry([fact({ name: "ghost" })], client);
    expect(facts[0]?.existsOnRegistry).toBe(false);
    expect(unverified).toHaveLength(0);
  });

  it("folds registry facts into a found package", async () => {
    const client = clientReturning({
      good: {
        status: "found",
        packument: {
          name: "good",
          firstPublishAt: "2016-01-01T00:00:00.000Z",
          latestPublishAt: "2024-01-01T00:00:00.000Z",
          latestVersion: "3.0.0",
          versionCount: 40,
          hasInstallScript: true,
          repositoryUrl: "git+https://github.com/good/good.git",
        },
      },
    });
    const { facts } = await enrichWithRegistry([fact({ name: "good" })], client);
    expect(facts[0]?.existsOnRegistry).toBe(true);
    expect(facts[0]?.hasInstallScript).toBe(true);
    expect(facts[0]?.firstPublishAt).toBe("2016-01-01T00:00:00.000Z");
  });

  it("records an unverified lookup without asserting existence", async () => {
    const client = clientReturning({ maybe: { status: "unverified", reason: "offline" } });
    const { facts, unverified } = await enrichWithRegistry([fact({ name: "maybe" })], client);
    expect(facts[0]?.existsOnRegistry).toBeUndefined();
    expect(unverified).toEqual(["maybe"]);
  });

  it("does not look up non-registry sources", async () => {
    let called = false;
    const client: RegistryClient = {
      getPackument: async () => {
        called = true;
        return { status: "not-found" };
      },
    };
    const { facts } = await enrichWithRegistry(
      [fact({ name: "local", source: "file" }), fact({ name: "repo", source: "git" })],
      client,
    );
    expect(called).toBe(false);
    expect(facts[0]?.existsOnRegistry).toBeUndefined();
  });

  it("preserves input order under concurrency", async () => {
    const names = Array.from({ length: 25 }, (_, i) => `p${i}`);
    const client: RegistryClient = {
      getPackument: async (name) => {
        await new Promise((r) => setTimeout(r, (24 - Number(name.slice(1))) % 5));
        return { status: "not-found" };
      },
    };
    const { facts } = await enrichWithRegistry(
      names.map((n) => fact({ name: n })),
      client,
      { concurrency: 6 },
    );
    expect(facts.map((f) => f.name)).toEqual(names);
  });

  it("computes ageDays from firstPublishAt against an injected now", async () => {
    const client = clientReturning({
      young: {
        status: "found",
        packument: {
          name: "young",
          firstPublishAt: "2026-07-01T00:00:00.000Z",
          versionCount: 1,
          hasInstallScript: false,
        },
      },
    });
    const { facts } = await enrichWithRegistry([fact({ name: "young" })], client, {
      now: () => new Date("2026-07-21T00:00:00.000Z"),
    });
    expect(facts[0]?.ageDays).toBe(20);
    expect(facts[0]?.versionCount).toBe(1);
  });

  it("folds weekly downloads from the downloads client", async () => {
    const client = clientReturning({
      p: { status: "found", packument: { name: "p", versionCount: 3, hasInstallScript: false } },
    });
    const downloads = { getWeeklyDownloads: async () => 42 };
    const { facts } = await enrichWithRegistry([fact({ name: "p" })], client, { downloads });
    expect(facts[0]?.weeklyDownloads).toBe(42);
  });
});
