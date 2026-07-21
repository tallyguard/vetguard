#!/usr/bin/env node
import { parseArgs } from "node:util";
import process from "node:process";
import type { Report, Severity } from "./core/model.js";
import { scanProject, checkPackage, diffScan, type ScanOptions } from "./scan.js";
import { loadConfig, ConfigError } from "./config.js";
import { renderTerminal } from "./output/terminal.js";
import { renderJson } from "./output/json.js";
import { renderSarif } from "./output/sarif.js";
import { renderMarkdown } from "./output/markdown.js";
import { resolveExitCode } from "./output/exit-code.js";
import { VERSION } from "./index.js";

const HELP = `vetguard ${VERSION} - scan npm dependencies for AI-era supply-chain threats

Usage:
  vetguard scan [dir]        Scan a project's dependencies (defaults to cwd)
  vetguard check <pkg>       Vet a single package before installing
                             (e.g. vetguard check react-codeshift, foo@1.2.3)
  vetguard diff --base <lockfile> [--head <lockfile>]
                             Scan only the dependencies a change introduces
                             (head defaults to ./package-lock.json)
  vetguard --help            Show this help
  vetguard --version         Show version

Options:
  --offline                  Do not contact the registry; unverifiable facts
                             are reported as "could not verify", never "safe".
  --json                     Print the report as JSON.
  --sarif                    Print SARIF 2.1.0 for GitHub code scanning.
  --markdown                 Print compact markdown for a PR comment or summary.
  --fail-on <severity>       Exit non-zero only when a finding at or above this
                             severity exists (critical|high|medium|low|info).
                             Default: any finding exits non-zero.

vetguard never executes the code it scans. When it cannot verify something it
says so rather than calling it safe.`;

const SEVERITIES: Severity[] = ["critical", "high", "medium", "low", "info"];

interface RunOptions {
  offline: boolean;
  json: boolean;
  sarif: boolean;
  markdown: boolean;
  failOn: Severity | undefined;
}

async function main(argv: string[]): Promise<number> {
  const { values, positionals } = parseArgs({
    args: argv,
    allowPositionals: true,
    options: {
      help: { type: "boolean", short: "h" },
      version: { type: "boolean", short: "v" },
      offline: { type: "boolean" },
      json: { type: "boolean" },
      sarif: { type: "boolean" },
      markdown: { type: "boolean" },
      "fail-on": { type: "string" },
      base: { type: "string" },
      head: { type: "string" },
    },
  });

  if (values.version) {
    console.log(VERSION);
    return 0;
  }

  const command = positionals[0];
  if (values.help || command === undefined || command === "help") {
    console.log(HELP);
    return 0;
  }

  const failOnRaw = values["fail-on"];
  if (failOnRaw !== undefined && !SEVERITIES.includes(failOnRaw as Severity)) {
    console.error(`Invalid --fail-on value: ${failOnRaw} (expected ${SEVERITIES.join(", ")})`);
    return 2;
  }

  const options: RunOptions = {
    offline: values.offline === true,
    json: values.json === true,
    sarif: values.sarif === true,
    markdown: values.markdown === true,
    failOn: failOnRaw as Severity | undefined,
  };

  if (command === "scan") {
    const dir = positionals[1] ?? process.cwd();
    return runReport(dir, options, (opts) => scanProject(dir, opts));
  }
  if (command === "check") {
    const spec = positionals[1];
    if (spec === undefined) {
      console.error("check requires a package name, e.g. vetguard check express\n");
      console.error(HELP);
      return 2;
    }
    return runReport(process.cwd(), options, (opts) => checkPackage(spec, opts));
  }
  if (command === "diff") {
    if (values.base === undefined) {
      console.error("diff requires --base <lockfile> (the base package-lock.json)\n");
      console.error(HELP);
      return 2;
    }
    const head = values.head ?? "package-lock.json";
    return runReport(process.cwd(), options, (opts) => diffScan(values.base as string, head, opts));
  }

  console.error(`Unknown command: ${command}\n`);
  console.error(HELP);
  return 2;
}

/**
 * Loads config from `configDir`, merges it under the CLI flags (flags win),
 * then produces and renders the report. A config-file error exits 2 rather
 * than scanning with a half-understood configuration.
 */
async function runReport(
  configDir: string,
  cli: RunOptions,
  produce: (options: ScanOptions) => Promise<Report>,
): Promise<number> {
  let config;
  try {
    config = await loadConfig(configDir);
  } catch (err) {
    if (err instanceof ConfigError) {
      console.error(err.message);
      return 2;
    }
    throw err;
  }

  const offline = cli.offline || config?.offline === true;
  const failOn = cli.failOn ?? config?.failOn;
  const scanOptions: ScanOptions = {
    offline,
    ...(config?.ignore ? { ignore: config.ignore } : {}),
  };

  let report: Report;
  try {
    report = await produce(scanOptions);
  } catch (err) {
    console.error(err instanceof Error ? err.message : String(err));
    return 2;
  }
  console.log(render(report, cli));
  return resolveExitCode(report, failOn);
}

function render(report: Report, options: RunOptions): string {
  if (options.sarif) return renderSarif(report, VERSION);
  if (options.markdown) return renderMarkdown(report);
  if (options.json) return renderJson(report, VERSION);
  return renderTerminal(report);
}

main(process.argv.slice(2))
  .then((code) => process.exit(code))
  .catch((err) => {
    console.error(err instanceof Error ? err.stack : String(err));
    process.exit(2);
  });
