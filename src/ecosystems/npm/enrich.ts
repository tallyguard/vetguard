import type { PackageFacts } from "../../core/model.js";
import { mapWithConcurrency } from "../../util/concurrency.js";
import type { RegistryClient } from "./registry.js";
import type { DownloadsClient } from "./downloads.js";
import type { AdvisoryLookup, OsvClient } from "./osv.js";

export interface EnrichmentResult {
  facts: PackageFacts[];
  /** Names whose registry facts could not be established (offline, error). */
  unverified: string[];
}

export interface EnrichOptions {
  concurrency?: number;
  downloads?: DownloadsClient;
  /** OSV advisory client; when present, resolved versions are checked for known CVEs. */
  osv?: OsvClient;
  /** Injected for a deterministic age computation in tests. */
  now?: () => Date;
}

/** An exact resolved semver (what a lockfile pins); a range cannot be advisory-checked as one version. */
function isExactVersion(v: string | undefined): v is string {
  return v !== undefined && /^\d+\.\d+\.\d+(?:[-+][0-9A-Za-z.-]+)?$/.test(v);
}

function ageDaysFrom(firstPublishAt: string | undefined, now: Date): number | undefined {
  if (!firstPublishAt) return undefined;
  const published = Date.parse(firstPublishAt);
  if (Number.isNaN(published)) return undefined;
  const ms = now.getTime() - published;
  return ms < 0 ? 0 : Math.floor(ms / 86_400_000);
}

/**
 * Enriches manifest facts with registry and downloads facts. A collector: it
 * performs the IO and folds the results into `PackageFacts` for the pure
 * detectors to judge. Only registry-sourced dependencies are looked up; git,
 * file, link, alias, and workspace specifiers have no registry record and are
 * left as they are.
 */
export async function enrichWithRegistry(
  input: PackageFacts[],
  client: RegistryClient,
  options: EnrichOptions = {},
): Promise<EnrichmentResult> {
  const concurrency = options.concurrency ?? 8;
  const now = options.now ? options.now() : new Date();
  const unverified: string[] = [];

  const enriched = await mapWithConcurrency(input, concurrency, async (fact) => {
    if (fact.source !== "registry") {
      // git/file/link/workspace/alias are recognised, deliberately-unjudged
      // patterns. An "unknown" source is an off-registry URL we cannot check
      // against npm, so report it as unverified rather than implicitly clean.
      if (fact.source === "unknown") unverified.push(fact.name);
      return fact;
    }

    const [lookup, weeklyDownloads] = await Promise.all([
      client.getPackument(fact.name, fact.version),
      options.downloads?.getWeeklyDownloads(fact.name),
    ]);

    if (lookup.status === "not-found") {
      return { ...fact, existsOnRegistry: false };
    }
    if (lookup.status === "unverified") {
      unverified.push(fact.name);
      const existenceUnverifiedReason: "offline" | "error" =
        lookup.reason === "offline" ? "offline" : "error";
      return { ...fact, existenceUnverifiedReason };
    }

    const p = lookup.packument;
    const ageDays = ageDaysFrom(p.firstPublishAt, now);
    return {
      ...fact,
      existsOnRegistry: true,
      ...(p.firstPublishAt === undefined ? {} : { firstPublishAt: p.firstPublishAt }),
      ...(p.latestPublishAt === undefined ? {} : { latestPublishAt: p.latestPublishAt }),
      ...(ageDays === undefined ? {} : { ageDays }),
      versionCount: p.versionCount,
      ...(p.requestedVersionPublished === undefined
        ? {}
        : { versionPublished: p.requestedVersionPublished }),
      // A lockfile reports the install-script status of the installed version;
      // the registry only reports the latest, so a lockfile fact wins.
      hasInstallScript: fact.hasInstallScript ?? p.hasInstallScript,
      ...(p.repositoryUrl === undefined ? {} : { repositoryUrl: p.repositoryUrl }),
      ...(weeklyDownloads === undefined ? {} : { weeklyDownloads }),
    } satisfies PackageFacts;
  });

  // Advisory pass. One batched OSV lookup over resolved, registry-sourced
  // versions (a name the registry said does not exist has no advisories to
  // check). A lookup that could not be completed marks the package unverified so
  // the verdict degrades honestly; it never reads as "no advisories".
  let facts = enriched;
  if (options.osv) {
    // Only an exact resolved version can be advisory-checked. A registry package
    // that exists but has a range or no concrete version cannot be checked, so it
    // is surfaced as unverified rather than read as clean: a scan that checked
    // zero advisories must never report "clean".
    const eligible = enriched.filter(
      (f) => f.source === "registry" && f.existsOnRegistry !== false,
    );
    const queryable = eligible.filter((f) => isExactVersion(f.version));
    const lookups =
      queryable.length > 0
        ? await options.osv.queryVersions(
            queryable.map((f) => ({ name: f.name, version: f.version as string })),
          )
        : [];
    const byFact = new Map<PackageFacts, AdvisoryLookup>();
    queryable.forEach((f, i) => byFact.set(f, lookups[i]!));
    const uncheckable = new Set(eligible.filter((f) => !isExactVersion(f.version)));

    facts = enriched.map((f) => {
      const lookup = byFact.get(f);
      if (lookup) {
        if (lookup.status === "checked") return { ...f, knownVulnerabilities: lookup.advisories };
        unverified.push(f.name);
        const advisoriesUnverifiedReason: "offline" | "error" =
          lookup.reason === "offline" ? "offline" : "error";
        return { ...f, advisoriesUnverifiedReason };
      }
      if (uncheckable.has(f)) {
        unverified.push(f.name);
        return { ...f, advisoriesUnverifiedReason: "error" as const };
      }
      return f;
    });
  }

  return { facts, unverified: Array.from(new Set(unverified)) };
}
