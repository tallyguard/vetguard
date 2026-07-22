import path from "node:path";
import type { DependencyKind, DependencySource, PackageFacts } from "../../core/model.js";
import { readTextCapped, SIZE_CAPS } from "../../util/fs.js";

interface RawManifest {
  dependencies?: Record<string, string>;
  devDependencies?: Record<string, string>;
  peerDependencies?: Record<string, string>;
  optionalDependencies?: Record<string, string>;
}

/**
 * Classifies a version specifier into how we can verify it. A registry range
 * is checkable against the registry; git/file/link/alias/workspace specifiers
 * are not resolvable the same way and must be reported honestly, not assumed
 * safe.
 */
export function classifySource(spec: string): DependencySource {
  if (spec.startsWith("npm:")) return "alias";
  if (spec.startsWith("file:")) return "file";
  if (spec.startsWith("link:")) return "link";
  if (spec.startsWith("workspace:")) return "workspace";
  if (
    spec.startsWith("git+") ||
    spec.startsWith("git:") ||
    spec.startsWith("github:") ||
    /^[\w-]+\/[\w.-]+$/.test(spec)
  ) {
    return "git";
  }
  if (spec.startsWith("http://") || spec.startsWith("https://")) return "unknown";
  return "registry";
}

/**
 * Reads declared dependencies from a package.json. This is manifest-level only
 * (what was asked for), not the resolved lockfile graph; the lockfile collector
 * (Phase 1) supplies resolved versions and the full transitive tree.
 */
export async function readManifestFacts(dir: string): Promise<PackageFacts[]> {
  const manifestPath = path.join(dir, "package.json");
  let raw: unknown;
  try {
    raw = JSON.parse(await readTextCapped(manifestPath, SIZE_CAPS.manifest));
  } catch (err) {
    throw new Error(
      `Could not read ${manifestPath}: ${err instanceof Error ? err.message : String(err)}`,
    );
  }
  // Scanned input is hostile: a manifest that is not a JSON object cannot be
  // read, so fail with a clear message rather than crashing on a missing field.
  if (typeof raw !== "object" || raw === null || Array.isArray(raw)) {
    throw new Error(`${manifestPath} is not a JSON object`);
  }
  const manifest = raw as RawManifest;

  const groups: Array<[unknown, string, DependencyKind]> = [
    [manifest.dependencies, "dependencies", "prod"],
    [manifest.devDependencies, "devDependencies", "dev"],
    [manifest.peerDependencies, "peerDependencies", "peer"],
    [manifest.optionalDependencies, "optionalDependencies", "optional"],
  ];

  const facts: PackageFacts[] = [];
  for (const [deps, field, kind] of groups) {
    if (deps === undefined) continue;
    // A present dependencies block that is not a plain object (array, null) is a
    // malformed manifest; fail with a clear message rather than iterating junk
    // keys like "0"/"1" or silently reporting clean.
    if (typeof deps !== "object" || deps === null || Array.isArray(deps)) {
      throw new Error(`${manifestPath} field "${field}" is not a JSON object`);
    }
    for (const [name, spec] of Object.entries(deps as Record<string, unknown>)) {
      if (typeof spec !== "string") {
        // Known dependency name, unusable version: surface it as unverifiable
        // (source "unknown" threads to the could-not-verify list) rather than
        // dropping it silently or crashing in classifySource.
        facts.push({ name, kind, source: "unknown", evidencePath: manifestPath });
        continue;
      }
      facts.push({
        name,
        requestedRange: spec,
        kind,
        source: classifySource(spec),
        evidencePath: manifestPath,
      });
    }
  }
  return facts;
}
