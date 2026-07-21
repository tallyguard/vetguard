import type { Report } from "../core/model.js";

/** Bumped when the JSON shape changes in a way consumers must adapt to. */
export const JSON_SCHEMA_VERSION = 1;

/** Renders a report as stable, machine-readable JSON for CI and tooling. */
export function renderJson(report: Report, toolVersion: string): string {
  return JSON.stringify(
    { tool: "vetguard", version: toolVersion, schemaVersion: JSON_SCHEMA_VERSION, ...report },
    null,
    2,
  );
}
