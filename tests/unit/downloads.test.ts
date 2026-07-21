import { describe, expect, it, vi } from "vitest";
import { createDownloadsClient } from "../../src/ecosystems/npm/downloads.js";

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "content-type": "application/json" },
  });
}

describe("downloads client", () => {
  it("returns the weekly download count", async () => {
    const fetchImpl = vi.fn(async () => jsonResponse({ downloads: 5000, package: "x" }));
    const client = createDownloadsClient({ fetchImpl });
    expect(await client.getWeeklyDownloads("x")).toBe(5000);
  });

  it("returns undefined for an error body, never zero", async () => {
    const fetchImpl = vi.fn(async () => jsonResponse({ error: "not found" }));
    const client = createDownloadsClient({ fetchImpl });
    expect(await client.getWeeklyDownloads("ghost")).toBeUndefined();
  });

  it("returns undefined on a non-ok status", async () => {
    const fetchImpl = vi.fn(async () => jsonResponse({}, 500));
    const client = createDownloadsClient({ fetchImpl });
    expect(await client.getWeeklyDownloads("x")).toBeUndefined();
  });

  it("does not query the network for scoped packages", async () => {
    const fetchImpl = vi.fn(async () => jsonResponse({ downloads: 1 }));
    const client = createDownloadsClient({ fetchImpl });
    expect(await client.getWeeklyDownloads("@scope/pkg")).toBeUndefined();
    expect(fetchImpl).not.toHaveBeenCalled();
  });

  it("does not query the network when offline", async () => {
    const fetchImpl = vi.fn(async () => jsonResponse({ downloads: 1 }));
    const client = createDownloadsClient({ fetchImpl, offline: true });
    expect(await client.getWeeklyDownloads("x")).toBeUndefined();
    expect(fetchImpl).not.toHaveBeenCalled();
  });

  it("memoizes within a run", async () => {
    const fetchImpl = vi.fn(async () => jsonResponse({ downloads: 1 }));
    const client = createDownloadsClient({ fetchImpl });
    await Promise.all([client.getWeeklyDownloads("x"), client.getWeeklyDownloads("x")]);
    expect(fetchImpl).toHaveBeenCalledTimes(1);
  });
});
