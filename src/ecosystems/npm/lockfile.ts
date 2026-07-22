import { readFile, access } from "node:fs/promises";
import path from "node:path";
import type { DependencyKind, DependencySource, PackageFacts } from "../../core/model.js";

const REGISTRY_HOST = "registry.npmjs.org";

const OTHER_LOCKFILES = ["yarn.lock", "pnpm-lock.yaml", "bun.lockb"];

/** Names of non-npm lockfiles present in `dir`, so the caller can warn instead of silently skipping. */
export async function detectOtherLockfiles(dir: string): Promise<string[]> {
  const present: string[] = [];
  for (const file of OTHER_LOCKFILES) {
    try {
      await access(path.join(dir, file));
      present.push(file);
    } catch {
      continue;
    }
  }
  return present;
}

interface LockEntry {
  version?: string;
  resolved?: string;
  integrity?: string;
  dev?: boolean;
  optional?: boolean;
  link?: boolean;
  hasInstallScript?: boolean;
}

interface LockfileDocument {
  lockfileVersion?: number;
  packages?: Record<string, LockEntry>;
}

export type LockfileOutcome =
  | { status: "ok"; facts: PackageFacts[]; lockfileVersion: number }
  | { status: "unsupported"; reason: string }
  | { status: "absent" };

/** Extracts the package name from a lockfile path key, handling nesting and scopes. */
export function nameFromLockPath(lockPath: string): string | undefined {
  const marker = "node_modules/";
  const idx = lockPath.lastIndexOf(marker);
  if (idx === -1) return undefined;
  const name = lockPath.slice(idx + marker.length);
  return name.length > 0 ? name : undefined;
}

function sourceFromEntry(entry: LockEntry): DependencySource {
  if (entry.link) return "link";
  const resolved = entry.resolved;
  // Untrusted lockfile: a non-string `resolved` cannot be classified.
  if (typeof resolved !== "string") return "unknown";
  if (resolved.startsWith("git+") || resolved.startsWith("git:")) return "git";
  if (resolved.startsWith("file:")) return "file";
  if (resolved.includes(REGISTRY_HOST)) return "registry";
  return "unknown";
}

function kindFromEntry(entry: LockEntry): DependencyKind {
  if (entry.dev) return "dev";
  if (entry.optional) return "optional";
  return "prod";
}

/**
 * Reads resolved dependency facts from a specific package-lock.json file (v2 or
 * v3). Returns `absent` when the file is missing and `unsupported` for a shape
 * we do not parse (v1, or a missing `packages` map), so the caller can fall
 * back or report rather than silently skipping.
 */
export async function readLockfileFile(lockPath: string): Promise<LockfileOutcome> {
  let text: string;
  try {
    text = await readFile(lockPath, "utf8");
  } catch {
    return { status: "absent" };
  }

  let doc: unknown;
  try {
    doc = JSON.parse(text);
  } catch (err) {
    return {
      status: "unsupported",
      reason: `${lockPath} is not valid JSON: ${err instanceof Error ? err.message : String(err)}`,
    };
  }
  // Untrusted input: anything but a JSON object is an unsupported shape, not a crash.
  if (typeof doc !== "object" || doc === null || Array.isArray(doc)) {
    return { status: "unsupported", reason: `${lockPath} is not a JSON object` };
  }
  const document = doc as LockfileDocument;

  const version = typeof document.lockfileVersion === "number" ? document.lockfileVersion : 0;
  const packages = document.packages;
  if (typeof packages !== "object" || packages === null || Array.isArray(packages) || version < 2) {
    return {
      status: "unsupported",
      reason: `package-lock lockfileVersion ${version} is not supported (need v2 or v3)`,
    };
  }

  const seen = new Set<string>();
  const facts: PackageFacts[] = [];
  for (const [lockPathKey, rawEntry] of Object.entries(packages as Record<string, unknown>)) {
    // Skip a malformed entry (null, array, non-object) rather than crashing on its fields.
    if (typeof rawEntry !== "object" || rawEntry === null || Array.isArray(rawEntry)) continue;
    const entry = rawEntry as LockEntry;
    const name = nameFromLockPath(lockPathKey);
    if (!name || typeof entry.version !== "string" || entry.version.length === 0) continue;

    const dedupeKey = `${name}@${entry.version}`;
    if (seen.has(dedupeKey)) continue;
    seen.add(dedupeKey);

    facts.push({
      name,
      version: entry.version,
      kind: kindFromEntry(entry),
      source: sourceFromEntry(entry),
      hasInstallScript: entry.hasInstallScript === true,
      ...(typeof entry.resolved === "string" ? { resolvedUrl: entry.resolved } : {}),
      ...(typeof entry.integrity === "string" ? { integrity: entry.integrity } : {}),
      evidencePath: `${lockPath} (${lockPathKey})`,
    });
  }

  return { status: "ok", facts, lockfileVersion: version };
}

/** Reads the `package-lock.json` in a project directory. */
export async function readLockfile(dir: string): Promise<LockfileOutcome> {
  return readLockfileFile(path.join(dir, "package-lock.json"));
}
