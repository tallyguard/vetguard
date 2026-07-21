import { describe, expect, it, vi } from "vitest";
import { createRegistryClient, encodePackageName } from "../../src/ecosystems/npm/registry.js";

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "content-type": "application/json" },
  });
}

const PACKUMENT = {
  time: { created: "2015-01-01T00:00:00.000Z", modified: "2024-01-01T00:00:00.000Z" },
  "dist-tags": { latest: "2.0.0" },
  versions: {
    "1.0.0": {},
    "2.0.0": {
      scripts: { postinstall: "node setup.js" },
      repository: { url: "git+https://github.com/example/pkg.git" },
    },
  },
};

describe("encodePackageName", () => {
  it("encodes the slash in a scoped name but keeps the @", () => {
    expect(encodePackageName("@scope/pkg")).toBe("@scope%2Fpkg");
    expect(encodePackageName("express")).toBe("express");
  });
});

describe("registry client", () => {
  it("returns found with flattened facts for a 200", async () => {
    const fetchImpl = vi.fn(async () => jsonResponse(PACKUMENT));
    const client = createRegistryClient({ fetchImpl });
    const res = await client.getPackument("pkg");

    expect(res.status).toBe("found");
    if (res.status !== "found") throw new Error("expected found");
    expect(res.packument.latestVersion).toBe("2.0.0");
    expect(res.packument.firstPublishAt).toBe("2015-01-01T00:00:00.000Z");
    expect(res.packument.versionCount).toBe(2);
    expect(res.packument.hasInstallScript).toBe(true);
    expect(res.packument.repositoryUrl).toContain("github.com/example/pkg");
  });

  it("maps 404 to not-found", async () => {
    const fetchImpl = vi.fn(async () => jsonResponse({}, 404));
    const client = createRegistryClient({ fetchImpl });
    expect((await client.getPackument("nope")).status).toBe("not-found");
  });

  it("maps a network error to unverified, never safe", async () => {
    const fetchImpl = vi.fn(async () => {
      throw new Error("ECONNREFUSED");
    });
    const client = createRegistryClient({ fetchImpl });
    const res = await client.getPackument("pkg");
    expect(res.status).toBe("unverified");
  });

  it("maps a 5xx to unverified", async () => {
    const fetchImpl = vi.fn(async () => jsonResponse({}, 503));
    const client = createRegistryClient({ fetchImpl });
    expect((await client.getPackument("pkg")).status).toBe("unverified");
  });

  it("does not contact the network when offline", async () => {
    const fetchImpl = vi.fn(async () => jsonResponse(PACKUMENT));
    const client = createRegistryClient({ fetchImpl, offline: true });
    const res = await client.getPackument("pkg");
    expect(res.status).toBe("unverified");
    expect(fetchImpl).not.toHaveBeenCalled();
  });

  it("memoizes within a run, one request per name", async () => {
    const fetchImpl = vi.fn(async () => jsonResponse(PACKUMENT));
    const client = createRegistryClient({ fetchImpl });
    await Promise.all([client.getPackument("pkg"), client.getPackument("pkg")]);
    expect(fetchImpl).toHaveBeenCalledTimes(1);
  });

  it("reports whether a requested version is published", async () => {
    const fetchImpl = vi.fn(async () => jsonResponse(PACKUMENT));
    const client = createRegistryClient({ fetchImpl });

    const present = await client.getPackument("pkg", "1.0.0");
    if (present.status !== "found") throw new Error("expected found");
    expect(present.packument.requestedVersionPublished).toBe(true);

    const missing = await client.getPackument("pkg", "9.9.9");
    if (missing.status !== "found") throw new Error("expected found");
    expect(missing.packument.requestedVersionPublished).toBe(false);
  });
});
