/**
 * OSV.dev advisory collector. Returns the known-vulnerability advisories for
 * each resolved package version, or "unverified" when a lookup could not be
 * completed (offline, error, malformed response). "checked" with an empty list
 * means verified-clean for that version; "unverified" means not checked and must
 * never be read as clean. Mirrors the registry client's shape. Zero runtime deps.
 */
import type { Advisory } from "../../core/model.js";
import { mapWithConcurrency } from "../../util/concurrency.js";
import { resolveAdvisorySeverity } from "./cvss.js";

const DEFAULT_API = "https://api.osv.dev";
const NPM_ECOSYSTEM = "npm";
const MAX_BATCH = 1000;
const MAX_ADVISORIES_PER_PACKAGE = 25;
const SUMMARY_MAX = 200;
const DETAIL_CONCURRENCY = 8;
/** Advisory ids are untrusted OSV data that reach a raw terminal render; only these shapes are used. */
const VALID_ID = /^[A-Za-z0-9._-]{1,128}$/;

export interface AdvisoryQuery {
  name: string;
  version: string;
}

export type AdvisoryLookup =
  { status: "checked"; advisories: Advisory[] } | { status: "unverified"; reason: string };

export interface OsvClientOptions {
  /** Injected for tests; defaults to global fetch. */
  fetchImpl?: typeof fetch;
  apiUrl?: string;
  offline?: boolean;
  timeoutMs?: number;
}

export interface OsvClient {
  /** Advisories for each query, aligned to input order. */
  queryVersions(queries: AdvisoryQuery[]): Promise<AdvisoryLookup[]>;
}

interface RawBatchVuln {
  id?: string;
}
interface RawBatchResult {
  vulns?: RawBatchVuln[];
}
interface RawBatchResponse {
  results?: RawBatchResult[];
}
interface RawReference {
  type?: string;
  url?: string;
}
interface RawVulnDetail {
  id?: string;
  summary?: string;
  details?: string;
  aliases?: string[];
  references?: RawReference[];
  severity?: Array<{ type?: string; score?: string }>;
  database_specific?: { severity?: string } | null;
  affected?: Array<{
    severity?: Array<{ type?: string; score?: string }>;
    database_specific?: { severity?: string } | null;
  }>;
}

function keyOf(q: AdvisoryQuery): string {
  return `${q.name}@${q.version}`;
}

// eslint-disable-next-line no-control-regex
const CONTROL_CHARS = /[\u0000-\u001f\u007f]+/g;

/** OSV summaries are third-party text; strip control chars and truncate before a report can render them. */
function sanitize(text: string): string {
  return text.replace(CONTROL_CHARS, " ").trim().slice(0, SUMMARY_MAX);
}

function bestUrl(id: string, detail: RawVulnDetail | undefined): string {
  const refs = detail?.references ?? [];
  const advisory = refs.find((r) => r?.type === "ADVISORY" && typeof r.url === "string");
  if (advisory?.url) return advisory.url;
  const any = refs.find((r) => typeof r?.url === "string");
  if (any?.url) return any.url;
  return `https://osv.dev/vulnerability/${id}`;
}

/**
 * Builds an Advisory from an id and its (possibly missing) detail. A matched id
 * is a real vulnerability, so when the detail fetch failed the advisory is still
 * reported, floored at medium: dropping it would be a false "safe".
 */
function toAdvisory(id: string, detail: RawVulnDetail | undefined): Advisory {
  if (!detail) {
    return {
      id,
      severity: "medium",
      severitySource: "floor",
      url: `https://osv.dev/vulnerability/${id}`,
    };
  }
  const { severity, source } = resolveAdvisorySeverity(detail);
  const aliases = Array.isArray(detail.aliases)
    ? detail.aliases.filter((a) => typeof a === "string")
    : [];
  const summaryRaw =
    typeof detail.summary === "string"
      ? detail.summary
      : typeof detail.details === "string"
        ? detail.details
        : undefined;
  return {
    id,
    ...(aliases.length > 0 ? { aliases } : {}),
    severity,
    severitySource: source,
    ...(summaryRaw ? { summary: sanitize(summaryRaw) } : {}),
    url: bestUrl(id, detail),
  };
}

export function createOsvClient(options: OsvClientOptions = {}): OsvClient {
  const fetchImpl = options.fetchImpl ?? fetch;
  const apiUrl = (options.apiUrl ?? DEFAULT_API).replace(/\/$/, "");
  const timeoutMs = options.timeoutMs ?? 10_000;
  const versionCache = new Map<string, Promise<AdvisoryLookup>>();
  const detailCache = new Map<string, Promise<RawVulnDetail | undefined>>();

  async function fetchJson(url: string, init?: RequestInit): Promise<unknown> {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeoutMs);
    try {
      const res = await fetchImpl(url, {
        ...init,
        signal: controller.signal,
        headers: { accept: "application/json", ...(init?.headers ?? {}) },
      });
      if (!res.ok) throw new Error(`OSV responded ${res.status}`);
      return await res.json();
    } finally {
      clearTimeout(timer);
    }
  }

  function getDetail(id: string): Promise<RawVulnDetail | undefined> {
    const cached = detailCache.get(id);
    if (cached) return cached;
    const pending = (async () => {
      try {
        return (await fetchJson(`${apiUrl}/v1/vulns/${encodeURIComponent(id)}`)) as RawVulnDetail;
      } catch {
        return undefined;
      }
    })();
    detailCache.set(id, pending);
    return pending;
  }

  async function runBatch(chunk: AdvisoryQuery[]): Promise<AdvisoryLookup[]> {
    let body: RawBatchResponse;
    try {
      body = (await fetchJson(`${apiUrl}/v1/querybatch`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          queries: chunk.map((q) => ({
            version: q.version,
            package: { name: q.name, ecosystem: NPM_ECOSYSTEM },
          })),
        }),
      })) as RawBatchResponse;
    } catch (err) {
      const reason = err instanceof Error ? err.message : String(err);
      return chunk.map(() => ({ status: "unverified", reason }));
    }
    const results = body?.results;
    if (!Array.isArray(results) || results.length !== chunk.length) {
      return chunk.map(() => ({
        status: "unverified",
        reason: "OSV batch response shape unexpected",
      }));
    }

    // Classify each entry honestly. A null/non-object entry or a non-array
    // `vulns` is unverified (not clean); a vulns array whose entries have no
    // usable id is unverified (a hit we cannot identify is not "safe"); absent
    // or empty vulns is verified-clean.
    type Entry =
      { kind: "clean" } | { kind: "unverified"; reason: string } | { kind: "hit"; ids: string[] };
    const entries: Entry[] = (results as unknown[]).map((r) => {
      if (r === null || typeof r !== "object") {
        return { kind: "unverified", reason: "OSV result entry is not an object" };
      }
      const vulns = (r as { vulns?: unknown }).vulns;
      if (vulns === undefined) return { kind: "clean" };
      if (!Array.isArray(vulns)) {
        return { kind: "unverified", reason: "OSV vulns is not an array" };
      }
      if (vulns.length === 0) return { kind: "clean" };
      const ids = (vulns as unknown[])
        .map((v) => (v as { id?: unknown } | null)?.id)
        .filter((id): id is string => typeof id === "string" && VALID_ID.test(id));
      if (ids.length === 0) {
        return { kind: "unverified", reason: "OSV hit with no usable advisory id" };
      }
      return { kind: "hit", ids: ids.slice(0, MAX_ADVISORIES_PER_PACKAGE) };
    });

    // Warm the detail cache for every unique id in one globally-bounded pass, so
    // fan-out stays at DETAIL_CONCURRENCY across the whole chunk, not per package.
    const uniqueIds = Array.from(new Set(entries.flatMap((e) => (e.kind === "hit" ? e.ids : []))));
    await mapWithConcurrency(uniqueIds, DETAIL_CONCURRENCY, (id) => getDetail(id));

    return Promise.all(
      entries.map(async (e): Promise<AdvisoryLookup> => {
        if (e.kind === "clean") return { status: "checked", advisories: [] };
        if (e.kind === "unverified") return { status: "unverified", reason: e.reason };
        const advisories = await Promise.all(
          e.ids.map(async (id) => toAdvisory(id, await getDetail(id))),
        );
        advisories.sort((a, b) => a.id.localeCompare(b.id));
        return { status: "checked", advisories };
      }),
    );
  }

  async function resolveUncached(queries: AdvisoryQuery[]): Promise<Map<string, AdvisoryLookup>> {
    const out = new Map<string, AdvisoryLookup>();
    const fallback = (reason: string): AdvisoryLookup => ({ status: "unverified", reason });
    try {
      for (let i = 0; i < queries.length; i += MAX_BATCH) {
        const chunk = queries.slice(i, i + MAX_BATCH);
        const res = await runBatch(chunk);
        chunk.forEach((q, j) => out.set(keyOf(q), res[j] ?? fallback("OSV lookup incomplete")));
      }
    } catch (err) {
      // Never strand a cached promise: any unexpected throw settles the rest as
      // unverified so a later identical query resolves rather than hanging.
      const reason = err instanceof Error ? err.message : String(err);
      for (const q of queries) if (!out.has(keyOf(q))) out.set(keyOf(q), fallback(reason));
    }
    for (const q of queries) {
      if (!out.has(keyOf(q))) out.set(keyOf(q), fallback("OSV lookup incomplete"));
    }
    return out;
  }

  return {
    async queryVersions(queries) {
      if (options.offline) {
        return queries.map(() => ({ status: "unverified", reason: "offline" }));
      }
      const uncached: AdvisoryQuery[] = [];
      const seen = new Set<string>();
      for (const q of queries) {
        const key = keyOf(q);
        if (!versionCache.has(key) && !seen.has(key)) {
          seen.add(key);
          uncached.push(q);
        }
      }
      if (uncached.length > 0) {
        const resolved = resolveUncached(uncached);
        for (const q of uncached) {
          const key = keyOf(q);
          versionCache.set(
            key,
            resolved.then((m) => m.get(key)!),
          );
        }
      }
      return Promise.all(queries.map((q) => versionCache.get(keyOf(q))!));
    },
  };
}
