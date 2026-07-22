import { readFile, stat } from "node:fs/promises";

/**
 * Thrown when a file exceeds its read cap. Distinct so callers can degrade
 * honestly (an oversize manifest or lockfile is hostile input, not a valid one).
 */
export class FileTooLargeError extends Error {}

/** Byte caps for the files vetguard reads. A scanned tree is untrusted input. */
export const SIZE_CAPS = {
  manifest: 8 * 1024 * 1024, // package.json
  lockfile: 128 * 1024 * 1024, // package-lock.json (large monorepos are legitimately big)
  config: 1 * 1024 * 1024, // vetguard.config.json
  baseline: 16 * 1024 * 1024, // .vetguard-baseline.json
} as const;

/** Reads a UTF-8 file, refusing (with FileTooLargeError) anything over `maxBytes`. */
export async function readTextCapped(filePath: string, maxBytes: number): Promise<string> {
  const info = await stat(filePath);
  if (info.size > maxBytes) {
    throw new FileTooLargeError(`${filePath} is ${info.size} bytes, over the ${maxBytes}-byte cap`);
  }
  return readFile(filePath, "utf8");
}

/** Network body cap: reject a response whose Content-Length exceeds this before parsing. */
export const NETWORK_BODY_CAP = 64 * 1024 * 1024;

/**
 * Whether a response advertises a body over `maxBytes` via Content-Length. A
 * missing/invalid header (or a response without headers) returns false (best
 * effort; a chunked body without a length is not byte-capped here, a documented
 * follow-up).
 */
export function contentLengthOver(
  res: { headers?: { get(name: string): string | null } | null },
  maxBytes: number,
): boolean {
  const raw = res.headers?.get("content-length") ?? null;
  if (raw === null) return false;
  const len = Number(raw);
  return Number.isFinite(len) && len > maxBytes;
}
