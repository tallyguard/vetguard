/**
 * npm downloads API client. A collector: returns the last-week download count
 * for a package, or `undefined` when the count cannot be established (offline,
 * error, or an unsupported name such as a scoped package, which the point API
 * does not serve). `undefined` means "unknown", never "zero" or "safe".
 */

import { contentLengthOver, NETWORK_BODY_CAP } from "../../util/fs.js";

const DEFAULT_API = "https://api.npmjs.org";

export interface DownloadsClientOptions {
  fetchImpl?: typeof fetch;
  apiUrl?: string;
  offline?: boolean;
  timeoutMs?: number;
}

export interface DownloadsClient {
  getWeeklyDownloads(name: string): Promise<number | undefined>;
}

interface DownloadsResponse {
  downloads?: number;
  error?: string;
}

export function createDownloadsClient(options: DownloadsClientOptions = {}): DownloadsClient {
  const fetchImpl = options.fetchImpl ?? fetch;
  const apiUrl = (options.apiUrl ?? DEFAULT_API).replace(/\/$/, "");
  const timeoutMs = options.timeoutMs ?? 10_000;
  const cache = new Map<string, Promise<number | undefined>>();

  async function fetchDownloads(name: string): Promise<number | undefined> {
    if (options.offline) return undefined;
    // The point API does not serve scoped packages; skip rather than misreport.
    if (name.startsWith("@")) return undefined;

    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeoutMs);
    try {
      const res = await fetchImpl(`${apiUrl}/downloads/point/last-week/${name}`, {
        signal: controller.signal,
        headers: { accept: "application/json" },
      });
      if (!res.ok) return undefined;
      if (contentLengthOver(res, NETWORK_BODY_CAP)) return undefined;
      const body = (await res.json()) as DownloadsResponse;
      return typeof body.downloads === "number" ? body.downloads : undefined;
    } catch {
      return undefined;
    } finally {
      clearTimeout(timer);
    }
  }

  return {
    getWeeklyDownloads(name) {
      const existing = cache.get(name);
      if (existing) return existing;
      const pending = fetchDownloads(name);
      cache.set(name, pending);
      return pending;
    },
  };
}
