import { runDetectors } from "./core/engine.js";
import { builtinDetectors } from "./core/rules/index.js";
import type { Detector, PackageFacts, Report } from "./core/model.js";
import { readManifestFacts } from "./ecosystems/npm/manifest.js";
import { readLockfile, detectOtherLockfiles } from "./ecosystems/npm/lockfile.js";
import { enrichWithRegistry, type EnrichOptions } from "./ecosystems/npm/enrich.js";
import { createRegistryClient, type RegistryClient } from "./ecosystems/npm/registry.js";
import { createDownloadsClient, type DownloadsClient } from "./ecosystems/npm/downloads.js";
import { parsePackageSpec } from "./ecosystems/npm/spec.js";

export interface ScanOptions {
  offline?: boolean;
  /** Injected in tests so the suite never touches the network. */
  client?: RegistryClient;
  downloads?: DownloadsClient;
  detectors?: Detector[];
  /** Injected for a deterministic `generatedAt` and age in tests. */
  now?: () => Date;
}

function registryFor(options: ScanOptions): RegistryClient {
  return options.client ?? createRegistryClient({ offline: options.offline ?? false });
}

function downloadsFor(options: ScanOptions): DownloadsClient {
  return options.downloads ?? createDownloadsClient({ offline: options.offline ?? false });
}

function timestamp(options: ScanOptions): string {
  return (options.now ? options.now() : new Date()).toISOString();
}

function enrichOptions(options: ScanOptions): EnrichOptions {
  return {
    downloads: downloadsFor(options),
    ...(options.now === undefined ? {} : { now: options.now }),
  };
}

/**
 * Scans a project. Prefers the resolved package-lock.json tree (v2/v3); falls
 * back to the manifest's declared dependencies when the lockfile is absent or
 * an unsupported shape, recording a warning so the fallback is never silent.
 */
export async function scanProject(dir: string, options: ScanOptions = {}): Promise<Report> {
  const lockfile = await readLockfile(dir);
  const warnings: string[] = [];
  let inputFacts: PackageFacts[];
  let basis: "lockfile" | "manifest";

  if (lockfile.status === "ok") {
    inputFacts = lockfile.facts;
    basis = "lockfile";
  } else {
    if (lockfile.status === "unsupported") {
      warnings.push(`${lockfile.reason}; scanned package.json instead`);
    }
    for (const other of await detectOtherLockfiles(dir)) {
      warnings.push(`found ${other}, which is not supported yet; scanned package.json instead`);
    }
    inputFacts = await readManifestFacts(dir);
    basis = "manifest";
  }

  const { facts, unverified } = await enrichWithRegistry(
    inputFacts,
    registryFor(options),
    enrichOptions(options),
  );
  const report = runDetectors(facts, options.detectors ?? builtinDetectors, {
    target: dir,
    ecosystem: "npm",
    unverified,
    generatedAt: timestamp(options),
  });
  return { ...report, basis, ...(warnings.length > 0 ? { warnings } : {}) };
}

/** Vets a single package spec (`name`, `name@version`, `@scope/name@version`). */
export async function checkPackage(specInput: string, options: ScanOptions = {}): Promise<Report> {
  const spec = parsePackageSpec(specInput);
  const base: PackageFacts = {
    name: spec.name,
    ...(spec.version === undefined ? {} : { version: spec.version }),
    kind: "prod",
    source: "registry",
  };
  const { facts, unverified } = await enrichWithRegistry(
    [base],
    registryFor(options),
    enrichOptions(options),
  );
  return runDetectors(facts, options.detectors ?? builtinDetectors, {
    target: specInput,
    ecosystem: "npm",
    unverified,
    generatedAt: timestamp(options),
  });
}
