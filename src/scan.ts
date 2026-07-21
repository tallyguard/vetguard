import { runDetectors } from "./core/engine.js";
import { builtinDetectors } from "./core/rules/index.js";
import type { Detector, IgnoreRule, PackageFacts, Report } from "./core/model.js";
import { introducedFacts } from "./core/diff.js";
import { readManifestFacts } from "./ecosystems/npm/manifest.js";
import { readLockfile, readLockfileFile, detectOtherLockfiles } from "./ecosystems/npm/lockfile.js";
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
  /** Suppressions from config; matched findings are reported but do not affect the verdict. */
  ignore?: readonly IgnoreRule[];
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

function reportContext(options: ScanOptions, target: string, unverified: string[]) {
  return {
    target,
    ecosystem: "npm" as const,
    unverified,
    generatedAt: timestamp(options),
    ...(options.ignore === undefined ? {} : { ignore: options.ignore }),
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
  const report = runDetectors(
    facts,
    options.detectors ?? builtinDetectors,
    reportContext(options, dir, unverified),
  );
  return { ...report, basis, ...(warnings.length > 0 ? { warnings } : {}) };
}

/**
 * Scans only the dependencies a change introduces: those present in the head
 * lockfile but not the base (a new name, a new version, or a downgrade). Both
 * must be package-lock v2/v3; an absent or unsupported lockfile on either side
 * throws, because a partial diff would silently under-report. This is the
 * highest-signal moment, a dependency entering a pull request.
 */
export async function diffScan(
  basePath: string,
  headPath: string,
  options: ScanOptions = {},
): Promise<Report> {
  const base = await readLockfileFile(basePath);
  if (base.status !== "ok") {
    throw new Error(`base lockfile ${basePath}: ${lockfileProblem(base)}`);
  }
  const head = await readLockfileFile(headPath);
  if (head.status !== "ok") {
    throw new Error(`head lockfile ${headPath}: ${lockfileProblem(head)}`);
  }

  const introduced = introducedFacts(base.facts, head.facts);
  const { facts, unverified } = await enrichWithRegistry(
    introduced,
    registryFor(options),
    enrichOptions(options),
  );
  const report = runDetectors(
    facts,
    options.detectors ?? builtinDetectors,
    reportContext(options, `${basePath}..${headPath}`, unverified),
  );
  return { ...report, basis: "lockfile" };
}

function lockfileProblem(
  outcome: { status: "unsupported"; reason: string } | { status: "absent" },
): string {
  return outcome.status === "unsupported" ? outcome.reason : "file not found";
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
  return runDetectors(
    facts,
    options.detectors ?? builtinDetectors,
    reportContext(options, specInput, unverified),
  );
}
