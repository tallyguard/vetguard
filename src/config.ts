import path from "node:path";
import { readTextCapped, SIZE_CAPS, FileTooLargeError } from "./util/fs.js";
import type { IgnoreRule, Severity } from "./core/model.js";
import { SEVERITY_ORDER } from "./core/model.js";

export const CONFIG_FILENAME = "vetguard.config.json";

export interface Config {
  failOn?: Severity;
  offline?: boolean;
  ignore?: IgnoreRule[];
}

/** Thrown for an invalid config so the CLI can exit with a clear message. */
export class ConfigError extends Error {}

function isSeverity(value: unknown): value is Severity {
  return typeof value === "string" && value in SEVERITY_ORDER;
}

function validateIgnore(entry: unknown, index: number): IgnoreRule {
  if (typeof entry !== "object" || entry === null) {
    throw new ConfigError(`ignore[${index}] must be an object`);
  }
  const { rule, package: pkg, reason } = entry as Record<string, unknown>;
  if (typeof rule !== "string" || rule.length === 0) {
    throw new ConfigError(`ignore[${index}].rule is required (the detector id to suppress)`);
  }
  if (typeof pkg !== "string" || pkg.length === 0) {
    throw new ConfigError(`ignore[${index}].package is required (the package name to suppress)`);
  }
  if (typeof reason !== "string" || reason.trim().length === 0) {
    throw new ConfigError(
      `ignore[${index}].reason is required and must be non-empty (${rule} on ${pkg}); a suppression must be explained`,
    );
  }
  return { rule, package: pkg, reason };
}

function validate(raw: unknown): Config {
  if (typeof raw !== "object" || raw === null) {
    throw new ConfigError(`${CONFIG_FILENAME} must contain a JSON object`);
  }
  const obj = raw as Record<string, unknown>;
  const config: Config = {};

  if (obj.failOn !== undefined) {
    if (!isSeverity(obj.failOn)) {
      throw new ConfigError(`failOn must be one of ${Object.keys(SEVERITY_ORDER).join(", ")}`);
    }
    config.failOn = obj.failOn;
  }
  if (obj.offline !== undefined) {
    if (typeof obj.offline !== "boolean") throw new ConfigError("offline must be a boolean");
    config.offline = obj.offline;
  }
  if (obj.ignore !== undefined) {
    if (!Array.isArray(obj.ignore)) throw new ConfigError("ignore must be an array");
    config.ignore = obj.ignore.map(validateIgnore);
  }
  return config;
}

/**
 * Loads `vetguard.config.json` from a directory. Returns undefined when there
 * is no config file; throws `ConfigError` when the file exists but is invalid,
 * so a malformed config (or an ignore missing its reason) fails loudly.
 */
export async function loadConfig(dir: string): Promise<Config | undefined> {
  const configPath = path.join(dir, CONFIG_FILENAME);
  let text: string;
  try {
    text = await readTextCapped(configPath, SIZE_CAPS.config);
  } catch (err) {
    if (err instanceof FileTooLargeError) throw new ConfigError(err.message);
    return undefined;
  }
  let raw: unknown;
  try {
    raw = JSON.parse(text);
  } catch (err) {
    throw new ConfigError(
      `${configPath} is not valid JSON: ${err instanceof Error ? err.message : String(err)}`,
    );
  }
  return validate(raw);
}
