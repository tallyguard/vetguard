import { readFile } from "node:fs/promises";
import path from "node:path";
import type { DependencyKind, DependencySource, PackageFacts } from "../../core/model.js";

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
  let raw: RawManifest;
  try {
    raw = JSON.parse(await readFile(manifestPath, "utf8")) as RawManifest;
  } catch (err) {
    throw new Error(
      `Could not read ${manifestPath}: ${err instanceof Error ? err.message : String(err)}`,
    );
  }

  const groups: Array<[Record<string, string> | undefined, DependencyKind]> = [
    [raw.dependencies, "prod"],
    [raw.devDependencies, "dev"],
    [raw.peerDependencies, "peer"],
    [raw.optionalDependencies, "optional"],
  ];

  const facts: PackageFacts[] = [];
  for (const [deps, kind] of groups) {
    if (!deps) continue;
    for (const [name, spec] of Object.entries(deps)) {
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
