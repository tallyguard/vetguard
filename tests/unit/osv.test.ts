import { describe, expect, it, vi } from "vitest";
import { createOsvClient } from "../../src/ecosystems/npm/osv.js";

type Resp = { ok: boolean; status: number; json: () => Promise<unknown> };
function res(body: unknown, opts?: { ok?: boolean; status?: number }): Resp {
  return { ok: opts?.ok ?? true, status: opts?.status ?? 200, json: async () => body };
}

/** Routes POST /v1/querybatch and GET /v1/vulns/{id} to handlers. */
function fakeFetch(handlers: {
  batch?: (body: unknown) => Resp;
  detail?: (id: string) => Resp;
}): typeof fetch {
  return (async (url: string | URL, init?: RequestInit) => {
    const u = String(url);
    if (u.endsWith("/v1/querybatch")) {
      const body = init?.body ? JSON.parse(String(init.body)) : undefined;
      return handlers.batch ? handlers.batch(body) : res({ results: [] });
    }
    const m = u.match(/\/v1\/vulns\/(.+)$/);
    if (m && handlers.detail) return handlers.detail(decodeURIComponent(m[1]!));
    return res({}, { ok: false, status: 404 });
  }) as unknown as typeof fetch;
}

const ghsaDetail = (id: string, severity: string): unknown => ({
  id,
  summary: "A vulnerability in the thing",
  aliases: ["CVE-2020-1"],
  references: [{ type: "ADVISORY", url: `https://github.com/advisories/${id}` }],
  database_specific: { severity },
});

describe("createOsvClient", () => {
  it("maps a batch hit plus its detail into an advisory", async () => {
    const client = createOsvClient({
      fetchImpl: fakeFetch({
        batch: () => res({ results: [{ vulns: [{ id: "GHSA-a" }] }] }),
        detail: (id) => res(ghsaDetail(id, "HIGH")),
      }),
    });
    const r = (await client.queryVersions([{ name: "lodash", version: "4.17.4" }]))[0]!;
    if (r.status !== "checked") throw new Error("expected checked");
    expect(r.advisories).toHaveLength(1);
    expect(r.advisories[0]).toMatchObject({
      id: "GHSA-a",
      severity: "high",
      severitySource: "label",
      aliases: ["CVE-2020-1"],
    });
    expect(r.advisories[0]?.url).toContain("github.com/advisories");
  });

  it("reports checked-clean (not unverified) when there are no vulns", async () => {
    const client = createOsvClient({
      fetchImpl: fakeFetch({ batch: () => res({ results: [{ vulns: [] }] }) }),
    });
    const r = (await client.queryVersions([{ name: "safe", version: "1.0.0" }]))[0]!;
    expect(r).toEqual({ status: "checked", advisories: [] });
  });

  it("aligns results to input order", async () => {
    const client = createOsvClient({
      fetchImpl: fakeFetch({
        batch: () => res({ results: [{ vulns: [] }, { vulns: [{ id: "GHSA-b" }] }] }),
        detail: (id) => res(ghsaDetail(id, "LOW")),
      }),
    });
    const out = await client.queryVersions([
      { name: "a", version: "1" },
      { name: "b", version: "2" },
    ]);
    expect(out[0]).toEqual({ status: "checked", advisories: [] });
    expect(out[1]?.status).toBe("checked");
  });

  it("never touches the network when offline", async () => {
    const fetchImpl = vi.fn();
    const client = createOsvClient({
      offline: true,
      fetchImpl: fetchImpl as unknown as typeof fetch,
    });
    const out = await client.queryVersions([{ name: "a", version: "1" }]);
    expect(out[0]).toEqual({ status: "unverified", reason: "offline" });
    expect(fetchImpl).not.toHaveBeenCalled();
  });

  it("marks every query unverified on a batch error", async () => {
    const client = createOsvClient({
      fetchImpl: fakeFetch({ batch: () => res({}, { ok: false, status: 500 }) }),
    });
    const r = (await client.queryVersions([{ name: "a", version: "1" }]))[0]!;
    expect(r.status).toBe("unverified");
  });

  it("marks unverified on malformed batch JSON (hostile input)", async () => {
    const fetchImpl = (async () => ({
      ok: true,
      status: 200,
      json: async () => {
        throw new Error("bad json");
      },
    })) as unknown as typeof fetch;
    const client = createOsvClient({ fetchImpl });
    const r = (await client.queryVersions([{ name: "a", version: "1" }]))[0]!;
    expect(r.status).toBe("unverified");
  });

  it("marks unverified on a results/queries length mismatch (hostile input)", async () => {
    const client = createOsvClient({
      fetchImpl: fakeFetch({ batch: () => res({ results: [] }) }),
    });
    const out = await client.queryVersions([
      { name: "a", version: "1" },
      { name: "b", version: "2" },
    ]);
    expect(out.every((r) => r.status === "unverified")).toBe(true);
  });

  it("keeps a matched advisory at the medium floor when its detail cannot be fetched", async () => {
    const client = createOsvClient({
      fetchImpl: fakeFetch({
        batch: () => res({ results: [{ vulns: [{ id: "GHSA-z" }] }] }),
        detail: () => res({}, { ok: false, status: 500 }),
      }),
    });
    const r = (await client.queryVersions([{ name: "a", version: "1" }]))[0]!;
    if (r.status !== "checked") throw new Error("expected checked");
    expect(r.advisories[0]).toMatchObject({
      id: "GHSA-z",
      severity: "medium",
      severitySource: "floor",
      url: "https://osv.dev/vulnerability/GHSA-z",
    });
  });

  it("caches by name@version and by advisory id within a run", async () => {
    const batch = vi.fn(() => res({ results: [{ vulns: [{ id: "GHSA-a" }] }] }));
    const detail = vi.fn((id: string) => res(ghsaDetail(id, "HIGH")));
    const client = createOsvClient({ fetchImpl: fakeFetch({ batch, detail }) });
    await client.queryVersions([{ name: "a", version: "1" }]);
    await client.queryVersions([{ name: "a", version: "1" }]);
    expect(batch).toHaveBeenCalledTimes(1);
    expect(detail).toHaveBeenCalledTimes(1);
  });

  it("treats a hit whose only id is malformed as unverified, not clean", async () => {
    const client = createOsvClient({
      fetchImpl: fakeFetch({
        batch: () => res({ results: [{ vulns: [{ id: "bad id\nwith spaces" }] }] }),
      }),
    });
    const r = (await client.queryVersions([{ name: "a", version: "1" }]))[0]!;
    expect(r.status).toBe("unverified");
  });

  it("treats a null result entry as unverified, not clean", async () => {
    const client = createOsvClient({
      fetchImpl: fakeFetch({ batch: () => res({ results: [null] }) }),
    });
    const r = (await client.queryVersions([{ name: "a", version: "1" }]))[0]!;
    expect(r.status).toBe("unverified");
  });

  it("treats a non-array vulns as unverified, not clean", async () => {
    const client = createOsvClient({
      fetchImpl: fakeFetch({ batch: () => res({ results: [{ vulns: "nope" }] }) }),
    });
    const r = (await client.queryVersions([{ name: "a", version: "1" }]))[0]!;
    expect(r.status).toBe("unverified");
  });
});
