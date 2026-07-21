import type { PackageFacts } from "../../core/model.js";
import { mapWithConcurrency } from "../../util/concurrency.js";
import type { RegistryClient } from "./registry.js";
import type { DownloadsClient } from "./downloads.js";

export interface EnrichmentResult {
  facts: PackageFacts[];
  /** Names whose registry facts could not be established (offline, error). */
  unverified: string[];
}

export interface EnrichOptions {
  concurrency?: number;
  downloads?: DownloadsClient;
  /** Injected for a deterministic age computation in tests. */
  now?: () => Date;
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

  const facts = await mapWithConcurrency(input, concurrency, async (fact) => {
    if (fact.source !== "registry") return fact;

    const [lookup, weeklyDownloads] = await Promise.all([
      client.getPackument(fact.name, fact.version),
      options.downloads?.getWeeklyDownloads(fact.name),
    ]);

    if (lookup.status === "not-found") {
      return { ...fact, existsOnRegistry: false };
    }
    if (lookup.status === "unverified") {
      unverified.push(fact.name);
      return fact;
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

  return { facts, unverified };
}
