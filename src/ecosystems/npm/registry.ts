/**
 * npm registry client. This is a collector: it does IO and returns facts. It
 * never judges. Every path degrades honestly, a lookup that could not be
 * completed returns status "unverified", never a value that reads as "safe".
 */

import { contentLengthOver, NETWORK_BODY_CAP } from "../../util/fs.js";

const DEFAULT_REGISTRY = "https://registry.npmjs.org";
const INSTALL_HOOKS = ["preinstall", "install", "postinstall"] as const;

/** Parsed, flattened facts from a registry packument. */
export interface Packument {
  name: string;
  firstPublishAt?: string;
  latestPublishAt?: string;
  latestVersion?: string;
  versionCount: number;
  /** Whether the resolved version is still published, when a version is asked. */
  requestedVersionPublished?: boolean;
  hasInstallScript: boolean;
  repositoryUrl?: string;
}

export type RegistryLookup =
  | { status: "found"; packument: Packument }
  | { status: "not-found" }
  | { status: "unverified"; reason: string };

export interface RegistryClientOptions {
  /** Injected for tests; defaults to global fetch. */
  fetchImpl?: typeof fetch;
  registryUrl?: string;
  offline?: boolean;
  timeoutMs?: number;
}

export interface RegistryClient {
  getPackument(name: string, version?: string): Promise<RegistryLookup>;
}

/** Scoped names keep the leading @ but the internal slash must be encoded. */
export function encodePackageName(name: string): string {
  return name.replace(/\//g, "%2F");
}

interface RawPackument {
  time?: Record<string, string>;
  "dist-tags"?: Record<string, string>;
  versions?: Record<string, RawVersion>;
}

interface RawVersion {
  scripts?: Record<string, string>;
  repository?: string | { url?: string };
}

function repositoryUrlOf(v: RawVersion | undefined): string | undefined {
  if (!v?.repository) return undefined;
  return typeof v.repository === "string" ? v.repository : v.repository.url;
}

function hasInstallHook(v: RawVersion | undefined): boolean {
  const scripts = v?.scripts;
  if (!scripts) return false;
  return INSTALL_HOOKS.some((hook) => typeof scripts[hook] === "string");
}

function parsePackument(name: string, raw: RawPackument, version?: string): Packument {
  const time = raw.time ?? {};
  const versions = raw.versions ?? {};
  const versionKeys = Object.keys(versions);
  const latestVersion = raw["dist-tags"]?.latest;
  const inspected = version ?? latestVersion;
  const inspectedManifest = inspected ? versions[inspected] : undefined;
  const repositoryUrl = repositoryUrlOf(inspectedManifest);

  return {
    name,
    ...(time.created === undefined ? {} : { firstPublishAt: time.created }),
    ...(time.modified === undefined ? {} : { latestPublishAt: time.modified }),
    ...(latestVersion === undefined ? {} : { latestVersion }),
    versionCount: versionKeys.length,
    ...(version === undefined ? {} : { requestedVersionPublished: version in versions }),
    hasInstallScript: hasInstallHook(inspectedManifest),
    ...(repositoryUrl === undefined ? {} : { repositoryUrl }),
  };
}

export function createRegistryClient(options: RegistryClientOptions = {}): RegistryClient {
  const fetchImpl = options.fetchImpl ?? fetch;
  const registryUrl = (options.registryUrl ?? DEFAULT_REGISTRY).replace(/\/$/, "");
  const timeoutMs = options.timeoutMs ?? 10_000;

  // In-run memoization: a transitive tree repeats package names constantly, and
  // vetting the same name twice wastes a request. Cross-run disk cache is a
  // planned follow-up (see docs/PLAN.md).
  const cache = new Map<string, Promise<RegistryLookup>>();

  async function fetchPackument(name: string, version?: string): Promise<RegistryLookup> {
    if (options.offline) {
      return { status: "unverified", reason: "offline" };
    }

    const url = `${registryUrl}/${encodePackageName(name)}`;
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeoutMs);
    try {
      const res = await fetchImpl(url, {
        signal: controller.signal,
        headers: { accept: "application/json" },
      });
      if (res.status === 404) return { status: "not-found" };
      if (!res.ok) {
        return { status: "unverified", reason: `registry responded ${res.status}` };
      }
      if (contentLengthOver(res, NETWORK_BODY_CAP)) {
        return { status: "unverified", reason: "registry response too large" };
      }
      const raw = (await res.json()) as RawPackument;
      return { status: "found", packument: parsePackument(name, raw, version) };
    } catch (err) {
      const reason = err instanceof Error ? err.message : String(err);
      return { status: "unverified", reason };
    } finally {
      clearTimeout(timer);
    }
  }

  return {
    getPackument(name, version) {
      const key = version ? `${name}@${version}` : name;
      const existing = cache.get(key);
      if (existing) return existing;
      const pending = fetchPackument(name, version);
      cache.set(key, pending);
      return pending;
    },
  };
}
