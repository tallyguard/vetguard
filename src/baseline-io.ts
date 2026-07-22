import { writeFile } from "node:fs/promises";
import path from "node:path";
import { readTextCapped, SIZE_CAPS, FileTooLargeError } from "./util/fs.js";
import type { BaselineEntry } from "./core/model.js";

export const BASELINE_FILENAME = ".vetguard-baseline.json";
export const BASELINE_SCHEMA_VERSION = 1;

interface BaselineFile {
  schemaVersion: number;
  generatedAt: string;
  findings: BaselineEntry[];
}

/** Thrown for an unreadable/invalid baseline so the CLI can exit with a clear message. */
export class BaselineError extends Error {}

function validateEntry(entry: unknown, index: number): BaselineEntry {
  if (typeof entry !== "object" || entry === null) {
    throw new BaselineError(`${BASELINE_FILENAME} findings[${index}] must be an object`);
  }
  const { rule, package: pkg, version } = entry as Record<string, unknown>;
  if (typeof rule !== "string" || typeof pkg !== "string") {
    throw new BaselineError(
      `${BASELINE_FILENAME} findings[${index}] needs string rule and package`,
    );
  }
  if (version !== undefined && typeof version !== "string") {
    throw new BaselineError(`${BASELINE_FILENAME} findings[${index}].version must be a string`);
  }
  return { rule, package: pkg, ...(version === undefined ? {} : { version }) };
}

/**
 * Reads baseline entries from a directory. Returns undefined when there is no
 * baseline file; throws `BaselineError` when the file exists but is invalid, so
 * a corrupt baseline is never silently treated as empty (which would fail every
 * pre-existing finding).
 */
export async function readBaseline(dir: string): Promise<BaselineEntry[] | undefined> {
  const filePath = path.join(dir, BASELINE_FILENAME);
  let text: string;
  try {
    text = await readTextCapped(filePath, SIZE_CAPS.baseline);
  } catch (err) {
    if (err instanceof FileTooLargeError) throw new BaselineError(err.message);
    return undefined;
  }
  let raw: unknown;
  try {
    raw = JSON.parse(text);
  } catch (err) {
    throw new BaselineError(
      `${filePath} is not valid JSON: ${err instanceof Error ? err.message : String(err)}`,
    );
  }
  if (typeof raw !== "object" || raw === null || !Array.isArray((raw as BaselineFile).findings)) {
    throw new BaselineError(`${filePath} must be an object with a findings array`);
  }
  return (raw as BaselineFile).findings.map(validateEntry);
}

/** Writes the baseline snapshot for a directory. */
export async function writeBaseline(
  dir: string,
  findings: BaselineEntry[],
  generatedAt: string,
): Promise<string> {
  const filePath = path.join(dir, BASELINE_FILENAME);
  const file: BaselineFile = {
    schemaVersion: BASELINE_SCHEMA_VERSION,
    generatedAt,
    findings,
  };
  await writeFile(filePath, JSON.stringify(file, null, 2) + "\n", "utf8");
  return filePath;
}
