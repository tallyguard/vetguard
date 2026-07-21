import type { PackageFacts } from "../../core/model.js";
import { mapWithConcurrency } from "../../util/concurrency.js";
import type { RegistryClient } from "./registry.js";

export interface EnrichmentResult {
  facts: PackageFacts[];
  /** Names whose registry facts could not be established (offline, error). */
  unverified: string[];
}

/**
 * Enriches manifest facts with registry facts. A collector: it performs the IO
 * and folds the results into `PackageFacts` for the pure detectors to judge.
 * Only registry-sourced dependencies are looked up; git, file, link, alias, and
 * workspace specifiers have no registry record and are left as they are.
 */
export async function enrichWithRegistry(
  input: PackageFacts[],
  client: RegistryClient,
  options: { concurrency?: number } = {},
): Promise<EnrichmentResult> {
  const concurrency = options.concurrency ?? 8;
  const unverified: string[] = [];

  const facts = await mapWithConcurrency(input, concurrency, async (fact) => {
    if (fact.source !== "registry") return fact;

    const lookup = await client.getPackument(fact.name, fact.version);
    if (lookup.status === "not-found") {
      return { ...fact, existsOnRegistry: false };
    }
    if (lookup.status === "unverified") {
      unverified.push(fact.name);
      return fact;
    }

    const p = lookup.packument;
    return {
      ...fact,
      existsOnRegistry: true,
      ...(p.firstPublishAt === undefined ? {} : { firstPublishAt: p.firstPublishAt }),
      ...(p.latestPublishAt === undefined ? {} : { latestPublishAt: p.latestPublishAt }),
      ...(p.requestedVersionPublished === undefined
        ? {}
        : { versionPublished: p.requestedVersionPublished }),
      hasInstallScript: p.hasInstallScript,
      ...(p.repositoryUrl === undefined ? {} : { repositoryUrl: p.repositoryUrl }),
    } satisfies PackageFacts;
  });

  return { facts, unverified };
}
